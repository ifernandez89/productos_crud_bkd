import type {
  ContextEvaluationInput,
  ContextExclusionDirectives,
  ContextPlan,
  ContextSources,
  SourceState,
} from './context-selector.interface.ts';

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
          reason: 'EMPTY_MESSAGE',
        },
        policyReason: 'EMPTY_INPUT_NO_CONTEXT_NEEDED',
        suggestedAction: 'LLM',
      };
    }

    // ── 1. Detección de Exclusiones Explícitas del Usuario (Prioridad 0) ──────
    const exclusions = this.detectExclusions(normalized);

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

    // ── 4. Resolución de Ambigüedad y Contradicciones ────────────────────────
    let isAmbiguous = false;
    let ambiguityReason: string | undefined = undefined;

    // Contradicción: pedir documentos y a la vez excluirlos
    if (explicitRagRequested && exclusions.excludeDocuments) {
      isAmbiguous = true;
      ambiguityReason = 'CONTRADICTION_RAG_REQUESTED_BUT_EXPLICITLY_EXCLUDED';
    }

    // Contradicción: pedir web y a la vez excluirla
    if (explicitWebRequested && exclusions.excludeWeb) {
      isAmbiguous = true;
      ambiguityReason = 'CONTRADICTION_WEB_REQUESTED_BUT_EXPLICITLY_EXCLUDED';
    }

    // Mensaje ultra-corto o confuso
    if (trimmed.length < 3 && !/^(si|no|ok)$/i.test(trimmed)) {
      isAmbiguous = true;
      ambiguityReason = 'QUERY_TOO_SHORT_UNCERTAIN';
    }

    // ── 5. Resolución de Fuentes Independientes ──────────────────────────────

    // 5.1. Historial Conversacional Inmediato (conversationHistory)
    // Siempre permitido salvo que el usuario pida reinicio explícito de sesión.
    const conversationHistory: SourceState = hasHistory || this.isFollowUpQuery(normalized)
      ? 'SELECTED'
      : 'UNNEEDED';

    // 5.2. Memoria Persistente a Largo Plazo (memory)
    let memory: SourceState = 'UNNEEDED';
    if (exclusions.excludeMemory) {
      memory = 'EXCLUDED';
    } else if (explicitMemoryRequested) {
      memory = 'REQUESTED';
    } else if (isConceptualOrGeneral || explicitCodeRequested || explicitMathRequested) {
      // Las consultas técnicas conceptuales o matemáticas no necesitan hurgar en recuerdos personales
      memory = 'UNNEEDED';
    } else if (intent === 'LOCAL' && hasHistory) {
      // Contexto conversacional general puede enriquecerse si no fue excluida
      memory = 'SELECTED';
    }

    // 5.3. RAG Documental (rag)
    let rag: SourceState = 'UNNEEDED';
    if (exclusions.excludeDocuments) {
      rag = 'EXCLUDED'; // Prioridad absoluta: directiva negativa del usuario
    } else if (explicitRagRequested) {
      rag = 'REQUESTED';
    } else if (isConceptualOrGeneral || explicitCodeRequested || explicitMathRequested) {
      // Conceptos generales de software, algoritmos o matemáticas: NUNCA RAG ciego
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

    // 5.5. Herramientas Deterministas (tools)
    let tools: SourceState = 'UNNEEDED';
    const activeTools: string[] = [];

    if (explicitMathRequested && !hasExplanationSignal) {
      tools = 'SELECTED';
      activeTools.push('math');
    }

    if (explicitSportsRequested) {
      tools = 'SELECTED';
      activeTools.push('sports');
    }

    // GMAIL: Únicamente si es una acción real sobre la cuenta o bandeja, NUNCA por hablar de código o sintaxis
    if (explicitGmailAccountAction && !explicitCodeRequested) {
      tools = 'SELECTED';
      activeTools.push('gmail');
    }

    // ── 6. Determinación de la Razón de Política (policyReason) ───────────────
    let policyReason = 'STANDARD_EVALUATION';
    let suggestedAction: ContextPlan['suggestedAction'] = 'LLM';

    if (exclusions.matchedDirectives.length > 0) {
      if (rag === 'EXCLUDED' && explicitRagRequested) {
        policyReason = 'CONTRADICTION_RESOLVED_NEGATIVE_PRECEDENCE';
      } else if (rag === 'EXCLUDED' && web === 'EXCLUDED') {
        policyReason = 'USER_EXCLUSION_DOCUMENTS_AND_WEB';
      } else if (rag === 'EXCLUDED') {
        policyReason = 'USER_EXCLUSION_DOCUMENTS';
      } else if (web === 'EXCLUDED') {
        policyReason = 'USER_EXCLUSION_WEB';
      } else if (memory === 'EXCLUDED') {
        policyReason = 'USER_EXCLUSION_MEMORY';
      }
    } else if (rag === 'REQUESTED' && web === 'REQUESTED') {
      policyReason = 'MULTISOURCE_COMPARISON_RAG_AND_WEB';
      suggestedAction = 'HYBRID_SEARCH';
    } else if (rag === 'REQUESTED') {
      policyReason = 'EXPLICIT_DOCUMENT_RETRIEVAL';
      suggestedAction = 'RAG_SEARCH';
    } else if (web === 'REQUESTED' || (web === 'SELECTED' && activeTools.length === 0)) {
      policyReason = 'EXPLICIT_WEB_SEARCH';
      suggestedAction = 'WEB_SEARCH';
    } else if (explicitCodeRequested) {
      policyReason = 'PURE_CODE_GENERATION';
      suggestedAction = 'LLM';
    } else if (explicitMathRequested && hasExplanationSignal) {
      policyReason = 'ARITHMETIC_EXPLANATION';
      suggestedAction = 'LLM';
    } else if (activeTools.includes('math')) {
      policyReason = 'DIRECT_MATH_CALCULATION';
      suggestedAction = 'TOOL';
    } else if (activeTools.includes('sports')) {
      policyReason = 'SPORTS_RESULT_QUERY';
      suggestedAction = 'TOOL';
    } else if (activeTools.includes('gmail')) {
      policyReason = 'GMAIL_ACCOUNT_ACTION';
      suggestedAction = 'TOOL';
    } else if (isConceptualOrGeneral) {
      policyReason = 'CONCEPTUAL_LOCAL_KNOWLEDGE';
      suggestedAction = 'LLM';
    } else if (explicitMemoryRequested) {
      policyReason = 'PERSONAL_IDENTITY_AND_MEMORY_QUERY';
      suggestedAction = 'LLM';
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
      activeTools,
      exclusions,
      ambiguity: {
        isAmbiguous,
        confidence: isAmbiguous ? 'low' : intentConfidence,
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

    // Exclusión de documentos / biblioteca / RAG
    const docExclusionPattern =
      /(?:sin\s+(?:consultar\s+)?(?:documentos?|biblioteca|archivos?|pdfs?)|no\s+(?:uses?|consultes?|leas?|revises?)\s+(?:la\s+|los\s+|mis\s+|mi\s+)?(?:biblioteca|documentos?|archivos?|pdfs?)|ni\s+(?:documentos?|biblioteca|archivos?|pdfs?)|sin\s+rag|solo\s+con\s+tu\s+conocimiento)/i;
    const matchDoc = n.match(docExclusionPattern);
    if (matchDoc) matched.push(matchDoc[0]);

    // Exclusión de internet / búsqueda web
    const webExclusionPattern =
      /(?:sin\s+(?:usar\s+|consultar\s+)?(?:internet|la\s+web|google)|no\s+(?:busques?|navegues?)\s+en\s+(?:internet|la\s+web|google)|ni\s+(?:usar\s+)?(?:internet|la\s+web|google)|offline|modo\s+offline|desconectado)/i;
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

  private isExplicitDocumentRequest(n: string): boolean {
    return /(?:busca\s+en\s+(?:mis\s+|mi\s+|los\s+|la\s+|el\s+)?(?:documentos|biblioteca|archivos|pdfs|notas)|segun\s+(?:mis\s+|mi\s+|los\s+|el\s+)?(?:documentos|archivos|textos|apuntes|libro)|que\s+dice\s+(?:el\s+libro|el\s+documento|el\s+texto|muldoon|carrington|monroe|ziewe)|busca\s+(?:el\s+documento|el\s+libro|el\s+archivo)\s+sobre)/i.test(
      n,
    );
  }

  private isExplicitWebRequest(n: string): boolean {
    return /(?:busca(?:r)?\s+en\s+(?:internet|la\s+web|google)|googlea(?:r)?|noticias\s+(?:de\s+hoy|recientes|actuales)|cotizacion\s+(?:del\s+)?(?:dolar|euro)|precio\s+actual\s+de)/i.test(
      n,
    );
  }

  private isExplicitMemoryRequest(n: string): boolean {
    return /(?:quien\s+soy|que\s+sabes\s+(?:sobre|de)\s+mi|mi\s+lenguaje\s+favorito|te\s+acordas\s+de\s+mi|como\s+me\s+llamo|mis\s+proyectos\s+personales)/i.test(
      n,
    );
  }

  private isExplicitCodeRequest(n: string): boolean {
    return /(?:escribi(?:r)?\s+(?:una\s+)?funcion|crea(?:r)?\s+(?:un\s+)?script|codigo\s+(?:en\s+)?(?:typescript|javascript|python|java|c#|rust|go)|algoritmo\s+(?:para|de)|validar\s+(?:un\s+)?(?:email|correo|fecha|cuit|dni)|(?:sintaxis|regex|expresion\s+regular)\s+(?:de\s+validacion|para|de)|refactoriza(?:r)?|implementa(?:r)?\s+(?:una\s+)?clase|typescript|javascript|python)/i.test(
      n,
    );
  }

  private isExplicitMathRequest(n: string): boolean {
    return /(?:cuanto\s+es\s+\d+|calcula(?:r)?\s+|raiz\s+cuadrada|logaritmo\s+en\s+base|\d+\s*[\+\-\*\/]\s*\d+)/i.test(
      n,
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
    // Exclusivamente operaciones reales sobre la cuenta de Gmail
    const isOperationOnMailbox =
      /(?:revisa(?:r)?\s+(?:mi\s+)?(?:bandeja|inbox|correo|email|gmail)|busca(?:r)?\s+(?:mis\s+|los\s+)?(?:correos?|emails?|mails?|mensajes?)|lee(?:r)?\s+(?:mis\s+)?(?:correos?|emails?|mails?)|tengo\s+(?:correos?|emails?)\s+(?:nuevos?|sin\s+leer)|enviar\s+(?:un\s+)?(?:email|correo|mail)\s+a\s+\S+@\S+|redacta(?:r)?\s+(?:un\s+)?(?:borrador|draft|email|correo)\s+(?:para|a)\s+)/i.test(
        n,
      );
    // Excluir preguntas teóricas, gramaticales o de programación sobre emails
    const isTheoreticalEmail =
      /(?:sintaxis|regex|expresion\s+regular|funcion|validar|rfc\s*5322|como\s+funciona\s+el\s+protocolo|formato\s+de\s+un\s+email)/i.test(
        n,
      );

    return isOperationOnMailbox && !isTheoreticalEmail;
  }

  private isConceptualOrTheoretical(n: string): boolean {
    return (
      /(?:que\s+es\s+(?:un\s+|una\s+|el\s+|la\s+|los\s+|las\s+)?|en\s+que\s+consiste|explicame\s+(?:que\s+es|como\s+funciona|el\s+significado|la\s+diferencia)|que\s+significa\s+complejidad|diferencia\s+entre\s+\w+\s+y\s+\w+|como\s+funciona\s+(?:el\s+|la\s+)?|por\s+que\s+(?:se\s+produce|ocurre)|definicion\s+de)/i.test(
        n,
      ) &&
      !/(?:busca\s+en\s+mis\s+documentos|segun\s+el\s+libro|en\s+mi\s+biblioteca)/i.test(n)
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
