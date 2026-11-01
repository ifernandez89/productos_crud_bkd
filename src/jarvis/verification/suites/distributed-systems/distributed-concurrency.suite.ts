/**
 * Escenario 3: Concurrencia Distribuida, Bloqueo Optimista e Invariantes de Inventario
 */

export const DISTRIBUTED_CONCURRENCY_PROMPT = `
Implementa un gestor de concurrencia distribuida en TypeScript llamado 'OptimisticInventoryManager' para reservas atómicas sobre stock con alta contención.

Requisitos de contrato:
1. Interfaz de StockItem:
   interface StockItem {
     sku: string;
     available: number;
     reserved: number;
     version: number;
   }

2. Interfaz de Reserva:
   interface ReservationResult {
     success: boolean;
     reservationId?: string;
     currentVersion?: number;
     error?: string;
   }

3. Métodos obligatorios:
   - constructor(initialCapacity: number, sku?: string)
   - async reserve(units: number, workerId: string, maxRetries?: number): Promise<ReservationResult>
   - async release(reservationId: string): Promise<boolean>
   - getState(): StockItem
   - getSuccessfulReservationsCount(): number

Invariantes estrictos:
- Control de colisiones: Debe emplear control de concurrencia optimista (validación de version/ETag). Si dos workers intentan reservar concurrentemente sobre la misma versión, uno actualiza y el otro detecta colisión y reintenta con backoff adaptativo.
- Invariante de Stock Absoluto: Bajo ninguna condición de carrera se puede sobrevender. En todo momento:
  available + reserved === initialCapacity
- Si hay 10 unidades disponibles y 50 workers intentan reservar 1 unidad simultáneamente, EXACTAMENTE 10 deben tener success=true y 40 deben tener success=false (o error por falta de stock).
`;

export const DISTRIBUTED_CONCURRENCY_TEST_SOURCE = `
async function runTests(module) {
  const ManagerClass = module.OptimisticInventoryManager || global.OptimisticInventoryManager;
  if (!ManagerClass) {
    throw new Error("La clase OptimisticInventoryManager no fue exportada.");
  }

  const tests = [];

  // T1: 50 workers concurrentes disputando stock limitado (10 unidades)
  try {
    const t0 = Date.now();
    const capacity = 10;
    const manager = new ManagerClass(capacity, 'SKU_RTX5070');

    // 50 workers concurrentes pidiendo 1 unidad cada uno con reintentos suficientes
    const workerPromises = [];
    for (let i = 0; i < 50; i++) {
      workerPromises.push(manager.reserve(1, 'worker_' + i, 25));
    }

    const results = await Promise.all(workerPromises);

    const successCount = results.filter(r => r && r.success).length;
    const failedCount = results.filter(r => !r || !r.success).length;
    const finalState = manager.getState();

    const invariantHolds = (finalState.available + finalState.reserved) === capacity;
    const noOversell = finalState.reserved === 10 && finalState.available === 0 && successCount === 10 && failedCount === 40;

    const passed = invariantHolds && noOversell && manager.getSuccessfulReservationsCount() === 10;

    tests.push({
      id: 'T1_50_WORKERS_HIGH_CONTENTION_INVARIANT',
      passed,
      error: passed ? undefined : 'Violación de invariante: success=' + successCount + ', reserved=' + finalState.reserved + ', available=' + finalState.available,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T1_50_WORKERS_HIGH_CONTENTION_INVARIANT', passed: false, error: String(err.message || err) });
  }

  // T2: Reintento por colisión de versión y backoff adaptativo
  try {
    const t0 = Date.now();
    const manager = new ManagerClass(5, 'SKU_TEST_RETRY');

    // Lanzar 5 reservas concurrentes sobre stock de 5
    const results = await Promise.all([
      manager.reserve(1, 'w1', 10),
      manager.reserve(1, 'w2', 10),
      manager.reserve(1, 'w3', 10),
      manager.reserve(1, 'w4', 10),
      manager.reserve(1, 'w5', 10)
    ]);

    const allSucceeded = results.every(r => r.success);
    const state = manager.getState();
    const passed = allSucceeded && state.reserved === 5 && state.available === 0 && state.version >= 5;

    tests.push({
      id: 'T2_OPTIMISTIC_RETRY_RESOLUTION',
      passed,
      error: passed ? undefined : 'Falló resolución con reintentos: reserved=' + state.reserved + ', version=' + state.version,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T2_OPTIMISTIC_RETRY_RESOLUTION', passed: false, error: String(err.message || err) });
  }

  // T3: Liberación (release) de reserva y restauración atómica
  try {
    const t0 = Date.now();
    const manager = new ManagerClass(2, 'SKU_RELEASE');

    const res1 = await manager.reserve(1, 'wA');
    const res2 = await manager.reserve(1, 'wB');
    const res3Failed = await manager.reserve(1, 'wC'); // Debe fallar sin stock

    const released = await manager.release(res1.reservationId);
    const res3Retry = await manager.reserve(1, 'wC'); // Ahora sí debe ingresar

    const state = manager.getState();
    const passed = res1.success && res2.success && !res3Failed.success &&
                   released && res3Retry.success &&
                   state.reserved === 2 && state.available === 0;

    tests.push({
      id: 'T3_RELEASE_AND_REACQUIRE_CONCURRENCY',
      passed,
      error: passed ? undefined : 'Fallo en release: released=' + released + ', res3Retry=' + res3Retry.success,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T3_RELEASE_AND_REACQUIRE_CONCURRENCY', passed: false, error: String(err.message || err) });
  }

  return tests;
}
`;
