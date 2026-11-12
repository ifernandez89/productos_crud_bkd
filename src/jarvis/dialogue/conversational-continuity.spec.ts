import { Test, TestingModule } from '@nestjs/testing';
import { ConversationalContinuityService } from './conversational-continuity.service';
import { ResponseNoveltyGuardService } from './response-novelty-guard.service';
import { TaskContractValidatorService } from './task-contract-validator.service';
import { ModelRouterService } from '../../aichat/utils/model-router.service';
import { AssistantToolsService } from '../../aichat/utils/assistant-tools.service';
import { BrowserToolService } from '../tools/browser/browser-tool.service';

describe('JCA-002: Conversational Continuity & Response Quality', () => {
  let continuityService: ConversationalContinuityService;
  let noveltyGuard: ResponseNoveltyGuardService;
  let contractValidator: TaskContractValidatorService;
  let modelRouter: ModelRouterService;
  let assistantTools: AssistantToolsService;

  beforeEach(() => {
    noveltyGuard = new ResponseNoveltyGuardService();
    continuityService = new ConversationalContinuityService(noveltyGuard);
    contractValidator = new TaskContractValidatorService(noveltyGuard);
    modelRouter = new ModelRouterService();
    // AssistantToolsService with mock browser
    const mockBrowserTool = {} as BrowserToolService;
    assistantTools = new AssistantToolsService(mockBrowserTool);
  });

  afterEach(() => {
    // Teardown limpio obligatorio (Regla Anti-OOM)
    continuityService.clearState('test-session-1');
    continuityService.clearState('test-session-2');
  });

  describe('1. Escenario del Chiste: Continuidad, Novedad y Anti-Repetición', () => {
    it('debe detectar la tarea inicial de chiste y almacenar la respuesta', () => {
      const sessionId = 'test-session-1';
      const prompt1 = 'Contame un chiste.';

      const resolution1 = continuityService.resolveTurn(sessionId, prompt1);
      expect(resolution1.currentState.activeTask).toBe('TELL_JOKE');
      expect(resolution1.currentState.noveltyRequired).toBe(false);

      const joke1 = '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!';
      continuityService.recordAssistantOutput(sessionId, joke1, 'TELL_JOKE');

      const stateAfterJoke1 = continuityService.getState(sessionId);
      expect(stateAfterJoke1.lastOutput).toBe(joke1);
      expect(stateAfterJoke1.previousOutputs).toContain(joke1);
    });

    it('debe interpretar "ahora contame uno aún más gracioso!" como continuación con noveltyRequired', () => {
      const sessionId = 'test-session-1';
      const joke1 = '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!';
      continuityService.recordAssistantOutput(sessionId, joke1, 'TELL_JOKE');

      const prompt2 = 'Ahora contame uno aún más gracioso!';
      const resolution2 = continuityService.resolveTurn(sessionId, prompt2);

      expect(resolution2.isContinuation).toBe(true);
      expect(resolution2.currentState.activeTask).toBe('TELL_JOKE');
      expect(resolution2.currentState.noveltyRequired).toBe(true);
      expect(resolution2.detectedChange).toBe('make_it_funnier_and_novel');

      // Verifica que el prompt inyecte la restricción negativa explícita con el chiste anterior
      const injected = resolution2.injectedPromptConstraints.join('\n');
      expect(injected).toContain('[RESTRICCIÓN ESTRICTA DE NOVEDAD Y DIVERSIDAD]');
      expect(injected).toContain('Zum-ba');
    });

    it('el ResponseNoveltyGuard debe rechazar la repetición literal y aceptar uno nuevo', () => {
      const joke1 = '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!';
      const repeatedJoke = '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!';
      const novelJoke = '¿Por qué los pájaros no usan Facebook? ¡Porque ya tienen Twitter!';

      const checkRepeated = noveltyGuard.checkNovelty(repeatedJoke, [joke1]);
      expect(checkRepeated.isNovel).toBe(false);
      expect(checkRepeated.similarityScore).toBe(1.0);

      const checkNovel = noveltyGuard.checkNovelty(novelJoke, [joke1]);
      expect(checkNovel.isNovel).toBe(true);
      expect(checkNovel.similarityScore).toBeLessThan(0.3);
    });

    it('el TaskContractValidator debe invalidar la respuesta repetida', () => {
      const sessionId = 'test-session-1';
      const joke1 = '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!';
      continuityService.recordAssistantOutput(sessionId, joke1, 'TELL_JOKE');

      // Forzar turno de continuidad
      const resolution = continuityService.resolveTurn(
        sessionId,
        'Ahora contame uno todavía más gracioso!',
      );

      // Si el modelo devolviera el mismo chiste:
      const invalidValidation = contractValidator.validate(
        joke1,
        resolution.currentState,
        'Ahora contame uno todavía más gracioso!',
      );
      expect(invalidValidation.isValid).toBe(false);
      expect(invalidValidation.suggestedAction).toBe('REGENERATE_WITH_HIGH_TEMP');

      // Si el modelo devuelve un chiste nuevo:
      const newJoke = '¿Qué le dice un semáforo a otro? ¡No me mires que me estoy cambiando!';
      const validValidation = contractValidator.validate(
        newJoke,
        resolution.currentState,
        'Ahora contame uno todavía más gracioso!',
      );
      expect(validValidation.isValid).toBe(true);
      expect(validValidation.suggestedAction).toBe('NONE');
    });
  });

  describe('2. Escenario de Traducción en Modo AUTO', () => {
    it('el ModelRouterService debe enrutar automáticamente a traductor en modo AUTO', () => {
      const prompt =
        'Traducí al inglés: La sesión del operador expiró; por favor vuelva a conectarse.';
      const decision = modelRouter.routeToModel(prompt, 'auto');

      expect(decision.discipline).toBe('traductor');
      expect(decision.reason).toContain('traducción detectada');
    });

    it('el ConversationalContinuityService debe clasificar la tarea como TRANSLATE al inglés', () => {
      const sessionId = 'test-session-2';
      const prompt =
        'Traduce al inglés: La sesión del operador expiró; por favor vuelva a conectarse.';

      const resolution = continuityService.resolveTurn(sessionId, prompt);
      expect(resolution.currentState.activeTask).toBe('TRANSLATE');
      expect(resolution.currentState.targetLanguage).toBe('en');

      const injected = resolution.injectedPromptConstraints.join('\n');
      expect(injected).toContain('[INSTRUCCIÓN ESTRICTA DE TRADUCCIÓN]');
      expect(injected).toContain('Inglés');
    });

    it('el TaskContractValidator debe rechazar devolver el texto original en español sin traducir', () => {
      const sessionId = 'test-session-2';
      const originalText =
        'La sesión del operador expiró; por favor vuelva a conectarse.';
      const resolution = continuityService.resolveTurn(
        sessionId,
        `Traduce al inglés: ${originalText}`,
      );

      // Falla: Devolver la frase original en español
      const failResult = contractValidator.validate(
        originalText,
        resolution.currentState,
        `Traduce al inglés: ${originalText}`,
      );
      expect(failResult.isValid).toBe(false);
      expect(failResult.violationReason).toContain('español');

      // Éxito: Traducción al inglés
      const successTranslation =
        'The operator session has expired; please log in again.';
      const successResult = contractValidator.validate(
        successTranslation,
        resolution.currentState,
        `Traduce al inglés: ${originalText}`,
      );
      expect(successResult.isValid).toBe(true);
    });
  });

  describe('3. Escenario del Acertijo Semántico (2.° lugar)', () => {
    it('debe activar la deliberación y razonamiento paso a paso', () => {
      const sessionId = 'test-session-3';
      const riddlePrompt =
        'En una carrera, si adelantas al que va en segundo lugar, ¿en qué puesto quedas?';

      const resolution = continuityService.resolveTurn(sessionId, riddlePrompt);
      expect(resolution.currentState.activeTask).toBe('SOLVE_RIDDLE');
      expect(resolution.currentState.deliberationRequired).toBe(true);

      const injected = resolution.injectedPromptConstraints.join('\n');
      expect(injected).toContain('[INSTRUCCIÓN DE DELIBERACIÓN Y RAZONAMIENTO PASO A PASO]');
      expect(injected).toContain('adelantar al 2.° te sitúa en el 2.°');
    });

    it('el TaskContractValidator debe rechazar la respuesta falaz de "primer lugar"', () => {
      const sessionId = 'test-session-3';
      const riddlePrompt =
        'En una carrera, si adelantas al que va en segundo lugar, ¿en qué puesto quedas?';
      const resolution = continuityService.resolveTurn(sessionId, riddlePrompt);

      // Respuesta falaz típica de LLM superficial
      const wrongAnswer = '¡Quedas en primer lugar!';
      const validationWrong = contractValidator.validate(
        wrongAnswer,
        resolution.currentState,
        riddlePrompt,
      );
      expect(validationWrong.isValid).toBe(false);
      expect(validationWrong.suggestedAction).toBe('REGENERATE_WITH_CHAIN_OF_THOUGHT');
      expect(validationWrong.violationReason).toContain('segundo puesto');

      // Respuesta deductiva correcta
      const correctAnswer =
        'Quedas en segundo lugar, porque ocupas la posición de la persona que acabas de adelantar.';
      const validationCorrect = contractValidator.validate(
        correctAnswer,
        resolution.currentState,
        riddlePrompt,
      );
      expect(validationCorrect.isValid).toBe(true);
    });
  });

  describe('4. Escenario de Herramientas (TOOLS) y Prevención de Evasivas', () => {
    it('AssistantToolsService debe resolver consultas de hora ampliadas sin caer en evasivas', async () => {
      const queries = [
        '¿Qué hora es?',
        'mostrame la hora',
        'dame la hora actual',
        'ejecuta la herramienta de hora',
        'probar herramienta de hora',
      ];

      for (const q of queries) {
        const result = await assistantTools.resolve(q);
        expect(result).not.toBeNull();
        expect(result).toMatch(/Hora actual|\d{1,2}:\d{2}/i);
      }
    });

    it('el TaskContractValidator debe rechazar ofertas conversacionales evasivas en vez de dar la hora', () => {
      const sessionId = 'test-session-4';
      const timePrompt = '¿Qué hora es?';
      const resolution = continuityService.resolveTurn(sessionId, timePrompt);

      const evasiveAnswer = 'Si querés te puedo decir la hora actual, ¿te gustaría que te la muestre?';
      const validationEvasive = contractValidator.validate(
        evasiveAnswer,
        resolution.currentState,
        timePrompt,
      );
      expect(validationEvasive.isValid).toBe(false);
      expect(validationEvasive.suggestedAction).toBe('FORCE_TOOL_EXECUTION');

      const directAnswer = 'Hora actual: 19:20 (ART), jueves 12 de noviembre de 2026.';
      const validationDirect = contractValidator.validate(
        directAnswer,
        resolution.currentState,
        timePrompt,
      );
      expect(validationDirect.isValid).toBe(true);
    });
  });

  describe('5. Cambio de Tema e Inmunidad Contextual', () => {
    it('no debe arrastrar restricciones de chistes cuando el usuario cambia a consultar el clima o la hora', () => {
      const sessionId = 'test-session-5';
      continuityService.recordAssistantOutput(
        sessionId,
        '¿Qué hace una abeja en el gimnasio? ¡Zum-ba!',
        'TELL_JOKE',
      );

      // Cambio drástico de tema
      const promptClima = '¿Qué hora es en Buenos Aires?';
      const resolution = continuityService.resolveTurn(sessionId, promptClima);

      expect(resolution.isContinuation).toBe(false);
      expect(resolution.currentState.activeTask).toBe('EXECUTE_TOOL');
      expect(resolution.currentState.noveltyRequired).toBe(false);
      // No debe contener directivas de chistes en el nuevo tema
      const injected = resolution.injectedPromptConstraints.join('\n');
      expect(injected).not.toContain('chiste');
    });
  });
});

