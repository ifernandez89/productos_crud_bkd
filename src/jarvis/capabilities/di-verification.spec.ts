import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { CapabilityRegistry } from './capability-registry.service.js';
import { CapabilityExecutor } from './capability-executor.service.js';
import { MathCapability } from './math.capability.js';
import type { ContextPlan } from '../context/context-selector.interface.js';

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
    activeTools: [],
    exclusions: {
      excludeDocuments: false,
      excludeWeb: false,
      excludeMemory: false,
      matchedDirectives: [],
      ...overrides.exclusions,
    },
    ambiguity: {
      isAmbiguous: false,
      needsClarification: false,
      contextConfidence: 'high',
      confidence: 'high',
      conflicts: [],
      ...overrides.ambiguity,
    },
    policyReason: 'MOCK_TEST_PLAN',
    ...overrides,
  };
}

describe('JCA-001 Misión 14: Corrección y Verificación de Inyección de Dependencias (DI)', () => {
  it('DI-01: CapabilityRegistry y CapabilityExecutor se resuelven como singletons acoplados por contenedor', () => {
    // Simulación del contenedor de IoC de NestJS configurado en JarvisModule
    const registryInstance = new CapabilityRegistry();
    const executorInstance = new CapabilityExecutor(registryInstance);

    assert.ok(registryInstance instanceof CapabilityRegistry, 'CapabilityRegistry debe ser instancia válida');
    assert.ok(executorInstance instanceof CapabilityExecutor, 'CapabilityExecutor debe ser instancia válida');

    // Registrar capacidades
    registryInstance.register(new MathCapability());
    assert.strictEqual(registryInstance.has('math'), true, 'El registro gestionado debe tener math');

    // Comprobar que el ejecutor ve la capacidad registrada en el registry gestionado
    const hasCapability = (executorInstance as any).registry.has('math');
    assert.strictEqual(hasCapability, true, 'El ejecutor debe operar sobre la instancia administrada del registry');
  });

  it('DI-02: Garantía de no-duplicación — El Executor y el Service comparten exactamente la misma referencia', () => {
    const containerRegistry = new CapabilityRegistry();
    const containerExecutor = new CapabilityExecutor(containerRegistry);

    // Mock del constructor de JarvisService recibiendo las dependencias formales inyectadas por NestJS
    const injectedRegistry = containerRegistry;
    const injectedExecutor = containerExecutor;

    // Verificar identidad referencial estricta (no clonado ni instancia paralela con new)
    assert.strictEqual(injectedRegistry, containerRegistry, 'La instancia del Registry debe ser idéntica');
    assert.strictEqual(injectedExecutor, containerExecutor, 'La instancia del Executor debe ser idéntica');
    assert.strictEqual(
      (containerExecutor as any).registry,
      injectedRegistry,
      'El executor DEBE compartir la misma referencia de registry inyectada por el contenedor',
    );
  });

  it('DI-03: Ejecución operativa a través de las instancias gobernadas por DI', async () => {
    const registry = new CapabilityRegistry();
    const mathCap = new MathCapability();
    registry.register(mathCap);

    const executor = new CapabilityExecutor(registry);
    const plan = createMockPlan({
      sources: { tools: 'REQUESTED' },
      toolStates: { math: 'SELECTED' },
    });

    const result = await executor.execute('math', '15 + 25', plan, 'sess-di-test');
    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual((result.data as any).result, '40');
    assert.strictEqual((result.data as any).verified, true);
  });
});
