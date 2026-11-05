import { describe, it, beforeEach } from 'node:test';
import * as assert from 'node:assert';
import { ContextSelectorService } from './context-selector.service.ts';

describe('ContextSelectorService (JCA-001 — Capa 1)', () => {
  let service: ContextSelectorService;

  beforeEach(() => {
    service = new ContextSelectorService();
  });

  // ── 1. PARES MÍNIMOS OBLIGATORIOS ──────────────────────────────────────────

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

  // ── 2. PRUEBAS DE COBERTURA, BORDES Y ROBUSTEZ ─────────────────────────────

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
});
