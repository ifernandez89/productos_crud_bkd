import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ContextSelectorService } from './context-selector.service.ts';

describe('ContextSelectorService (JCA-001 — Misión 4)', () => {
  let service: ContextSelectorService;

  beforeEach(() => {
    service = new ContextSelectorService();
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 1: 20 PRUEBAS ORIGINALES (CAPA 1 BASE)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Par A: Conceptual vs. Documental (Embeddings)', () => {
    it('Caso A1: "¿Qué es un embedding?" debe ser conceptual, RAG innecesario', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué es un embedding?',
        classifiedIntent: 'LOCAL',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'CONCEPTUAL_LOCAL_KNOWLEDGE');
      assert.strictEqual(plan.suggestedAction, 'LLM');
      assert.strictEqual(plan.exclusions.excludeDocuments, false);
    });

    it('Caso A2: "Busca en mis documentos qué es un embedding" debe activar RAG explícito', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos qué es un embedding',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'EXPLICIT_DOCUMENT_RETRIEVAL');
      assert.strictEqual(plan.suggestedAction, 'RAG_SEARCH');
    });
  });

  describe('Par B: Matemática vs. Deportes (Colisión con "resultado")', () => {
    it('Caso B1: "¿Cuánto es 2+2? Explicá el resultado" no debe activar deportes ni RAG', () => {
      const plan = service.evaluate({
        userMessage: '¿Cuánto es 2 + 2? Explicá el resultado',
        classifiedIntent: 'SPORTS', // Simulando falso positivo del router
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('sports'), false);
      assert.strictEqual(plan.policyReason, 'ARITHMETIC_EXPLANATION');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('Caso B2: "¿Cuál fue el resultado del partido entre Boca y River?" debe activar deportes', () => {
      const plan = service.evaluate({
        userMessage: '¿Cuál fue el resultado del partido entre Boca y River?',
        classifiedIntent: 'SPORTS',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('sports'), true);
      assert.strictEqual(plan.policyReason, 'SPORTS_RESULT_QUERY');
      assert.strictEqual(plan.suggestedAction, 'TOOL');
    });
  });

  describe('Par C: Programación/Sintaxis vs. Operación de Gmail', () => {
    it('Caso C1: "Explícame la sintaxis de un email en TypeScript" es código, NO Gmail', () => {
      const plan = service.evaluate({
        userMessage: 'Explícame la sintaxis de validación de un email en TypeScript',
        classifiedIntent: 'GMAIL', // Simulando falso positivo del router
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.tools, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.policyReason, 'PURE_CODE_GENERATION');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('Caso C2: "Busca mis emails de hoy sobre la reunión" es acción legítima de Gmail', () => {
      const plan = service.evaluate({
        userMessage: 'Busca mis emails de hoy sobre la reunión',
        classifiedIntent: 'GMAIL',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.tools, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('gmail'), true);
      assert.strictEqual(plan.policyReason, 'GMAIL_ACCOUNT_ACTION');
      assert.strictEqual(plan.suggestedAction, 'TOOL');
    });
  });

  describe('Par D: Algoritmos teóricos vs. Documento específico', () => {
    it('Caso D1: "¿Qué significa complejidad O(n log n)?" es conceptual, RAG innecesario', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué significa complejidad O(n log n)?',
        classifiedIntent: 'LOCAL',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.length, 0);
      assert.strictEqual(plan.policyReason, 'CONCEPTUAL_LOCAL_KNOWLEDGE');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('Caso D2: "Busca el documento sobre algoritmos en mi biblioteca" debe solicitar RAG', () => {
      const plan = service.evaluate({
        userMessage: 'Busca el documento sobre algoritmos en mi biblioteca',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'EXPLICIT_DOCUMENT_RETRIEVAL');
      assert.strictEqual(plan.suggestedAction, 'RAG_SEARCH');
    });
  });

  describe('Par E: Búsqueda documental con y sin internet', () => {
    it('Caso E1: "Busca en mi biblioteca sobre el cuerpo astral" es RAG sin web', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mi biblioteca sobre el cuerpo astral',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.exclusions.excludeWeb, false);
      assert.strictEqual(plan.policyReason, 'EXPLICIT_DOCUMENT_RETRIEVAL');
    });

    it('Caso E2: "Busca en mi biblioteca sobre el cuerpo astral, pero sin internet" excluye web activamente', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mi biblioteca sobre el cuerpo astral, pero sin internet',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeWeb, true);
      assert.strictEqual(plan.policyReason, 'USER_EXCLUSION_WEB');
    });
  });

  describe('Par F: Solicitud documental contradicha por exclusión explícita', () => {
    it('Caso F1: "Busca en mi biblioteca, pero no consultes documentos" da precedencia al bloqueo', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mi biblioteca, pero no consultes documentos',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
      assert.strictEqual(plan.ambiguity.isAmbiguous, true);
      assert.strictEqual(plan.policyReason, 'CONTRADICTION_RESOLVED_NEGATIVE_PRECEDENCE');
    });
  });

  describe('Casos de Borde y Entradas Extremas', () => {
    it('debe manejar mensaje vacío de forma segura sin excepciones', () => {
      const plan = service.evaluate({ userMessage: '   ' });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
      assert.strictEqual(plan.sources.memory, 'UNNEEDED');
      assert.strictEqual(plan.ambiguity.isAmbiguous, true);
      assert.strictEqual(plan.policyReason, 'EMPTY_INPUT_NO_CONTEXT_NEEDED');
    });

    it('debe marcar ambigüedad en mensajes ultra-cortos no convencionales', () => {
      const plan = service.evaluate({ userMessage: 'x' });
      assert.strictEqual(plan.ambiguity.isAmbiguous, true);
      assert.strictEqual(plan.ambiguity.confidence, 'low');
    });

    it('debe permitir confirmaciones conversacionales breves ("ok", "si")', () => {
      const plan = service.evaluate({ userMessage: 'ok', hasActiveSessionHistory: true });
      assert.strictEqual(plan.sources.conversationHistory, 'SELECTED');
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
    });
  });

  describe('Separación estricta entre Memoria Persistente e Historial Conversacional', () => {
    it('"Olvida mis datos de memoria, pero sigue la conversación" excluye memoria persistente pero mantiene historial', () => {
      const plan = service.evaluate({
        userMessage: 'Sin usar memoria, continúa con lo que decías',
        hasActiveSessionHistory: true,
      });

      assert.strictEqual(plan.sources.memory, 'EXCLUDED');
      assert.strictEqual(plan.sources.conversationHistory, 'SELECTED');
      assert.strictEqual(plan.exclusions.excludeMemory, true);
      assert.strictEqual(plan.policyReason, 'USER_EXCLUSION_MEMORY');
    });

    it('Consulta de identidad personal solicita memoria persistente', () => {
      const plan = service.evaluate({
        userMessage: '¿Te acordás de mí y de cuál es mi lenguaje favorito?',
      });

      assert.strictEqual(plan.sources.memory, 'REQUESTED');
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'PERSONAL_IDENTITY_AND_MEMORY_QUERY');
    });
  });

  describe('Consultas Multi-Fuente (RAG + Web Combinadas)', () => {
    it('debe admitir solicitud combinada de biblioteca y web para contrastación', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en internet y busca en mis notas sobre transformers para comparar',
      });

      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'REQUESTED');
      assert.strictEqual(plan.suggestedAction, 'HYBRID_SEARCH');
      assert.strictEqual(plan.policyReason, 'MULTISOURCE_COMPARISON_RAG_AND_WEB');
    });
  });

  describe('Exclusiones Múltiples Combinadas', () => {
    it('debe registrar y aplicar múltiples exclusiones simultáneas ("sin documentos ni internet")', () => {
      const plan = service.evaluate({
        userMessage: 'Explicame qué es la fotosíntesis, sin documentos ni internet',
      });

      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.sources.web, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
      assert.strictEqual(plan.exclusions.excludeWeb, true);
      assert.strictEqual(plan.policyReason, 'USER_EXCLUSION_DOCUMENTS_AND_WEB');
    });
  });

  describe('Inmunidad frente a Enrutadores Erráticos (Router Discrepancies)', () => {
    it('Corrige falso positivo de RAG cuando la consulta es conceptual pura', () => {
      const plan = service.evaluate({
        userMessage: 'Explicame qué es un token en modelos de lenguaje',
        classifiedIntent: 'RAG', // Router confundido
        intentConfidence: 'medium',
      });

      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'CONCEPTUAL_LOCAL_KNOWLEDGE');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('Corrige falso positivo de GMAIL en solicitud de función de validación de email', () => {
      const plan = service.evaluate({
        userMessage: 'Escribí una función en TypeScript para validar un email con regex',
        classifiedIntent: 'GMAIL', // Router confundido por la palabra "email"
      });

      assert.strictEqual(plan.sources.tools, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.policyReason, 'PURE_CODE_GENERATION');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 2: CORRECCIÓN ADV-01 (PREVALENCIA DE FUENTES INDEPENDIENTES)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Misión 4: ADV-01 Precedencia y Aislamiento de Exclusiones', () => {
    it('Caso obligatorio ADV-01: Exclusión de Web no debe degradar RAG explícito', () => {
      const plan = service.evaluate({
        userMessage: 'No busques en internet, pero sí busca en mis documentos sobre embeddings',
        classifiedIntent: 'RAG',
      });

      assert.strictEqual(plan.sources.web, 'EXCLUDED', 'Web debe estar excluida');
      assert.strictEqual(plan.sources.rag, 'REQUESTED', 'RAG debe estar solicitado');
      assert.strictEqual(plan.suggestedAction, 'RAG_SEARCH', 'Acción debe ser RAG_SEARCH, no LLM');
      assert.strictEqual(plan.exclusions.excludeWeb, true);
      assert.strictEqual(plan.exclusions.excludeDocuments, false);
    });

    it('Exclusión de RAG no debe degradar Web explícita', () => {
      const plan = service.evaluate({
        userMessage: 'No consultes mis documentos, pero busca en la web el precio del dólar',
        classifiedIntent: 'WEB',
      });

      assert.strictEqual(plan.sources.rag, 'EXCLUDED', 'RAG debe estar excluido');
      assert.strictEqual(plan.sources.web, 'REQUESTED', 'Web debe estar solicitada');
      assert.strictEqual(plan.suggestedAction, 'WEB_SEARCH', 'Acción debe ser WEB_SEARCH');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 3: CORRECCIÓN ADV-03 (DIRECTIVAS NEGATIVAS Y PREVENCIÓN DE FALSOS POSITIVOS)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Misión 4: ADV-03 Variantes de Exclusión Documental y Falsos Positivos', () => {
    it('Detecta variante: "no uses mis documentos"', () => {
      const plan = service.evaluate({
        userMessage: 'Explicame qué es un transformer, pero no uses mis documentos',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('Detecta variante: "sin consultar la biblioteca"', () => {
      const plan = service.evaluate({
        userMessage: 'Sin consultar la biblioteca, decime qué es la recursión',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('Detecta variante: "sin usar documentos"', () => {
      const plan = service.evaluate({
        userMessage: 'Sin usar documentos, explicame la teoría de la relatividad',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('Detecta variante: "no accedas al corpus"', () => {
      const plan = service.evaluate({
        userMessage: 'No accedas al corpus, responde con tu conocimiento base',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('Detecta variante: "no revises archivos"', () => {
      const plan = service.evaluate({
        userMessage: 'No revises archivos ni documentos para esta respuesta',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('FALSO POSITIVO PREVENIDO: "Explicame cómo usar documentos en TypeScript"', () => {
      const plan = service.evaluate({
        userMessage: 'Explicame cómo usar documentos en TypeScript',
        classifiedIntent: 'LOCAL',
      });
      assert.strictEqual(plan.exclusions.excludeDocuments, false, 'No debe confundir el tema con una directiva de exclusión');
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
    });

    it('FALSO POSITIVO PREVENIDO: "¿Qué documentos necesito para crear una API?"', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué documentos necesito para crear una API en NestJS?',
        classifiedIntent: 'LOCAL',
      });
      assert.strictEqual(plan.exclusions.excludeDocuments, false);
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
    });

    it('FALSO POSITIVO PREVENIDO: "Cómo organizar archivos en Linux"', () => {
      const plan = service.evaluate({
        userMessage: 'Cómo organizar archivos en Linux eficientemente',
        classifiedIntent: 'LOCAL',
      });
      assert.strictEqual(plan.exclusions.excludeDocuments, false);
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 4: CORRECCIÓN ADV-06 (REDACCIÓN VS. OPERACIÓN GMAIL)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Misión 4: ADV-06 Redacción de Correo vs. Operación de Cuenta Gmail', () => {
    it('Redacción pura 1: "Redactame un email para Carlos"', () => {
      const plan = service.evaluate({
        userMessage: 'Redactame un email para Carlos explicándole las demoras',
        classifiedIntent: 'GMAIL', // Router confundido
      });
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.suggestedAction, 'LLM');
      assert.strictEqual(plan.policyReason, 'STANDARD_EVALUATION');
    });

    it('Redacción pura 2: "Mejorá este correo"', () => {
      const plan = service.evaluate({
        userMessage: 'Mejorá este correo para que suene más formal y profesional',
        classifiedIntent: 'LOCAL',
      });
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('Redacción pura 3: "¿Cómo valido emails con TypeScript?"', () => {
      const plan = service.evaluate({
        userMessage: '¿Cómo valido emails con TypeScript usando class-validator?',
        classifiedIntent: 'GMAIL',
      });
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.suggestedAction, 'LLM');
      assert.strictEqual(plan.policyReason, 'PURE_CODE_GENERATION');
    });

    it('Operación Gmail 1: "Buscá el último correo de Carlos"', () => {
      const plan = service.evaluate({
        userMessage: 'Buscá el último correo de Carlos en mi casilla',
        classifiedIntent: 'GMAIL',
      });
      assert.strictEqual(plan.toolStates.gmail, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('gmail'), true);
      assert.strictEqual(plan.suggestedAction, 'TOOL');
      assert.strictEqual(plan.policyReason, 'GMAIL_ACCOUNT_ACTION');
    });

    it('Operación Gmail 2: "Enviá este correo a Carlos"', () => {
      const plan = service.evaluate({
        userMessage: 'Enviá este correo a Carlos con asunto Confirmación',
        classifiedIntent: 'GMAIL',
      });
      assert.strictEqual(plan.toolStates.gmail, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('gmail'), true);
      assert.strictEqual(plan.suggestedAction, 'TOOL');
      assert.strictEqual(plan.policyReason, 'GMAIL_ACCOUNT_ACTION');
    });

    it('Operación Gmail 3: "Creá un borrador en mi Gmail"', () => {
      const plan = service.evaluate({
        userMessage: 'Creá un borrador en mi Gmail con este texto',
        classifiedIntent: 'GMAIL',
      });
      assert.strictEqual(plan.toolStates.gmail, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('gmail'), true);
      assert.strictEqual(plan.suggestedAction, 'TOOL');
      assert.strictEqual(plan.policyReason, 'GMAIL_ACCOUNT_ACTION');
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 5: GRANULARIDAD DE HERRAMIENTAS (toolStates y activeTools)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Misión 4: Granularidad de Herramientas y Derivación Estricta', () => {
    it('Herramientas mixtas: Math seleccionada y Gmail excluida', () => {
      const plan = service.evaluate({
        userMessage: 'Calculá 25 * 4 pero no revises mis correos',
      });
      assert.strictEqual(plan.toolStates.math, 'SELECTED');
      assert.strictEqual(plan.toolStates.gmail, 'EXCLUDED');
      assert.strictEqual(plan.activeTools.includes('math'), true);
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.sources.tools, 'SELECTED', 'El estado agregado debe ser SELECTED si al menos una está activa');
      assert.strictEqual(plan.suggestedAction, 'TOOL');
    });

    it('Herramienta excluida no aparece en activeTools', () => {
      const plan = service.evaluate({
        userMessage: 'No uses la calculadora para sumar 2 + 2',
      });
      assert.strictEqual(plan.toolStates.math, 'EXCLUDED');
      assert.strictEqual(plan.activeTools.includes('math'), false);
      assert.strictEqual(plan.sources.tools, 'EXCLUDED');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('activeTools se deriva estrictamente de toolStates sin duplicados', () => {
      const plan = service.evaluate({
        userMessage: 'Calculá 10 * 20 y busca el partido de Boca',
      });
      const derived = Object.keys(plan.toolStates).filter(
        (t) => plan.toolStates[t as keyof typeof plan.toolStates] === 'SELECTED',
      );
      assert.deepStrictEqual(plan.activeTools.sort(), derived.sort());
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 6: CONFIANZA CONTEXTUAL INDEPENDIENTE (contextConfidence)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Misión 4: Confianza Contextual Desacoplada y Detección de Conflictos', () => {
    it('Contradicción explícita asigna contextConfidence: "low" y reporta conflicto', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos pero no uses documentos',
      });
      assert.strictEqual(plan.ambiguity.contextConfidence, 'low');
      assert.strictEqual(plan.ambiguity.isAmbiguous, true);
      assert.strictEqual(plan.ambiguity.conflicts.length > 0, true);
      assert.strictEqual(
        plan.ambiguity.conflicts[0],
        'CONTRADICTION_RAG_REQUESTED_BUT_EXPLICITLY_EXCLUDED',
      );
    });

    it('Decisión puramente heurística asigna contextConfidence: "medium"', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué es una red convolucional?',
        classifiedIntent: 'LOCAL',
        intentConfidence: 'high', // Aunque el router diga high
      });
      assert.strictEqual(plan.ambiguity.contextConfidence, 'medium', 'Debe ser medium al ser puramente heurística sin directivas');
      assert.strictEqual(plan.ambiguity.conflicts.length, 0);
    });

    it('Directiva explícita no contradictoria asigna contextConfidence: "high"', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos el libro de Muldoon',
        classifiedIntent: 'LOCAL',
        intentConfidence: 'low', // Aunque el router diga low
      });
      assert.strictEqual(plan.ambiguity.contextConfidence, 'high', 'Debe ser high por directiva explícita directa');
      assert.strictEqual(plan.ambiguity.conflicts.length, 0);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SECCIÓN 7: BATERÍA ADVERSARIAL COMPLETA (ADV-01 a ADV-17)
  // ════════════════════════════════════════════════════════════════════════════

  describe('Batería Adversarial de Robustez (17 Casos)', () => {
    it('ADV-01: Contraste de exclusión Web con RAG solicitado', () => {
      const plan = service.evaluate({
        userMessage: 'No busques en internet, pero sí busca en mis documentos sobre embeddings',
      });
      assert.strictEqual(plan.sources.web, 'EXCLUDED');
      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.suggestedAction, 'RAG_SEARCH');
    });

    it('ADV-02: Búsqueda en biblioteca con exclusión estricta de internet', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en la biblioteca, pero bajo ningún concepto uses la web ni internet',
      });
      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.sources.web, 'EXCLUDED');
    });

    it('ADV-03: Exclusión RAG con consulta web autorizada', () => {
      const plan = service.evaluate({
        userMessage: 'Sin usar documentos, busca en internet el último resultado de la Champions',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.sources.web, 'REQUESTED');
      assert.strictEqual(plan.suggestedAction, 'WEB_SEARCH');
    });

    it('ADV-04: Combinación Math + Sports', () => {
      const plan = service.evaluate({
        userMessage: 'Calculá 15 * 8 y decime el resultado del partido de Boca',
      });
      assert.strictEqual(plan.sources.tools, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('math'), true);
      assert.strictEqual(plan.activeTools.includes('sports'), true);
    });

    it('ADV-05: Consulta con exclusión de web', () => {
      const plan = service.evaluate({
        userMessage: '¿Qué clima hace hoy, pero sin internet?',
      });
      assert.strictEqual(plan.sources.web, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeWeb, true);
    });

    it('ADV-06: Creación de borrador en cuenta Gmail', () => {
      const plan = service.evaluate({
        userMessage: 'Creá un borrador en mi Gmail con el asunto Reunión de Proyecto',
      });
      assert.strictEqual(plan.toolStates.gmail, 'SELECTED');
      assert.strictEqual(plan.activeTools.includes('gmail'), true);
      assert.strictEqual(plan.suggestedAction, 'TOOL');
    });

    it('ADV-07: Consulta matemática pura frente a falso positivo RAG del router', () => {
      const plan = service.evaluate({
        userMessage: 'Calculá 50 * 20',
        classifiedIntent: 'RAG',
        intentConfidence: 'high',
      });
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('math'), true);
      assert.strictEqual(plan.suggestedAction, 'TOOL');
    });

    it('ADV-08: Petición documental explícita frente a LOCAL del router', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos el libro de Muldoon',
        classifiedIntent: 'LOCAL',
        intentConfidence: 'high',
      });
      assert.strictEqual(plan.sources.rag, 'REQUESTED');
      assert.strictEqual(plan.suggestedAction, 'RAG_SEARCH');
    });

    it('ADV-09: Consulta conceptual SMTP frente a GMAIL del router', () => {
      const plan = service.evaluate({
        userMessage: 'Explícame cómo funciona el protocolo SMTP y el formato de un email según el RFC 5322',
        classifiedIntent: 'GMAIL',
        intentConfidence: 'high',
      });
      assert.strictEqual(plan.sources.tools, 'UNNEEDED');
      assert.strictEqual(plan.activeTools.includes('gmail'), false);
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('ADV-10: Invarianza ante mayúsculas agresivas', () => {
      const plan = service.evaluate({
        userMessage: '¿¿¿QUE ES UN EMBEDDING???',
      });
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.suggestedAction, 'LLM');
    });

    it('ADV-11: Invarianza ante signos combinados y directiva de exclusión', () => {
      const plan = service.evaluate({
        userMessage: 'explicame.... que es un token!!!! sin documentos, por favor',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.exclusions.excludeDocuments, true);
    });

    it('ADV-12: Invarianza ante espacios y saltos de línea extremos', () => {
      const plan = service.evaluate({
        userMessage: '  \n\t ¿Qué es un embedding? \t\n  ',
      });
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.policyReason, 'CONCEPTUAL_LOCAL_KNOWLEDGE');
    });

    it('ADV-13: Turno de seguimiento con historial activo', () => {
      const plan = service.evaluate({
        userMessage: '¿Por qué?',
        hasActiveSessionHistory: true,
      });
      assert.strictEqual(plan.sources.conversationHistory, 'SELECTED');
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
    });

    it('ADV-14: Turno sin historial activo', () => {
      const plan = service.evaluate({
        userMessage: '¿Por qué?',
        hasActiveSessionHistory: false,
      });
      assert.strictEqual(plan.sources.conversationHistory, 'UNNEEDED');
    });

    it('ADV-15: Solicitud de profundización con historial activo', () => {
      const plan = service.evaluate({
        userMessage: 'Repetilo pero con más detalle',
        hasActiveSessionHistory: true,
      });
      assert.strictEqual(plan.sources.conversationHistory, 'SELECTED');
    });

    it('ADV-16: Entrada incoherente con intent desconocido', () => {
      const plan = service.evaluate({
        userMessage: 'asdfghjk qwerty 12345',
        classifiedIntent: 'UNKNOWN',
        intentConfidence: 'low',
      });
      assert.strictEqual(plan.sources.rag, 'UNNEEDED');
      assert.strictEqual(plan.sources.web, 'UNNEEDED');
    });

    it('ADV-17: Contradicción directa', () => {
      const plan = service.evaluate({
        userMessage: 'Busca en mis documentos pero no uses documentos',
      });
      assert.strictEqual(plan.sources.rag, 'EXCLUDED');
      assert.strictEqual(plan.ambiguity.isAmbiguous, true);
      assert.strictEqual(plan.policyReason, 'CONTRADICTION_RESOLVED_NEGATIVE_PRECEDENCE');
    });
  });
});
