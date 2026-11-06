import type {
  ContextEvaluationInput,
  ContextExclusionDirectives,
  ContextPlan,
  ContextSources,
  SourceState,
  ToolName,
} from './context-selector.interface';

export class ContextSelectorService {
  private readonly logger = {
    log: (msg: string) => {},
    warn: (msg: string) => {},
    error: (msg: string) => {},
  };

  /**
   * Evalúa la consulta del usuario y la intención clasificada para determinar
   * un ContextPlan puro, determinista y trazable.
   */
  evaluate(input: ContextEvaluationInput): ContextPlan {
    const rawMessage = input.userMessage ?? '';
    const trimmed = rawMessage.trim();
    const normalized = this.normalize(trimmed);
    const intent = (input.classifiedIntent || 'LOCAL').toUpperCase();
    const intentConfidence = input.intentConfidence || 'low';
    const hasHistory = input.hasActiveSessionHistory ?? false;

    // ── 0. Caso Borde: Mensaje Vacío o en Blanco ──────────────────────────────
    if (trimmed.length === 0) {
      return {
        sources: {
          memory: 'UNNEEDED',
          conversationHistory: hasHistory ? 'SELECTED' : 'UNNEEDED',
          rag: 'UNNEEDED',
          web: 'UNNEEDED',
          tools: 'UNNEEDED',
        },
        toolStates: {
          math: 'UNNEEDED',
          sports: 'UNNEEDED',
          gmail: 'UNNEEDED',
        },
        activeTools: [],
        exclusions: {
          excludeDocuments: false,
          excludeWeb: false,
          excludeMemory: false,
          matchedDirectives: [],
        },
        ambiguity: {
          isAmbiguous: true,
          confidence: 'high',
          contextConfidence: 'high',
          conflicts: [],
          reason: 'EMPTY_MESSAGE',
        },
        policyReason: 'EMPTY_INPUT_NO_CONTEXT_NEEDED',
        suggestedAction: 'LLM',
      };
    }

    // ── 1. Detección de Exclusiones Explícitas del Usuario (Prioridad 0) ──────
    const exclusions = this.detectExclusions(normalized);
    const toolExclusions = this.detectToolExclusions(normalized);

    // ── 2. Detección de Señales de Solicitud Explícita ─────────────────────────
    const explicitRagRequested = this.isExplicitDocumentRequest(normalized);
    const explicitWebRequested = this.isExplicitWebRequest(normalized);
    const explicitMemoryRequested = this.isExplicitMemoryRequest(normalized);
    const explicitCodeRequested = this.isExplicitCodeRequest(normalized);
    const explicitMathRequested = this.isExplicitMathRequest(normalized);
    const explicitSportsRequested = this.isExplicitSportsRequest(normalized);
    const explicitGmailAccountAction = this.isExplicitGmailAccountAction(normalized);
    const hasExplanationSignal = this.hasExplanationRequest(normalized);

    // ── 3. Detección de Consultas Conceptuales / Teóricas ─────────────────────
    const isConceptualOrGeneral = this.isConceptualOrTheoretical(normalized);

    // ── 4. Resolución de Ambigüedad, Contradicciones y Confianza Contextual ────
    const conflicts: string[] = [];

    // Contradicción: pedir documentos y a la vez excluirlos
    if (explicitRagRequested && exclusions.excludeDocuments) {
      conflicts.push('CONTRADICTION_RAG_REQUESTED_BUT_EXPLICITLY_EXCLUDED');
    }

    // Contradicción: pedir web y a la vez excluirla
    if (explicitWebRequested && exclusions.excludeWeb) {
      conflicts.push('CONTRADICTION_WEB_REQUESTED_BUT_EXPLICITLY_EXCLUDED');
    }

    // Contradicciones en herramientas
    if (explicitMathRequested && toolExclusions.math) {
      conflicts.push('CONTRADICTION_MATH_REQUESTED_BUT_EXCLUDED');
    }
    if (explicitSportsRequested && toolExclusions.sports) {
      conflicts.push('CONTRADICTION_SPORTS_REQUESTED_BUT_EXCLUDED');
    }
    if (explicitGmailAccountAction && toolExclusions.gmail) {
      conflicts.push('CONTRADICTION_GMAIL_REQUESTED_BUT_EXCLUDED');
    }

    // Mensaje ultra-corto o confuso
    const isTooShort = trimmed.length < 3 && !/^(si|no|ok)$/i.test(trimmed);
    const isAmbiguous = conflicts.length > 0 || isTooShort;
    const ambiguityReason: string | undefined =
      conflicts.length > 0
        ? conflicts[0]
        : isTooShort
          ? 'QUERY_TOO_SHORT_UNCERTAIN'
          : undefined;

    // Cálculo independiente de confianza contextual:
    // - LOW: Contradicciones directas o incertidumbre severa
    // - HIGH: Directivas unívocas explícitas sin conflictos
    // - MEDIUM: Decisión basada exclusivamente en heurísticas
    const hasExplicitDirectives =
      explicitRagRequested ||
      explicitWebRequested ||
      explicitMemoryRequested ||
      exclusions.matchedDirectives.length > 0 ||
      Boolean(toolExclusions.math || toolExclusions.sports || toolExclusions.gmail);

    let contextConfidence: 'high' | 'medium' | 'low';
    if (isAmbiguous || conflicts.length > 0) {
      contextConfidence = 'low';
    } else if (hasExplicitDirectives) {
      contextConfidence = 'high';
    } else {
      contextConfidence = 'medium';
    }

    // ── 5. Resolución de Fuentes Independientes ──────────────────────────────

    // 5.1. Historial Conversacional Inmediato (conversationHistory)
    const conversationHistory: SourceState =
      hasHistory || this.isFollowUpQuery(normalized) ? 'SELECTED' : 'UNNEEDED';

    // 5.2. Memoria Persistente a Largo Plazo (memory)
    let memory: SourceState = 'UNNEEDED';
    if (exclusions.excludeMemory) {
      memory = 'EXCLUDED';
    } else if (explicitMemoryRequested) {
      memory = 'REQUESTED';
    } else if (isConceptualOrGeneral || explicitCodeRequested || explicitMathRequested) {
      memory = 'UNNEEDED';
    } else if (intent === 'LOCAL' && hasHistory) {
      memory = 'SELECTED';
    }

    // 5.3. RAG Documental (rag)
    let rag: SourceState = 'UNNEEDED';
    if (exclusions.excludeDocuments) {
      rag = 'EXCLUDED'; // Prioridad absoluta: directiva negativa del usuario
    } else if (explicitRagRequested) {
      rag = 'REQUESTED';
    } else if (
      isConceptualOrGeneral ||
      explicitCodeRequested ||
      explicitMathRequested ||
      this.isAutobiographicalMemoryRequest(normalized)
    ) {
      rag = 'UNNEEDED';
    } else if (intent === 'RAG' && intentConfidence === 'high') {
      rag = 'SELECTED';
    }

    // 5.4. Búsqueda Web (web)
    let web: SourceState = 'UNNEEDED';
    if (exclusions.excludeWeb) {
      web = 'EXCLUDED';
    } else if (explicitWebRequested) {
      web = 'REQUESTED';
    } else if (explicitSportsRequested) {
      web = 'SELECTED';
    } else if (intent === 'WEB' && !isConceptualOrGeneral && !explicitCodeRequested) {
      web = 'SELECTED';
    }

    // 5.5. Herramientas Deterministas Granulares (toolStates y activeTools)
    const toolStates: Partial<Record<ToolName, SourceState>> = {
      math: 'UNNEEDED',
      sports: 'UNNEEDED',
      gmail: 'UNNEEDED',
    };

    if (toolExclusions.math) {
      toolStates.math = 'EXCLUDED';
    } else if (explicitMathRequested && !hasExplanationSignal) {
      toolStates.math = 'SELECTED';
    }

    if (toolExclusions.sports) {
      toolStates.sports = 'EXCLUDED';
    } else if (explicitSportsRequested) {
      toolStates.sports = 'SELECTED';
    }

    if (toolExclusions.gmail) {
      toolStates.gmail = 'EXCLUDED';
    } else if (explicitGmailAccountAction && !explicitCodeRequested) {
      toolStates.gmail = 'SELECTED';
    }

    // Regla Mandatoria: activeTools se deriva estrictamente de toolStates
    const activeTools: ToolName[] = (Object.keys(toolStates) as ToolName[]).filter(
      (tool) => toolStates[tool] === 'SELECTED' || toolStates[tool] === 'REQUESTED',
    );

    // Estado agregado de tools para retrocompatibilidad
    let tools: SourceState = 'UNNEEDED';
    if (activeTools.length > 0) {
      tools = 'SELECTED';
    } else if (
      (explicitMathRequested && toolStates.math === 'EXCLUDED') ||
      (explicitSportsRequested && toolStates.sports === 'EXCLUDED') ||
      (explicitGmailAccountAction && toolStates.gmail === 'EXCLUDED')
    ) {
      tools = 'EXCLUDED';
    }

    // ── 6. Determinación de la Acción Sugerida (suggestedAction) ──────────────
    // ADV-01: La exclusión de una fuente (ej. web) NO debe degradar la acción sugerida
    // de otra fuente que fue explícitamente solicitada (ej. rag).
    let suggestedAction: ContextPlan['suggestedAction'] = 'LLM';

    if (rag === 'REQUESTED' && web === 'REQUESTED') {
      suggestedAction = 'HYBRID_SEARCH';
    } else if (rag === 'REQUESTED') {
      suggestedAction = 'RAG_SEARCH';
    } else if (activeTools.length > 0) {
      suggestedAction = 'TOOL';
    } else if (web === 'REQUESTED' || (web === 'SELECTED' && activeTools.length === 0)) {
      suggestedAction = 'WEB_SEARCH';
    } else if (rag === 'SELECTED') {
      suggestedAction = 'RAG_SEARCH';
    } else {
      suggestedAction = 'LLM';
    }

    // ── 7. Determinación de la Razón de Política (policyReason) ───────────────
    let policyReason = 'STANDARD_EVALUATION';

    if (conflicts.length > 0) {
      policyReason = 'CONTRADICTION_RESOLVED_NEGATIVE_PRECEDENCE';
    } else if (exclusions.excludeDocuments && exclusions.excludeWeb) {
      policyReason = 'USER_EXCLUSION_DOCUMENTS_AND_WEB';
    } else if (exclusions.excludeDocuments) {
      policyReason = 'USER_EXCLUSION_DOCUMENTS';
    } else if (exclusions.excludeWeb) {
      policyReason = 'USER_EXCLUSION_WEB';
    } else if (exclusions.excludeMemory) {
      policyReason = 'USER_EXCLUSION_MEMORY';
    } else if (rag === 'REQUESTED' && web === 'REQUESTED') {
      policyReason = 'MULTISOURCE_COMPARISON_RAG_AND_WEB';
    } else if (rag === 'REQUESTED') {
      policyReason = 'EXPLICIT_DOCUMENT_RETRIEVAL';
    } else if (web === 'REQUESTED' || (web === 'SELECTED' && activeTools.length === 0)) {
      policyReason = 'EXPLICIT_WEB_SEARCH';
    } else if (explicitCodeRequested) {
      policyReason = 'PURE_CODE_GENERATION';
    } else if (explicitMathRequested && hasExplanationSignal) {
      policyReason = 'ARITHMETIC_EXPLANATION';
    } else if (activeTools.includes('math')) {
      policyReason = 'DIRECT_MATH_CALCULATION';
    } else if (activeTools.includes('sports')) {
      policyReason = 'SPORTS_RESULT_QUERY';
    } else if (activeTools.includes('gmail')) {
      policyReason = 'GMAIL_ACCOUNT_ACTION';
    } else if (isConceptualOrGeneral) {
      policyReason = 'CONCEPTUAL_LOCAL_KNOWLEDGE';
    } else if (explicitMemoryRequested) {
      policyReason = 'PERSONAL_IDENTITY_AND_MEMORY_QUERY';
    }

    const sources: ContextSources = {
      memory,
      conversationHistory,
      rag,
      web,
      tools,
    };

    return {
      sources,
      toolStates,
      activeTools,
      exclusions,
      ambiguity: {
        isAmbiguous,
        confidence: contextConfidence,
        contextConfidence,
        conflicts,
        reason: ambiguityReason,
      },
      policyReason,
      suggestedAction,
    };
  }

  // ── Métodos de Detección Léxica y Semántica ─────────────────────────────────

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private detectExclusions(n: string): ContextExclusionDirectives {
    const matched: string[] = [];

    // Exclusión de documentos / biblioteca / corpus / archivos / libros / textos / RAG
    // Captura variantes imperativas y preposicionales negativas:
    // - no uses mis documentos / libros / textos
    // - sin consultar la biblioteca / archivos / textos
    // - sin usar documentos / mis textos
    // - no accedas al corpus
    // - no revises archivos
    // - desactiva el rag / sin rag
    // - bajo ningun concepto uses la biblioteca
    // Evita falsos positivos como: "cómo usar documentos en TypeScript", "¿qué documentos necesito?"
    const docExclusionPattern =
      /(?:no\s+(?:uses?|consultes?|leas?|revises?|accedas?(?:\s+a|\s+al)?|busques?\s+(?:en|el))\s*(?:la\s+|los\s+|mis\s+|mi\s+|el\s+)?(?:documentos?|biblioteca|corpus|archivos?|pdfs?|libros?|textos?)|sin\s+(?:consultar|usar|leer|revisar|mirar|acceder(?:\s+a|\s+al)?)?\s*(?:la\s+|los\s+|mis\s+|mi\s+|el\s+)?(?:documentos?|biblioteca|corpus|archivos?|pdfs?|libros?|textos?)|ni\s+(?:usar\s+|consultar\s+)?(?:documentos?|biblioteca|corpus|archivos?|pdfs?|libros?|textos?)|bajo\s+ningun\s+concepto\s+uses\s+(?:la\s+|los\s+|mis\s+|mi\s+|el\s+)?(?:documentos?|biblioteca|corpus|archivos?|pdfs?|libros?|textos?)|sin\s+rag|(?:desactiva(?:r)?|apaga(?:r)?|no\s+uses?)\s+(?:el\s+)?rag|solo\s+con\s+tu\s+conocimiento)/i;
    const matchDoc = n.match(docExclusionPattern);
    if (matchDoc) matched.push(matchDoc[0]);

    // Exclusión de internet / búsqueda web
    const webExclusionPattern =
      /(?:sin\s+(?:usar\s+|consultar\s+)?(?:internet|la\s+web|google)|no\s+(?:busques?|navegues?|uses?)\s+(?:en\s+)?(?:internet|la\s+web|google)|ni\s+(?:usar\s+)?(?:internet|la\s+web|google)|bajo\s+ningun\s+concepto\s+uses\s+(?:la\s+web|internet)|offline|modo\s+offline|desconectado)/i;
    const matchWeb = n.match(webExclusionPattern);
    if (matchWeb) matched.push(matchWeb[0]);

    // Exclusión de memoria persistente
    const memExclusionPattern =
      /(?:sin\s+(?:usar\s+|consultar\s+)?(?:mi\s+)?memoria|no\s+(?:uses?|recuerdes?)\s+(?:mis\s+)?recuerdos?|ni\s+(?:usar\s+)?(?:mi\s+)?memoria|olvida\s+(?:mis\s+datos|lo\s+anterior|de\s+mi)|sin\s+historial\s+personal)/i;
    const matchMem = n.match(memExclusionPattern);
    if (matchMem) matched.push(matchMem[0]);

    return {
      excludeDocuments: Boolean(matchDoc),
      excludeWeb: Boolean(matchWeb),
      excludeMemory: Boolean(matchMem),
      matchedDirectives: matched,
    };
  }

  private detectToolExclusions(n: string): Partial<Record<ToolName, boolean>> {
    const mathExcluded =
      /(?:no\s+uses?\s+(?:la\s+)?calculadora|sin\s+calculadora|sin\s+matematica)/i.test(n);
    const sportsExcluded =
      /(?:no\s+(?:busques?|mires?|revises?)\s+(?:deportes|futbol|partidos)|sin\s+deportes|sin\s+futbol)/i.test(
        n,
      );
    const gmailExcluded =
      /(?:no\s+(?:revises?|uses?|abras?)\s+(?:mis\s+)?(?:correos?|emails?|mails?|gmail|bandeja)|sin\s+(?:usar\s+)?(?:gmail|correos?|bandeja))/i.test(
        n,
      );

    return {
      math: mathExcluded,
      sports: sportsExcluded,
      gmail: gmailExcluded,
    };
  }

    private isExplicitDocumentRequest(n: string): boolean {
    // 1. Verbos directos de recuperación hacia el repositorio personal (busca, consulta, revisa, mira, fijate)
    const hasRetrievalAction =
      /(?:(?:busca(?:r)?|consulta(?:r)?|revisa(?:r)?|fijate|mira(?:r)?)\s+(?:en|el|los|las|mis|mi)\s+(?:mis\s+|mi\s+|los\s+|la\s+|el\s+)?(?:documentos?|biblioteca|archivos?|pdfs?|notas?|libros?|textos?|apuntes|coleccion))/i.test(
        n,
      );

    // 2. Cláusulas atributivas de fuentes guardadas (según mis libros, de acuerdo a mis textos guardados)
    const hasSourceAttribution =
      /(?:segun\s+(?:mis\s+|mi\s+|los\s+|el\s+)?(?:documentos?|archivos?|textos?|apuntes|libros?|obras?)(?:\s+(?:que\s+tengo\s+)?guardados?)?|de\s+acuerdo\s+(?:a|con)\s+(?:mis\s+|los\s+)?(?:documentos?|textos?|libros?|archivos?)(?:\s+guardados?)?)/i.test(
        n,
      );

    // 3. Preguntas sobre contenidos de libros/autores o textos personales ("¿qué dice el libro?", "¿qué explican mis textos?")
    const hasContentInquiry =
      /(?:que\s+(?:dicen?|explican?|sostienen?|afirman?|mencionan?|figuran?\s+en)\s+(?:el\s+libro|el\s+documento|el\s+texto|el\s+kybalion|muldoon|carrington|monroe|ziewe|mis\s+(?:libros?|documentos?|textos?|archivos?)))/i.test(
        n,
      );

    // 4. Locución posesiva explícita de ubicación en el corpus ("en mi biblioteca", "en mis documentos", "en mis libros", "en mi colección de libros")
    const hasPossessiveCorpusLocation =
      /(?:en\s+(?:mi\s+biblioteca|mis\s+documentos?|mis\s+libros?|mis\s+archivos?|mis\s+textos?|mis\s+pdfs?|mi\s+coleccion\s+de\s+libros?))/i.test(
        n,
      );

    // 5. Búsqueda de capítulos o secciones específicas
    const hasChapterSearch =
      /(?:(?:busca|consulta|revisa)\s+(?:el\s+capitulo|la\s+seccion|el\s+documento|el\s+libro|el\s+archivo)\s+sobre|si\s+busca\s+en\s+mis\s+documentos?)/i.test(
        n,
      );

    // 6. Consultas de conocimiento almacenado ("¿qué sabes sobre X en mis documentos?")
    const hasStoredKnowledgeQuery =
      /(?:que\s+sabes\s+(?:sobre|de)\s+.*\s+en\s+mis\s+documentos?)/i.test(n);

    return (
      hasRetrievalAction ||
      hasSourceAttribution ||
      hasContentInquiry ||
      hasPossessiveCorpusLocation ||
      hasChapterSearch ||
      hasStoredKnowledgeQuery
    );
  }

  private isExplicitWebRequest(n: string): boolean {
    return /(?:busca(?:r)?\s+(?:.*?\s+)?en\s+(?:internet|la\s+web|google)|googlea(?:r)?|que\s+(?:ocurrio|paso)\s+hoy|noticias\s+(?:de\s+hoy|recientes|actuales)|cotizacion\s+(?:del\s+)?(?:dolar|euro)|precio\s+actual\s+de)/i.test(
      n,
    );
  }

  private isExplicitMemoryRequest(n: string): boolean {
    return (
      /(?:quien\s+soy|que\s+sabes\s+(?:sobre|de)\s+mi|mi\s+lenguaje\s+favorito|te\s+acordas\s+de\s+mi|como\s+me\s+llamo|mis\s+proyectos\s+personales)/i.test(
        n,
      ) || this.isAutobiographicalMemoryRequest(n)
    );
  }

  private isAutobiographicalMemoryRequest(n: string): boolean {
    return /(?:que\s+(?:hablamos|conversamos|discutimos|investigamos|probamos|decidimos|acordamos|concluimos)|que\s+estuvimos\s+(?:investigando|hablando|probando|discutiendo)|cuando\s+(?:hablamos|conversamos|discutimos|investigamos|mencionamos|tratamos)|como\s+evoluciono\s+nuestra\s+(?:evaluacion|opinion|arquitectura|investigacion|idea)|en\s+nuestras?\s+(?:conversaciones|sesiones)\s+(?:anteriores|previas|pasadas)|tenemos\s+registros?\s+de\s+haber\s+hablado)/i.test(
      n,
    );
  }

  private isExplicitCodeRequest(n: string): boolean {
    return /(?:escribi(?:r)?\s+(?:una\s+)?funcion|crea(?:r)?\s+(?:un\s+)?script|codigo\s+(?:en\s+)?(?:typescript|javascript|python|java|c#|rust|go)|algoritmo\s+(?:para|de)|validar\s+(?:un\s+)?(?:email|correo|fecha|cuit|dni)|(?:sintaxis|regex|expresion\s+regular)\s+(?:de\s+validacion|para|de)|refactoriza(?:r)?|implementa(?:r)?\s+(?:una\s+)?clase|typescript|javascript|python)/i.test(
      n,
    );
  }

  private isExplicitMathRequest(n: string): boolean {
    const hasTimeContext =
      /(?:a\s+que\s+hora|que\s+hora\s+sera|cuanto\s+tiempo|duracion|comienza\s+a\s+las|terminara)/i.test(n) &&
      /\d{1,2}:\d{2}/.test(n);
    return (
      hasTimeContext ||
      /(?:cuanto\s+es\s+\d+|calcula(?:r|me)?\s+|raiz\s+cuadrada|logaritmo\s+en\s+base|\d+\s*[\+\-\*\/]\s*\d+)/i.test(
        n,
      )
    );
  }

  private isExplicitSportsRequest(n: string): boolean {
    const hasSportAction =
      /(?:partido|fixture|tabla\s+de\s+posiciones|campeonato|copa\s+libertadores|champions\s+league|mundial)/i.test(
        n,
      );
    const hasMatchContext =
      /(?:resultado|marcador|goles?|quien\s+gano|jugaron)\s+(?:del?\s+|de\s+los?\s+|entre\s+)?(?:partido|clasico|boca|river|argentina|seleccion|[a-z]+\s+fc)/i.test(
        n,
      );
    return hasSportAction || hasMatchContext;
  }

  private isExplicitGmailAccountAction(n: string): boolean {
    // 1. Excluir consultas de desarrollo / programación
    const isCodeOrTheoretical =
      /(?:sintaxis|regex|expresion\s+regular|funcion|validar|rfc\s*5322|protocolo|smtp|imap|pop3|typescript|javascript|python)/i.test(
        n,
      );
    if (isCodeOrTheoretical) return false;

    // 2. Excluir copywriting puro / redacción creativa que no instruye operar sobre el buzón
    const isPureCopywriting =
      /(?:redacta(?:me|r)?|escribi(?:me|r)?|mejora(?:r)?|corregi(?:r)?)\s+(?:un\s+|este\s+)?(?:email|correo|mail|mensaje)\s+(?:para|a|felicitando)/i.test(
        n,
      ) && !/(?:en\s+(?:mi\s+)?(?:gmail|cuenta|bandeja)|guarda(?:r)?|envia(?:r)?)/i.test(n);
    if (isPureCopywriting) return false;

    // 3. Operaciones de lectura y búsqueda en buzón
    const isMailboxSearchOrRead =
      /(?:revisa(?:r)?\s+(?:mi\s+)?(?:bandeja|inbox|correo|email|gmail|casilla)|busca(?:r)?\s+(?:mis\s+|los\s+|el\s+ultimo\s+)?(?:correos?|emails?|mails?)|lee(?:r)?\s+(?:mis\s+|el\s+ultimo\s+)?(?:correos?|emails?|mails?)|tengo\s+(?:correos?|emails?)\s+(?:nuevos?|sin\s+leer))/i.test(
        n,
      );

    // 4. Operación de envío real
    const isMailSendAction =
      /(?:envia(?:r)?|manda(?:r)?)\s+(?:este\s+|un\s+)?(?:email|correo|mail)\s+(?:a|para)\s+/i.test(
        n,
      );

    // 5. Creación de borrador dentro de la cuenta
    const isAccountDraftCreation =
      /(?:crea(?:r)?|guarda(?:r)?)\s+(?:un\s+)?borrador\s+en\s+(?:mi\s+)?(?:gmail|cuenta|inbox|bandeja|correo)/i.test(
        n,
      );

    return isMailboxSearchOrRead || isMailSendAction || isAccountDraftCreation;
  }

  private isConceptualOrTheoretical(n: string): boolean {
    return (
      /(?:que\s+es\s+(?:un\s+|una\s+|el\s+|la\s+|los\s+|las\s+)?|en\s+que\s+consiste|explicame\s+(?:que\s+es|como\s+funciona|el\s+significado|la\s+diferencia)|que\s+significa\s+complejidad|diferencia\s+entre\s+\w+\s+y\s+\w+|como\s+funciona\s+(?:el\s+|la\s+)?|por\s+que\s+(?:se\s+produce|ocurre)|definicion\s+de)/i.test(
        n,
      ) &&
      !this.isExplicitDocumentRequest(n)
    );
  }

  private hasExplanationRequest(n: string): boolean {
    return /(?:explica(?:r)?|explicame|paso\s+a\s+paso|desarrolla|por\s+que|fundamenta)/i.test(n);
  }

  private isFollowUpQuery(n: string): boolean {
    return /^(?:y\s+que\s+mas|ademas|por\s+que|entonces|que\s+dijiste|como\s+era|continua|segui|dale|repetimelo)/i.test(
      n,
    );
  }
}
