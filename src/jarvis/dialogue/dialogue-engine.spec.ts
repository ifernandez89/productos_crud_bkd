import { DialogueEngineService } from './dialogue-engine.service';

describe('DialogueEngineService — Validación JCA Fase 1', () => {
  let dialogueEngine: DialogueEngineService;

  beforeEach(() => {
    dialogueEngine = new DialogueEngineService();
  });

  describe('1. Clasificación del Estado del Turno Conversacional (TurnState)', () => {
    test('Identifica OPERATIONAL_DIRECTIVE ante órdenes de misión o registro', () => {
      const eval1 = dialogueEngine.evaluateTurn(
        'MISIÓN JNE-002: Implementación inicial del Núcleo Operativo JNE',
      );
      expect(eval1.turnState).toBe('OPERATIONAL_DIRECTIVE');
      expect(eval1.isOperational).toBe(true);

      const eval2 = dialogueEngine.evaluateTurn(
        'REGISTRO DE INCIDENTE FORENSE — ANEXO JNE-006.5-A',
      );
      expect(eval2.turnState).toBe('OPERATIONAL_DIRECTIVE');
      expect(eval2.isOperational).toBe(true);

      const eval3 = dialogueEngine.evaluateTurn(
        'IMPLEMENTÁ la alternativa B en una nueva rama experimental',
      );
      expect(eval3.turnState).toBe('OPERATIONAL_DIRECTIVE');
      expect(eval3.isOperational).toBe(true);
    });

    test('Identifica CORRECTION ante rectificaciones del usuario', () => {
      const evaluation = dialogueEngine.evaluateTurn(
        'No, me refería a la arquitectura de memoria, te equivocaste en el servicio',
      );
      expect(evaluation.turnState).toBe('CORRECTION');
      expect(evaluation.isOperational).toBe(false);
    });

    test('Identifica CLARIFICATION ante pedidos de profundización', () => {
      const evaluation = dialogueEngine.evaluateTurn(
        '¿A qué te referís con desacoplar el ciclo HTTP del Mission Engine?',
      );
      expect(evaluation.turnState).toBe('CLARIFICATION');
    });

    test('Identifica REFLECTIVE_CHAT y activa shouldBypassTools', () => {
      const evaluation = dialogueEngine.evaluateTurn(
        '¿Qué opinás de la teoría sintérgica de Grinberg desde una perspectiva filosófica?',
      );
      expect(evaluation.turnState).toBe('REFLECTIVE_CHAT');
      expect(evaluation.shouldBypassTools).toBe(true);
      expect(evaluation.isOperational).toBe(false);
    });

    test('Identifica NEW_TOPIC ante preguntas estándar', () => {
      const evaluation = dialogueEngine.evaluateTurn(
        '¿Cuál es la distancia orbital de Marte?',
      );
      expect(evaluation.turnState).toBe('NEW_TOPIC');
      expect(evaluation.shouldBypassTools).toBe(false);
    });
  });

  describe('2. Resolución de Deixis y Anáforas', () => {
    test('Resuelve ordinales («la segunda opción») hacia la lista numerada del asistente', () => {
      const history = [
        {
          role: 'user',
          content: '¿Qué alternativas tenemos para mitigar la latencia?',
        },
        {
          role: 'assistant',
          content: [
            'Tenemos tres alternativas viables:',
            '1. Usar Llama 3.2 3B para el enrutamiento inicial.',
            '2. Crear el TaskEnvelope con aislamiento estricto de contexto.',
            '3. Aplicar cuantización Q4_K_M sobre Qwen 14B.',
          ].join('\n'),
        },
      ];

      const evaluation = dialogueEngine.evaluateTurn(
        'Me gusta la segunda opción, avancemos con eso',
        history,
      );

      expect(evaluation.anaphora.hasAnaphora).toBe(true);
      expect(evaluation.anaphora.referencedAntecedent).toContain(
        'Crear el TaskEnvelope con aislamiento estricto de contexto.',
      );
      expect(evaluation.resolvedMessage).toContain(
        'Referencia resuelta: "Crear el TaskEnvelope con aislamiento estricto de contexto."',
      );
    });

    test('Resuelve pronominales («sobre eso») vinculando el tema del turno previo', () => {
      const history = [
        {
          role: 'assistant',
          content: [
            '# Sistema de Memoria Episódica de JarBees',
            'La memoria episódica almacena eventos causales y decisiones operativas en PostgreSQL.',
          ].join('\n'),
        },
      ];

      const evaluation = dialogueEngine.evaluateTurn(
        'Contame más sobre eso',
        history,
      );

      expect(evaluation.anaphora.hasAnaphora).toBe(true);
      expect(evaluation.anaphora.referencedAntecedent).toBe(
        'Sistema de Memoria Episódica de JarBees',
      );
      expect(evaluation.resolvedMessage).toContain(
        'Sistema de Memoria Episódica de JarBees',
      );
    });

    test('Retorna mensaje original sin mutación cuando no hay deícticos', () => {
      const evaluation = dialogueEngine.evaluateTurn(
        'Quiero auditar los permisos de la base de datos',
        [{ role: 'assistant', content: 'Respuesta previa.' }],
      );

      expect(evaluation.anaphora.hasAnaphora).toBe(false);
      expect(evaluation.anaphora.referencedAntecedent).toBeNull();
      expect(evaluation.resolvedMessage).toBe(
        'Quiero auditar los permisos de la base de datos',
      );
    });
  });
});

