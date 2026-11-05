/**
 * JCA-001: Misión 11 - Suite de Pruebas Contractuales y de Seguridad
 * 
 * Verifica rigurosamente el comportamiento de la Capa 3:
 * - TC-01 a TC-13: Casos contractuales definidos en Misión 10.
 * - Pruebas adversariales de seguridad matemática (AST parser, inyecciones de código).
 * - Pruebas de timeout con dependencias que ignoran AbortSignal.
 * - Pruebas de concurrencia, deduplicación en vuelo y aislamiento de sesiones.
 * - Verificación de precedencia de exclusiones (UNAUTHORIZED).
 * - Verificación de telemetría segura.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry } from './capability-registry.service.ts';
import { CapabilityExecutor } from './capability-executor.service.ts';
import { MathCapability } from './math.capability.ts';
import { WebSearchCapability, type WebSearchProviderFn } from './web-search.capability.ts';
import type { ContextPlan } from '../context/context-selector.interface.ts';

// ── Mock Helper de ContextPlan ────────────────────────────────────────────────

function createMockPlan(overrides: Partial<ContextPlan> = {}): ContextPlan {
  return {
    sources: {
      memory: 'UNNEEDED',
      conversationHistory: 'UNNEEDED',
      rag: 'UNNEEDED',
      web: 'UNNEEDED',
      tools: 'UNNEEDED',
      ...overrides.sources,
    },
    toolStates: {
      math: 'UNNEEDED',
      sports: 'UNNEEDED',
      gmail: 'UNNEEDED',
      ...overrides.toolStates,
    },
    activeTools: overrides.activeTools ?? [],
    exclusions: {
      excludeDocuments: false,
      excludeWeb: false,
      excludeMemory: false,
      matchedDirectives: [],
      ...overrides.exclusions,
    },
    ambiguity: {
      isAmbiguous: false,
      confidence: 'high',
      contextConfidence: 'high',
      conflicts: [],
    },
    policyReason: 'TEST_PLAN',
    suggestedAction: overrides.suggestedAction ?? 'LLM',
  };
}

describe('JCA-001 Misión 11: Capability Architecture Contract Suite', () => {
  let registry: CapabilityRegistry;
  let executor: CapabilityExecutor;
  let mathCap: MathCapability;
  let webCap: WebSearchCapability;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    mathCap = new MathCapability();
    webCap = new WebSearchCapability();

    registry.register(mathCap);
    registry.register(webCap);

    executor = new CapabilityExecutor(registry);
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 1. REGISTRY & CONFIGURATION SAFETY
  // ════════════════════════════════════════════════════════════════════════════
  describe('1. Capability Registry Safety Checks', () => {
    it('Debe rechazar identificadores duplicados', () => {
      assert.throws(() => {
        registry.register(new MathCapability());
      }, /Conflicto de registro: La capacidad con ID 'math' ya se encuentra registrada/);
    });

    it('Debe rechazar capacidades con configuración inválida o timeout negativo', () => {
      assert.throws(() => {
        registry.register({
          id: 'bad_cap',
          name: 'Bad Cap',
          description: 'invalid',
          safetyLevel: 'READ_ONLY',
          defaultTimeoutMs: -100,
          canHandle: () => true,
          execute: async () => ({} as any),
        });
      }, /defaultTimeoutMs numérico positivo finito/);
    });

    it('Debe exponer únicamente capacidades registradas y responder has() correctamente', () => {
      assert.strictEqual(registry.has('math'), true);
      assert.strictEqual(registry.has('web_search'), true);
      assert.strictEqual(registry.has('gmail'), false);
      assert.strictEqual(registry.size, 2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. MATH CAPABILITY & DETERMINISTIC AST SAFETY
  // ════════════════════════════════════════════════════════════════════════════
  describe('2. MathCapability: Determinismo y AST Seguro', () => {
    it('TC-01: "¿Cuánto es 125 * 8? Explicá" debe resolver 1000 con verified: true y sin red', async () => {
      const plan = createMockPlan({
        sources: { tools: 'SELECTED', memory: 'UNNEEDED', conversationHistory: 'UNNEEDED', rag: 'UNNEEDED', web: 'UNNEEDED' },
        toolStates: { math: 'SELECTED' },
      });

      const result = await executor.execute<any>('math', '¿Cuánto es 125 * 8? Explicá el cálculo', plan, 'sess-1');

      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.safetyLevel, 'READ_ONLY');
      assert.ok(result.data);
      assert.strictEqual(result.data.result, '1000');
      assert.strictEqual(result.data.numericValue, 1000);
      assert.strictEqual(result.data.verified, true);
      assert.ok(result.promptContextSnippet?.includes('1000'));
    });

    it('TC-02: "Si un evento inicia 14:30 y dura 180 min, ¿a qué hora termina?" debe resolver 17:30', async () => {
      const plan = createMockPlan({
        sources: { tools: 'SELECTED', memory: 'UNNEEDED', conversationHistory: 'UNNEEDED', rag: 'UNNEEDED', web: 'UNNEEDED' },
        toolStates: { math: 'SELECTED' },
      });

      const result = await executor.execute<any>(
        'math',
        'Si un evento inicia a las 14:30 y dura 180 minutos, ¿a qué hora termina?',
        plan,
        'sess-1',
      );

      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.data.operationType, 'DATE_MATH_DURATION');
      assert.strictEqual(result.data.result, '17:30');
      assert.strictEqual(result.data.verified, true);
    });

    it('TC-15: División por cero debe ser capturada como error seguro (División por cero no permitida)', async () => {
      const plan = createMockPlan({ toolStates: { math: 'SELECTED' } });
      const result = await executor.execute<any>('math', 'Calcula: 100 / 0', plan, 'sess-1');

      assert.strictEqual(result.status, 'RECOVERABLE_ERROR');
      assert.ok(result.error?.message.includes('División por cero'));
      assert.ok(result.fallbackDirective?.includes('NO presentes un resultado numérico'));
    });

    it('TC-16: Funciones trigonométricas y potencias permitidas: sqrt(144) + pow(2, 3)', async () => {
      const plan = createMockPlan({ toolStates: { math: 'SELECTED' } });
      const result = await executor.execute<any>('math', 'Calcula sqrt(144) + pow(2, 3)', plan, 'sess-1');

      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.data.result, '20');
      assert.strictEqual(result.data.verified, true);
    });

    it('TC-05: Intento de inyección de código "Calcula process.exit(0)" debe ser bloqueado por AST parser', async () => {
      const plan = createMockPlan({ toolStates: { math: 'SELECTED' } });
      const result = await executor.execute<any>('math', 'Calcula process.exit(0)', plan, 'sess-1');

      assert.strictEqual(result.status, 'RECOVERABLE_ERROR');
      assert.ok(
        result.error?.message.includes('no autorizad') ||
          result.error?.message.includes('prohibid') ||
          result.error?.code === 'FORBIDDEN_RUNTIME_TOKEN',
      );
      assert.ok(!result.data);
    });

    it('TC-05b: Intento de acceso a propiedades "constructor.constructor" o "eval()" debe ser bloqueado', async () => {
      const plan = createMockPlan({ toolStates: { math: 'SELECTED' } });
      const result = await executor.execute<any>('math', 'eval("2 + 2")', plan, 'sess-1');

      assert.strictEqual(result.status, 'RECOVERABLE_ERROR');
      assert.ok(
        result.error?.message.includes('no autorizad') ||
          result.error?.message.includes('prohibid') ||
          result.error?.code === 'FORBIDDEN_RUNTIME_TOKEN',
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 3. WEB SEARCH CAPABILITY & ESTRUCTURACIÓN
  // ════════════════════════════════════════════════════════════════════════════
  describe('3. WebSearchCapability: Estructuración y Adaptador', () => {
    it('TC-06: Consulta de deportes se resuelve como búsqueda web normal (category = deportes)', async () => {
      const plan = createMockPlan({
        sources: { web: 'REQUESTED', memory: 'UNNEEDED', conversationHistory: 'UNNEEDED', rag: 'UNNEEDED', tools: 'UNNEEDED' },
      });

      const result = await executor.execute<any>('web_search', '¿Cómo salió el partido de Boca ayer?', plan, 'sess-1');

      assert.strictEqual(result.status, 'SUCCESS');
      assert.strictEqual(result.safetyLevel, 'READ_ONLY');
      assert.ok(result.data);
      assert.strictEqual(result.data.effectiveCategory, 'deportes');
      assert.ok(result.data.items.length > 0);
      assert.ok(result.data.items[0].url.startsWith('https://'));
      assert.ok(result.promptContextSnippet?.includes('[RESULTADOS DE BÚSQUEDA WEB (DEPORTES)]'));
    });

    it('TC-09: Término inexistente retorna NO_RESULTS con directiva anti-alucinación', async () => {
      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const result = await executor.execute<any>('web_search', 'Busca sobre xqz789_inexistente_query', plan, 'sess-1');

      assert.strictEqual(result.status, 'NO_RESULTS');
      assert.strictEqual(result.data?.items.length, 0);
      assert.ok(result.fallbackDirective?.includes('NO inventes'));
    });

    it('TC-10: Fallo de red simulado (DNS/Socket Error) produce RECOVERABLE_ERROR sin derribar el flujo', async () => {
      const failingProvider: WebSearchProviderFn = async () => {
        throw new Error('getaddrinfo ENOTFOUND duckduckgo.com');
      };
      const failingWebCap = new WebSearchCapability(failingProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(failingWebCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const result = await customExecutor.execute<any>('web_search', 'Noticias sobre economía', plan, 'sess-1');

      assert.strictEqual(result.status, 'RECOVERABLE_ERROR');
      assert.ok(result.error?.message.includes('getaddrinfo ENOTFOUND'));
      assert.ok(result.fallbackDirective?.includes('Error de conexión'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 4. AUTORIZACIÓN, PRECEDENCIA Y TIMEOUTS
  // ════════════════════════════════════════════════════════════════════════════
  describe('4. Gobernanza: Precedencia de Exclusiones y Timeouts', () => {
    it('TC-04: Exclusión explícita de matemática bloquea ejecución antes de invocar la capacidad (UNAUTHORIZED)', async () => {
      const plan = createMockPlan({
        sources: { tools: 'EXCLUDED' },
        toolStates: { math: 'EXCLUDED' },
        exclusions: { excludeWeb: false, excludeDocuments: false, excludeMemory: false, matchedDirectives: ['sin calculadora'] },
      });

      const result = await executor.execute<any>('math', '¿Cuánto es 50 * 4? Pero sin calculadora', plan, 'sess-1');

      assert.strictEqual(result.status, 'UNAUTHORIZED');
      assert.strictEqual(result.error?.code, 'MATH_TOOL_EXPLICITLY_EXCLUDED');
      assert.ok(result.fallbackDirective?.includes('DIRECTIVA MANDATORIA'));
    });

    it('TC-07: Exclusión explícita de web bloquea búsqueda antes de conectar (UNAUTHORIZED)', async () => {
      const plan = createMockPlan({
        sources: { web: 'EXCLUDED' },
        exclusions: { excludeWeb: true, excludeDocuments: false, excludeMemory: false, matchedDirectives: ['sin internet'] },
      });

      const result = await executor.execute<any>('web_search', 'Busca sobre IA pero sin internet', plan, 'sess-1');

      assert.strictEqual(result.status, 'UNAUTHORIZED');
      assert.strictEqual(result.error?.code, 'WEB_SEARCH_EXPLICITLY_EXCLUDED');
      assert.ok(result.fallbackDirective?.includes('NO buscar en internet'));
    });

    it('TC-03: Consulta puramente conceptual no es manejada por Math (NO_RESULTS) y fluye al LLM', async () => {
      const plan = createMockPlan({ sources: { tools: 'UNNEEDED', web: 'UNNEEDED' } });
      const result = await executor.execute<any>('math', '¿Qué es un espacio vectorial en álgebra lineal?', plan, 'sess-1');

      assert.strictEqual(result.status, 'NO_RESULTS');
      assert.ok(result.fallbackDirective?.includes('conocimiento base del LLM'));
    });

    it('TC-08a: Proveedor que ignora AbortSignal (abortSignalSent: true, underlyingOperationCancelled: false)', async () => {
      // Proveedor rebelde que ignora AbortSignal y sigue ejecutando en segundo plano
      let didFinishLater = false;
      const stubbornProvider: WebSearchProviderFn = async (_q, _cat, signal) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            didFinishLater = true;
            resolve('resultado tardío ignorando abort');
          }, 300);
        });
      };
      const stubbornWebCap = new WebSearchCapability(stubbornProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(stubbornWebCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const startTime = Date.now();
      const result = await customExecutor.execute<any>(
        'web_search',
        'Consulta con proveedor rebelde',
        plan,
        'sess-stubborn',
        { overrideTimeoutMs: 50 },
      );
      const elapsed = Date.now() - startTime;

      assert.strictEqual(result.status, 'TIMEOUT');
      assert.strictEqual(result.abortSignalSent, true);
      // CORRECCIÓN MANDATORIA: underlyingOperationCancelled NO debe ser true si la dependencia ignoró la señal
      assert.strictEqual(result.underlyingOperationCancelled, false);
      assert.ok(elapsed < 200, `El timeout debe cumplirse de inmediato (tardó ${elapsed}ms)`);
      assert.ok(result.fallbackDirective?.includes('TIMEOUT'));
    });

    it('TC-08b: Proveedor cooperante que respeta AbortSignal (abortSignalSent: true, underlyingOperationCancelled: true)', async () => {
      const cooperativeProvider: WebSearchProviderFn = async (_q, _cat, signal) => {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve('no abortado'), 500);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('Operación cancelada por señal de aborto');
            err.name = 'AbortError';
            reject(err);
          });
        });
      };
      const coopCap = new WebSearchCapability(cooperativeProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(coopCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const result = await customExecutor.execute<any>(
        'web_search',
        'Consulta con proveedor cooperante',
        plan,
        'sess-coop',
        { overrideTimeoutMs: 40 },
      );

      assert.strictEqual(result.status, 'TIMEOUT');
      assert.strictEqual(result.abortSignalSent, true);
      assert.strictEqual(result.underlyingOperationCancelled, true);
    });

    it('TC-08c: Proveedor que rechaza después de que el ejecutor devolvió TIMEOUT no produce unhandled rejection', async () => {
      const lateRejectProvider: WebSearchProviderFn = async () => {
        return new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Fallo tardío de red'));
          }, 100);
        });
      };
      const lateCap = new WebSearchCapability(lateRejectProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(lateCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const result = await customExecutor.execute<any>(
        'web_search',
        'Consulta con fallo tardío',
        plan,
        'sess-late-fail',
        { overrideTimeoutMs: 30 },
      );

      assert.strictEqual(result.status, 'TIMEOUT');
      assert.strictEqual(result.abortSignalSent, true);
      // Esperar 150ms para asegurar que el rechazo tardío ocurre y es absorbido sin unhandledRejection
      await new Promise((r) => setTimeout(r, 150));
    });

    it('TC-08d: Verificación de que una operación que excedió el timeout no se presenta como completada', async () => {
      let lateResolved = false;
      const delayedProvider: WebSearchProviderFn = async () => {
        return new Promise((resolve) => {
          setTimeout(() => {
            lateResolved = true;
            resolve('resultado tardío');
          }, 80);
        });
      };
      const delayedCap = new WebSearchCapability(delayedProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(delayedCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const result = await customExecutor.execute<any>(
        'web_search',
        'Consulta tardía',
        plan,
        'sess-late-complete',
        { overrideTimeoutMs: 30 },
      );

      assert.strictEqual(result.status, 'TIMEOUT');
      assert.strictEqual(result.data, undefined);
      assert.ok(result.fallbackDirective?.includes('TIMEOUT'));
    });
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 5. CONCURRENCIA, DEDUPLICACIÓN Y TELEMETRÍA
  // ════════════════════════════════════════════════════════════════════════════
  describe('5. Concurrencia, Deduplicación y Telemetría', () => {
    it('TC-11: Dos ejecuciones idénticas concurrentes en la misma sesión reutilizan la misma promesa', async () => {
      let callCount = 0;
      const delayedProvider: WebSearchProviderFn = async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 40));
        return 'resultado web concurrente';
      };
      const delayedCap = new WebSearchCapability(delayedProvider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(delayedCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const [res1, res2] = await Promise.all([
        customExecutor.execute('web_search', 'Clima en Paraná', plan, 'sess-concurrent'),
        customExecutor.execute('web_search', 'Clima en Paraná', plan, 'sess-concurrent'),
      ]);

      assert.strictEqual(res1.status, 'SUCCESS');
      assert.strictEqual(res2.status, 'SUCCESS');
      assert.strictEqual(callCount, 1, 'El proveedor solo debió ser llamado 1 vez gracias a la deduplicación');
    });

    it('TC-12: Mismas consultas en sesiones diferentes NO comparten deduplicación (aislamiento de sesión)', async () => {
      let callCount = 0;
      const provider: WebSearchProviderFn = async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 30));
        return 'resultado sesión independiente';
      };
      const delayedCap = new WebSearchCapability(provider);
      const customRegistry = new CapabilityRegistry();
      customRegistry.register(delayedCap);
      const customExecutor = new CapabilityExecutor(customRegistry);

      const plan = createMockPlan({ sources: { web: 'REQUESTED' } });
      const [res1, res2] = await Promise.all([
        customExecutor.execute('web_search', 'Noticias hoy', plan, 'session-A'),
        customExecutor.execute('web_search', 'Noticias hoy', plan, 'session-B'),
      ]);

      assert.strictEqual(res1.status, 'SUCCESS');
      assert.strictEqual(res2.status, 'SUCCESS');
      assert.strictEqual(callCount, 2, 'Deben ejecutarse independientemente por tener distinto sessionId');
    });

    it('TC-13: La telemetría se registra sin volcar datos privados del usuario', async () => {
      const plan = createMockPlan({ toolStates: { math: 'SELECTED' } });
      await executor.execute('math', 'Calcula: 25 * 4', plan, 'session-telemetry');

      const logs = executor.getTelemetryLogs();
      assert.strictEqual(logs.length, 1);
      const entry = logs[0];
      assert.strictEqual(entry.sessionId, 'session-telemetry');
      assert.strictEqual(entry.capabilityId, 'math');
      assert.strictEqual(entry.status, 'SUCCESS');
      assert.strictEqual(entry.safetyLevel, 'READ_ONLY');
      assert.strictEqual(entry.hasData, true);
      // Comprobar que el log no contiene el texto crudo del usuario como propiedad
      assert.strictEqual((entry as any).userMessage, undefined);
    });

    it('TC-14: Validación de parámetros rechaza inputs malformados', async () => {
      const plan = createMockPlan();
      const res1 = await executor.execute('', 'test', plan, 'sess-1');
      assert.strictEqual(res1.status, 'RECOVERABLE_ERROR');
      assert.strictEqual(res1.error?.code, 'INVALID_CAPABILITY_ID');

      const res2 = await executor.execute('math', '', plan, 'sess-1');
      assert.strictEqual(res2.status, 'RECOVERABLE_ERROR');
      assert.strictEqual(res2.error?.code, 'INVALID_USER_MESSAGE');

      const res3 = await executor.execute('math', 'test', null as any, 'sess-1');
      assert.strictEqual(res3.status, 'RECOVERABLE_ERROR');
      assert.strictEqual(res3.error?.code, 'INVALID_CONTEXT_PLAN');
    });
  });
});
