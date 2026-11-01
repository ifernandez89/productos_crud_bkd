/**
 * Escenario 4: Tolerancia a Fallos, Circuit Breaker y Aislamiento de Servicios
 */

export const CIRCUIT_BREAKER_PROMPT = `
Implementa un Circuit Breaker resiliente en TypeScript llamado 'ResilientCircuitBreaker' para proteger servicios distribuidos y evitar fallos en cascada.

Requisitos de contrato:
1. Estados: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
2. Opciones de configuración:
   interface CircuitBreakerOptions {
     failureThreshold: number;  // número de fallos consecutivos para abrir (ej. 3)
     resetTimeoutMs: number;    // tiempo en OPEN antes de pasar a HALF_OPEN (ej. 100ms)
     halfOpenMaxProbes: number; // máximo de sondas permitidas en HALF_OPEN (ej. 2)
   }

3. Métodos obligatorios:
   - constructor(serviceName: string, options?: Partial<CircuitBreakerOptions>)
   - async execute<T>(action: () => Promise<T>): Promise<T>
   - getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN'
   - getRejectedCount(): number
   - getSuccessCount(): number

Invariantes estrictos:
- Fail-fast en OPEN: Cuando el estado es 'OPEN', la llamada debe ser rechazada inmediatamente lanzando un error (sin ejecutar la función 'action' del downstream).
- Recuperación en HALF_OPEN: Tras expirar 'resetTimeoutMs', el breaker pasa a 'HALF_OPEN'. Si las sondas permitidas se ejecutan exitosamente, el breaker se restablece a 'CLOSED' y resetea los contadores de fallos.
- Aislamiento de fallos entre servicios: Dos instancias de CircuitBreaker con nombres de servicio distintos deben ser completamente independientes. La falla o apertura de una no debe afectar a la otra.
`;

export const CIRCUIT_BREAKER_TEST_SOURCE = `
async function runTests(module) {
  const BreakerClass = module.ResilientCircuitBreaker || global.ResilientCircuitBreaker;
  if (!BreakerClass) {
    throw new Error("La clase ResilientCircuitBreaker no fue exportada.");
  }

  const tests = [];

  // T1: Transición CLOSED -> OPEN tras superar umbral de fallos
  try {
    const t0 = Date.now();
    const breaker = new BreakerClass('payment-service', { failureThreshold: 3, resetTimeoutMs: 150, halfOpenMaxProbes: 2 });

    let downstreamCalls = 0;
    const failingService = async () => {
      downstreamCalls++;
      throw new Error('500 Internal Downstream Error');
    };

    for (let i = 0; i < 3; i++) {
      try { await breaker.execute(failingService); } catch (_) {}
    }

    const stateAfter3Failures = breaker.getState();
    const passed = stateAfter3Failures === 'OPEN' && downstreamCalls === 3;

    tests.push({
      id: 'T1_CLOSED_TO_OPEN_TRANSITION',
      passed,
      error: passed ? undefined : 'Estado esperado OPEN pero fue ' + stateAfter3Failures + ', downstreamCalls=' + downstreamCalls,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T1_CLOSED_TO_OPEN_TRANSITION', passed: false, error: String(err.message || err) });
  }

  // T2: Fail-Fast inmediato en OPEN sin tocar downstream
  try {
    const t0 = Date.now();
    const breaker = new BreakerClass('order-service', { failureThreshold: 2, resetTimeoutMs: 300 });

    try { await breaker.execute(async () => { throw new Error('err1'); }); } catch (_) {}
    try { await breaker.execute(async () => { throw new Error('err2'); }); } catch (_) {}

    let downstreamCalledWhileOpen = false;
    let rejectedQuickly = false;

    try {
      await breaker.execute(async () => {
        downstreamCalledWhileOpen = true;
        return 'should-never-run';
      });
    } catch (err) {
      rejectedQuickly = true;
    }

    const passed = breaker.getState() === 'OPEN' &&
                   !downstreamCalledWhileOpen &&
                   rejectedQuickly &&
                   breaker.getRejectedCount() >= 1;

    tests.push({
      id: 'T2_FAIL_FAST_DURING_OPEN_NO_DOWNSTREAM',
      passed,
      error: passed ? undefined : 'Falló fail-fast: downstreamCalled=' + downstreamCalledWhileOpen + ', rejectedCount=' + breaker.getRejectedCount(),
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T2_FAIL_FAST_DURING_OPEN_NO_DOWNSTREAM', passed: false, error: String(err.message || err) });
  }

  // T3: Transición a HALF_OPEN y recuperación a CLOSED tras sondas exitosas
  try {
    const t0 = Date.now();
    const resetTimeoutMs = 60;
    const breaker = new BreakerClass('inventory-service', {
      failureThreshold: 2,
      resetTimeoutMs,
      halfOpenMaxProbes: 2
    });

    try { await breaker.execute(async () => { throw new Error('err'); }); } catch (_) {}
    try { await breaker.execute(async () => { throw new Error('err'); }); } catch (_) {}

    // Esperar a que expire resetTimeoutMs
    await new Promise(r => setTimeout(r, resetTimeoutMs + 15));

    // Ejecutar 2 sondas exitosas
    const probe1 = await breaker.execute(async () => 'probe_ok_1');
    const probe2 = await breaker.execute(async () => 'probe_ok_2');

    const stateFinal = breaker.getState();
    const passed = probe1 === 'probe_ok_1' && probe2 === 'probe_ok_2' && stateFinal === 'CLOSED';

    tests.push({
      id: 'T3_HALF_OPEN_PROBES_RECOVERY_TO_CLOSED',
      passed,
      error: passed ? undefined : 'Estado final esperado CLOSED pero fue ' + stateFinal,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T3_HALF_OPEN_PROBES_RECOVERY_TO_CLOSED', passed: false, error: String(err.message || err) });
  }

  // T4: Aislamiento estricto entre dos servicios independientes
  try {
    const t0 = Date.now();
    const breakerA = new BreakerClass('ServiceA', { failureThreshold: 2, resetTimeoutMs: 100 });
    const breakerB = new BreakerClass('ServiceB', { failureThreshold: 2, resetTimeoutMs: 100 });

    // Provocar colapso en ServiceA
    try { await breakerA.execute(async () => { throw new Error('crash'); }); } catch (_) {}
    try { await breakerA.execute(async () => { throw new Error('crash'); }); } catch (_) {}

    // ServiceB debe seguir saludable y en CLOSED
    const resB = await breakerB.execute(async () => 'healthy_b');

    const passed = breakerA.getState() === 'OPEN' &&
                   breakerB.getState() === 'CLOSED' &&
                   resB === 'healthy_b';

    tests.push({
      id: 'T4_SERVICE_FAULT_ISOLATION',
      passed,
      error: passed ? undefined : 'Fallo en aislamiento: BreakerA=' + breakerA.getState() + ', BreakerB=' + breakerB.getState(),
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T4_SERVICE_FAULT_ISOLATION', passed: false, error: String(err.message || err) });
  }

  return tests;
}
`;

