/**
 * Escenario 2: Consistencia Eventual, Version Vectors y LWW Determinista
 */

export const EVENTUAL_CONSISTENCY_PROMPT = `
Implementa un sistema de replicación eventual en TypeScript que distinga explícitamente entre detección causal (Version Vectors) y resolución de conflictos de último escritor (LWW-Register con desempate determinista).

Exporta las dos clases siguientes:

1. 'VersionVectorClock':
   - constructor(nodeId: string)
   - increment(): Record<string, number>
   - getClock(): Record<string, number>
   - update(remoteClock: Record<string, number>): void
   - static compare(clockA: Record<string, number>, clockB: Record<string, number>): 'GREATER' | 'LESS' | 'EQUAL' | 'CONCURRENT'

2. 'LWWReplica<T>':
   - constructor(nodeId: string)
   - write(key: string, value: T, timestamp?: number): void
   - read(key: string): { value: T | undefined; timestamp: number; writerNodeId: string } | undefined
   - merge(remoteRegisterData: Record<string, { value: T; timestamp: number; writerNodeId: string }>): void
   - getAllData(): Record<string, { value: T; timestamp: number; writerNodeId: string }>

Invariantes estrictos:
- Version Vectors: Si clockA tiene todos los contadores >= clockB y al menos uno estrictamente mayor, clockA es 'GREATER'. Si ni A domina a B ni B domina a A, la comparación es 'CONCURRENT'.
- LWW Determinista: En colisiones con el mismo timestamp físico, el desempate DEBE resolverse determinísticamente usando el 'writerNodeId' (ej. orden lexicográfico: 'nodeC' > 'nodeB' > 'nodeA'), garantizando convergencia idéntica en el 100% de las réplicas.
`;

export const EVENTUAL_CONSISTENCY_TEST_SOURCE = `
async function runTests(module) {
  const ClockClass = module.VersionVectorClock || global.VersionVectorClock;
  const ReplicaClass = module.LWWReplica || global.LWWReplica;

  if (!ClockClass || !ReplicaClass) {
    throw new Error("Debe exportar VersionVectorClock y LWWReplica.");
  }

  const tests = [];

  // T1: Detección causal de Version Vectors (GREATER / LESS / EQUAL)
  try {
    const t0 = Date.now();
    const v1 = { A: 2, B: 1 };
    const v2 = { A: 1, B: 1 };
    const vEqual = { A: 2, B: 1 };

    const cmp1 = ClockClass.compare(v1, v2);
    const cmp2 = ClockClass.compare(v2, v1);
    const cmpEqual = ClockClass.compare(v1, vEqual);

    const passed = cmp1 === 'GREATER' && cmp2 === 'LESS' && cmpEqual === 'EQUAL';
    tests.push({
      id: 'T1_VERSION_VECTOR_CAUSALITY',
      passed,
      error: passed ? undefined : 'Falló comparación causal: cmp1=' + cmp1 + ', cmp2=' + cmp2 + ', cmpEqual=' + cmpEqual,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T1_VERSION_VECTOR_CAUSALITY', passed: false, error: String(err.message || err) });
  }

  // T2: Detección de concurrencia y bifurcación
  try {
    const t0 = Date.now();
    const vForkA = { A: 3, B: 1, C: 0 };
    const vForkB = { A: 2, B: 2, C: 0 };

    const cmpConcurrent = ClockClass.compare(vForkA, vForkB);
    const passed = cmpConcurrent === 'CONCURRENT';

    tests.push({
      id: 'T2_VERSION_VECTOR_CONCURRENCY',
      passed,
      error: passed ? undefined : 'Se esperaba CONCURRENT pero se obtuvo: ' + cmpConcurrent,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T2_VERSION_VECTOR_CONCURRENCY', passed: false, error: String(err.message || err) });
  }

  // T3: LWW Desempate determinista ante timestamps idénticos
  try {
    const t0 = Date.now();
    const repA = new ReplicaClass('nodeA');
    const repB = new ReplicaClass('nodeB');

    const fixedTs = 1700000000;
    // Dos escrituras sobre la misma clave en nodos distintos con el mismo timestamp
    repA.write('config_x', 'VALOR_DE_A', fixedTs);
    repB.write('config_x', 'VALOR_DE_B', fixedTs);

    // Reconciliación cruzada
    repA.merge(repB.getAllData());
    repB.merge(repA.getAllData());

    const readA = repA.read('config_x');
    const readB = repB.read('config_x');

    // Desempate lexicográfico: 'nodeB' > 'nodeA', por ende debe ganar VALOR_DE_B en ambos
    const passed = readA.value === readB.value &&
                   readA.value === 'VALOR_DE_B' &&
                   readA.writerNodeId === 'nodeB';

    tests.push({
      id: 'T3_LWW_IDENTICAL_TIMESTAMP_TIE_BREAKER',
      passed,
      error: passed ? undefined : 'Divergencia en desempate: readA=' + JSON.stringify(readA) + ', readB=' + JSON.stringify(readB),
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T3_LWW_IDENTICAL_TIMESTAMP_TIE_BREAKER', passed: false, error: String(err.message || err) });
  }

  // T4: Reconciliación de 3 nodos tras partición temporal
  try {
    const t0 = Date.now();
    const node1 = new ReplicaClass('node1');
    const node2 = new ReplicaClass('node2');
    const node3 = new ReplicaClass('node3');

    // Estado inicial sincronizado
    node1.write('k1', 'initial_v1', 100);
    node2.merge(node1.getAllData());
    node3.merge(node1.getAllData());

    // Partición: node1 y node2 actualizan k1 con timestamps distintos; node3 escribe k2
    node1.write('k1', 'update_v1', 200);
    node2.write('k1', 'update_v2_newer', 300);
    node3.write('k2', 'value_k2', 250);

    // Sanar partición: sincronización total de anillo
    node1.merge(node2.getAllData());
    node1.merge(node3.getAllData());

    node2.merge(node1.getAllData());
    node3.merge(node1.getAllData());

    const allK1_1 = node1.read('k1')?.value;
    const allK1_2 = node2.read('k1')?.value;
    const allK1_3 = node3.read('k1')?.value;

    const allK2_1 = node1.read('k2')?.value;
    const allK2_2 = node2.read('k2')?.value;
    const allK2_3 = node3.read('k2')?.value;

    const passed = allK1_1 === 'update_v2_newer' &&
                   allK1_2 === 'update_v2_newer' &&
                   allK1_3 === 'update_v2_newer' &&
                   allK2_1 === 'value_k2' &&
                   allK2_2 === 'value_k2' &&
                   allK2_3 === 'value_k2';

    tests.push({
      id: 'T4_THREE_NODE_PARTITION_CONVERGENCE',
      passed,
      error: passed ? undefined : 'Fallo de convergencia en 3 nodos: k1=[' + allK1_1 + ',' + allK1_2 + ',' + allK1_3 + ']',
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T4_THREE_NODE_PARTITION_CONVERGENCE', passed: false, error: String(err.message || err) });
  }

  return tests;
}
`;

