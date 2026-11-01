/**
 * Escenario 1: Idempotencia y Deduplicación con Semántica de Negocio
 */

export const IDEMPOTENCY_PROMPT = `
Implementa una clase TypeScript llamada 'IdempotentEventProcessor' que garantice procesamiento seguro de eventos con efecto de negocio una sola vez ante reintentos y duplicados.

Requisitos técnicos y de contrato:
1. Interfaz del evento:
   interface EventMessage<TPayload = any> {
     eventId: string;
     payload: TPayload;
     timestamp: number;
   }

2. Interfaz del resultado:
   interface ProcessResult<T = any> {
     status: 'PROCESSED' | 'DUPLICATE' | 'CONFLICT';
     result?: T;
     error?: string;
   }

3. Métodos obligatorios:
   - constructor(handler: (payload: any) => Promise<any>)
   - async process(event: EventMessage): Promise<ProcessResult>
   - getProcessedCount(): number

4. Invariantes estrictos:
   - Duplicado Legítimo: Mismo 'eventId' y mismo payload (o hash idéntico) -> Retorna status 'DUPLICATE' con el 'result' original en caché, SIN reejecutar el handler secundario.
   - Conflicto de Identidad: Mismo 'eventId' pero con payload divergente -> Retorna status 'CONFLICT', NO reejecuta el handler, NO sobreescribe el estado original y devuelve un mensaje de error.
   - Eventos Distintos: Distinto 'eventId' con payload idéntico -> Tratados como eventos válidos independientes y ejecutados.
   - Concurrencia segura: Si dos llamadas concurrentes con el mismo 'eventId' llegan simultáneamente, solo una debe ejecutar el handler; la otra debe esperar o recibir el resultado deduplicado.
`;

export const IDEMPOTENCY_TEST_SOURCE = `
async function runTests(module) {
  const ProcessorClass = module.IdempotentEventProcessor || global.IdempotentEventProcessor;
  if (!ProcessorClass) {
    throw new Error("La clase IdempotentEventProcessor no fue exportada.");
  }

  const tests = [];

  // T1: Procesamiento inicial y duplicado legítimo
  try {
    const t0 = Date.now();
    let handlerExecutions = 0;
    const processor = new ProcessorClass(async (payload) => {
      handlerExecutions++;
      return { confirmationId: 'CONF_' + payload.orderId, amount: payload.amount };
    });

    const ev1 = { eventId: 'evt_100', payload: { orderId: 1, amount: 50 }, timestamp: 1000 };
    const res1 = await processor.process(ev1);
    const res2 = await processor.process(ev1); // duplicado legítimo

    const passed = res1.status === 'PROCESSED' &&
                   res2.status === 'DUPLICATE' &&
                   res1.result.confirmationId === 'CONF_1' &&
                   res2.result.confirmationId === 'CONF_1' &&
                   handlerExecutions === 1 &&
                   processor.getProcessedCount() === 1;

    tests.push({
      id: 'T1_LEGITIMATE_DUPLICATE',
      passed,
      error: passed ? undefined : 'Falló deduplicación legítima: handlerExecutions=' + handlerExecutions + ', status2=' + res2.status,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T1_LEGITIMATE_DUPLICATE', passed: false, error: String(err.message || err) });
  }

  // T2: Conflicto de identidad (mismo ID, payload disímil)
  try {
    const t0 = Date.now();
    let handlerExecutions = 0;
    const processor = new ProcessorClass(async (p) => {
      handlerExecutions++;
      return { total: p.value };
    });

    const evOrig = { eventId: 'evt_conflict_1', payload: { value: 100 }, timestamp: 1000 };
    const evMuted = { eventId: 'evt_conflict_1', payload: { value: 9999 }, timestamp: 1050 };

    const resOrig = await processor.process(evOrig);
    const resConflict = await processor.process(evMuted);

    const passed = resOrig.status === 'PROCESSED' &&
                   resConflict.status === 'CONFLICT' &&
                   handlerExecutions === 1 &&
                   resOrig.result.total === 100 &&
                   Boolean(resConflict.error);

    tests.push({
      id: 'T2_IDENTITY_CONFLICT_MUTATED_PAYLOAD',
      passed,
      error: passed ? undefined : 'Falló detección de conflicto: status=' + resConflict.status + ', handlerExecutions=' + handlerExecutions,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T2_IDENTITY_CONFLICT_MUTATED_PAYLOAD', passed: false, error: String(err.message || err) });
  }

  // T3: Mismo payload con distinto eventId (ambos legítimos)
  try {
    const t0 = Date.now();
    let handlerExecutions = 0;
    const processor = new ProcessorClass(async (p) => {
      handlerExecutions++;
      return { item: p.item };
    });

    const resA = await processor.process({ eventId: 'evt_A', payload: { item: 'book' }, timestamp: 1000 });
    const resB = await processor.process({ eventId: 'evt_B', payload: { item: 'book' }, timestamp: 1010 });

    const passed = resA.status === 'PROCESSED' &&
                   resB.status === 'PROCESSED' &&
                   handlerExecutions === 2 &&
                   processor.getProcessedCount() === 2;

    tests.push({
      id: 'T3_DISTINCT_IDS_SAME_PAYLOAD',
      passed,
      error: passed ? undefined : 'Falló tratamiento de eventos distintos: executions=' + handlerExecutions,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T3_DISTINCT_IDS_SAME_PAYLOAD', passed: false, error: String(err.message || err) });
  }

  // T4: Inyección masiva concurrente con 40% duplicados
  try {
    const t0 = Date.now();
    let sideEffectsTotal = 0;
    const processor = new ProcessorClass(async (p) => {
      // Simular delay asíncrono no determinista para inducir race conditions
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5) + 1));
      sideEffectsTotal += p.amount;
      return { credited: p.amount };
    });

    const uniqueCount = 50;
    const events = [];
    for (let i = 0; i < uniqueCount; i++) {
      events.push({ eventId: 'id_' + i, payload: { amount: 10 }, timestamp: 1000 + i });
    }
    // Duplicados del 40% (20 eventos duplicados)
    for (let i = 0; i < 20; i++) {
      events.push({ eventId: 'id_' + (i % uniqueCount), payload: { amount: 10 }, timestamp: 2000 + i });
    }

    // Mezclar aleatoriamente
    events.sort(() => Math.random() - 0.5);

    // Enviar todas las promesas de forma concurrente
    const results = await Promise.all(events.map(ev => processor.process(ev)));

    const expectedTotal = uniqueCount * 10;
    const processedResults = results.filter(r => r.status === 'PROCESSED').length;
    const duplicateResults = results.filter(r => r.status === 'DUPLICATE').length;

    const passed = sideEffectsTotal === expectedTotal &&
                   processedResults === uniqueCount &&
                   duplicateResults === 20 &&
                   processor.getProcessedCount() === uniqueCount;

    tests.push({
      id: 'T4_CONCURRENT_HIGH_VOLUME_INVARIANT',
      passed,
      error: passed ? undefined : 'Violación de invariante: sideEffects=' + sideEffectsTotal + ' (esperado=' + expectedTotal + '), processed=' + processedResults + ', duplicates=' + duplicateResults,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T4_CONCURRENT_HIGH_VOLUME_INVARIANT', passed: false, error: String(err.message || err) });
  }

  return tests;
}
`;

