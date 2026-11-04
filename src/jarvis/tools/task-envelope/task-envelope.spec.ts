import { TaskEnvelopeService } from './task-envelope.service';
import { DialogueEngineService } from '../../dialogue/dialogue-engine.service';
import { JarvisPromptBuilderService } from '../../prompt/jarvis-prompt-builder.service';

describe('TaskEnvelope & Tool Isolation — Validación JCA Fase 2', () => {
  let taskEnvelopeService: TaskEnvelopeService;
  let dialogueEngine: DialogueEngineService;
  let promptBuilder: JarvisPromptBuilderService;

  beforeEach(() => {
    taskEnvelopeService = new TaskEnvelopeService();
    dialogueEngine = new DialogueEngineService();

    // Mock minimal para JarvisPromptBuilderService
    promptBuilder = new (JarvisPromptBuilderService as any)(
      {} as any, // userProfileRepo
      {} as any, // jarvisIdentity
      {} as any, // capabilitiesService
      {} as any, // skillRegistry
      {} as any, // sessionSummaryRepo
      {} as any, // conversationRepo
      {
        findDocumentByExactTitle: jest.fn().mockImplementation((title) => {
          if (title.toLowerCase().includes('simbolos') || title.toLowerCase().includes('símbolos')) {
            return { title: 'El hombre y sus simbolos Carl Gustav Jung' };
          }
          if (title.toLowerCase().includes('jung')) {
            return { title: 'Carl Gustav Jung - 8 JUNG Dream Interpretacion Ancient & Modern 1936 1941 (2014)' };
          }
          return null;
        }),
        searchDocumentsByTitle: jest.fn().mockImplementation((title) => {
          if (title.toLowerCase().includes('simbolos') || title.toLowerCase().includes('símbolos')) {
            return [{ title: 'El hombre y sus simbolos Carl Gustav Jung' }];
          }
          if (title.toLowerCase().includes('jung')) {
            return [{ title: 'Carl Gustav Jung - 8 JUNG Dream Interpretacion Ancient & Modern 1936 1941 (2014)' }];
          }
          return [];
        }),
      } as any, // documentRepo
      {} as any, // memoryRepo
      {} as any, // categorySummaryService
      {} as any, // documentSummaryService
      {} as any, // jarvisKnowledge
      {} as any, // embeddingsService
      {
        getIndex: () => ({
          documentos: [
            {
              titulo: 'Carl Gustav Jung - 8 JUNG Dream Interpretacion Ancient & Modern 1936 1941 (2014)',
              autor: 'Carl Gustav Jung',
            },
            {
              titulo: 'El hombre y sus simbolos Carl Gustav Jung',
              autor: 'Carl Gustav Jung',
            },
            {
              titulo: 'Guía para Pulseras',
              autor: 'Autor Desconocido',
            },
          ],
        }),
        getAuthorAndSchoolByTitle: () => ({ author: 'Carl Gustav Jung', school: 'psicoanalisis' }),
      } as any, // corpusSelector
      {} as any, // musicCatalog
      {} as any, // gamesCatalog
      {} as any, // disciplinesCatalog
      {} as any, // coreContextService
    );
  });

  describe('1. Contratos de Aislamiento y Gobernanza de Permisos (TaskEnvelope)', () => {
    test('Caso #001 (Misión Operativa): Confinamiento estricto a SYSTEM_ADMIN', () => {
      const prompt =
        'MISIÓN JNE-002: Implementación inicial del Núcleo Operativo JNE. Construir el primer núcleo...';
      const dialogueEval = dialogueEngine.evaluateTurn(prompt);

      const envelope = taskEnvelopeService.createEnvelope(
        'sess_001',
        'SYSTEM_ADMIN',
        dialogueEval,
      );

      expect(envelope.intent).toBe('SYSTEM_ADMIN');
      expect(envelope.mode).toBe('MISSION');
      expect(taskEnvelopeService.isToolAllowed(envelope, 'system')).toBe(true);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'evidence')).toBe(true);

      // Bloqueo estricto de herramientas de biblioteca
      expect(taskEnvelopeService.isToolAllowed(envelope, 'rag')).toBe(false);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'corpus_selector')).toBe(false);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'library_summary')).toBe(false);
      expect(taskEnvelopeService.isScopeAllowed(envelope, 'documents')).toBe(false);
    });

    test('Caso #002 (Registro Forense con Cita de Libro): Confinamiento estricto a SYSTEM_ADMIN', () => {
      const prompt =
        'REGISTRO DE INCIDENTE FORENSE — ANEXO JNE-006.5-A: NO eliminar documento "Carl Gustav Jung - 8 JUNG..."';
      const dialogueEval = dialogueEngine.evaluateTurn(prompt);

      const envelope = taskEnvelopeService.createEnvelope(
        'sess_002',
        'SYSTEM_ADMIN',
        dialogueEval,
      );

      expect(envelope.intent).toBe('SYSTEM_ADMIN');
      expect(envelope.mode).toBe('MISSION');
      expect(taskEnvelopeService.isToolAllowed(envelope, 'rag')).toBe(false);
      expect(taskEnvelopeService.isScopeAllowed(envelope, 'documents')).toBe(false);
      expect(taskEnvelopeService.isScopeAllowed(envelope, 'system_state')).toBe(true);
    });

    test('Diálogo Reflexivo / Conceptual: Herramientas totalmente deshabilitadas', () => {
      const prompt =
        '¿Qué opinás de la teoría del inconsciente colectivo desde una óptica epistemológica?';
      const dialogueEval = dialogueEngine.evaluateTurn(prompt);

      const envelope = taskEnvelopeService.createEnvelope(
        'sess_003',
        'CONVERSATION',
        dialogueEval,
      );

      expect(envelope.intent).toBe('CONVERSATION');
      expect(envelope.mode).toBe('DIALOGUE');
      expect(envelope.allowedTools).toEqual([]);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'rag')).toBe(false);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'web_search')).toBe(false);
    });

    test('Consulta de Investigación Legítima: Herramientas RAG autorizadas', () => {
      const prompt = '¿Qué dice Jung sobre la Sombra en Aion?';
      const dialogueEval = dialogueEngine.evaluateTurn(prompt);

      const envelope = taskEnvelopeService.createEnvelope(
        'sess_004',
        'RESEARCH',
        dialogueEval,
      );

      expect(envelope.intent).toBe('RESEARCH');
      expect(envelope.mode).toBe('DIALOGUE');
      expect(taskEnvelopeService.isToolAllowed(envelope, 'rag')).toBe(true);
      expect(taskEnvelopeService.isToolAllowed(envelope, 'corpus_selector')).toBe(true);
      expect(taskEnvelopeService.isScopeAllowed(envelope, 'documents')).toBe(true);
    });
  });

  describe('2. Inmunidad Comprobada ante Secuestro Léxico en JarvisPromptBuilderService', () => {
    test('Inmunidad del Caso #001: Misión JNE-002 NO dispara resumen de "Guía para Pulseras"', async () => {
      const promptCaso1 =
        'MISIÓN JNE-002: Implementación inicial del Núcleo Operativo JNE. Construir el primer núcleo operativo dentro de src/jarvis/verification/...';

      const result = await (promptBuilder as any).detectDocumentSummaryRequest(
        promptCaso1,
      );

      expect(result.isRequest).toBe(false);
      expect(result.title).toBeUndefined();
    });

    test('Inmunidad del Caso #002: Registro Forense con cita explícita de Jung NO dispara resumen', async () => {
      const promptCaso2 = [
        'REGISTRO DE INCIDENTE FORENSE — ANEXO JNE-006.5-A',
        'Por favor registra en tu memoria y base de datos persistente el siguiente anexo:',
        '3. NO eliminar ni mover el documento "Carl Gustav Jung - 8 JUNG Dream Interpretacion Ancient & Modern 1936 1941 (2014)".',
        '4. NO modificar prompts ni la rama main.',
      ].join('\n');

      const result = await (promptBuilder as any).detectDocumentSummaryRequest(
        promptCaso2,
      );

      expect(result.isRequest).toBe(false);
      expect(result.title).toBeUndefined();
    });

    test('Mantiene la funcionalidad legítima: "Resumen del libro El hombre y sus simbolos"', async () => {
      const legitimateSummaryPrompt =
        'Por favor dame un resumen del libro El hombre y sus simbolos Carl Gustav Jung';

      const result = await (promptBuilder as any).detectDocumentSummaryRequest(
        legitimateSummaryPrompt,
      );

      expect(result.isRequest).toBe(true);
      expect(result.title).toBe('El hombre y sus simbolos Carl Gustav Jung');
    });
  });
});
