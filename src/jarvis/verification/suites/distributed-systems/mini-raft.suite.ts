/**
 * Escenario 5: Consenso Distribuido Determinista (Mini-Raft State Machine)
 */

export const MINI_RAFT_PROMPT = `
Implementa una simulación determinista de consenso distribuido estilo Raft en TypeScript llamada 'MiniRaftCluster'.

Requisitos de contrato:
1. Interfaz de LogEntry:
   interface LogEntry {
     index: number;
     term: number;
     command: string;
   }

2. Interfaz de CommitResult:
   interface CommitResult {
     success: boolean;
     committedIndex?: number;
     term: number;
     error?: string;
   }

3. Métodos obligatorios en 'MiniRaftCluster':
   - constructor(nodeIds: string[])
   - async electLeader(candidateId: string): Promise<boolean>
   - async proposeCommand(command: string): Promise<CommitResult>
   - partition(isolatedNodeIds: string[]): void
   - healPartition(): void
   - getLeaderId(): string | null
   - getCurrentTerm(): number
   - getNodeLog(nodeId: string): LogEntry[]
   - getCommittedEntries(nodeId: string): LogEntry[]

Invariantes estrictos de Consenso:
- Quórum de Mayoría: Una entrada solo puede comprometerse (committed) si es replicada en al menos la mayoría estricta de los nodos del cluster (Math.floor(N / 2) + 1).
- Prohibición de Commit en Minoría: Si un líder queda en una partición minoritaria (ej. 2 de 5 nodos), NINGUNA propuesta de comando en esa partición puede tener success=true ni ser marcada como comprometida.
- Coherencia de Término y Reconciliación: Cuando la partición sana, los nodos de la minoría deben adoptar el término mayor de la mayoría y sincronizar sus logs comprometidos.
`;

export const MINI_RAFT_TEST_SOURCE = `
async function runTests(module) {
  const ClusterClass = module.MiniRaftCluster || global.MiniRaftCluster;
  if (!ClusterClass) {
    throw new Error("La clase MiniRaftCluster no fue exportada.");
  }

  const tests = [];

  // T1: Elección de líder con quórum mayoritario
  try {
    const t0 = Date.now();
    const cluster = new ClusterClass(['N1', 'N2', 'N3', 'N4', 'N5']);

    const electionOk = await cluster.electLeader('N1');
    const leader = cluster.getLeaderId();
    const term = cluster.getCurrentTerm();

    const passed = electionOk && leader === 'N1' && term >= 1;

    tests.push({
      id: 'T1_LEADER_ELECTION_MAJORITY',
      passed,
      error: passed ? undefined : 'Falló elección: leader=' + leader + ', term=' + term,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T1_LEADER_ELECTION_MAJORITY', passed: false, error: String(err.message || err) });
  }

  // T2: Replicación de log con quórum completo
  try {
    const t0 = Date.now();
    const cluster = new ClusterClass(['N1', 'N2', 'N3', 'N4', 'N5']);
    await cluster.electLeader('N1');

    const res1 = await cluster.proposeCommand('SET x = 10');
    const res2 = await cluster.proposeCommand('SET y = 20');

    const committedN1 = cluster.getCommittedEntries('N1');
    const committedN3 = cluster.getCommittedEntries('N3');

    const passed = res1.success && res2.success &&
                   res1.committedIndex === 1 &&
                   res2.committedIndex === 2 &&
                   committedN1.length === 2 &&
                   committedN3.length === 2 &&
                   committedN1[0].command === 'SET x = 10';

    tests.push({
      id: 'T2_LOG_REPLICATION_QUORUM_COMMIT',
      passed,
      error: passed ? undefined : 'Fallo en replicación: res1=' + res1.success + ', res2=' + res2.success,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T2_LOG_REPLICATION_QUORUM_COMMIT', passed: false, error: String(err.message || err) });
  }

  // T3: Invariante Crítico: Partición de red -> La minoría NUNCA puede comprometer
  try {
    const t0 = Date.now();
    const cluster = new ClusterClass(['N1', 'N2', 'N3', 'N4', 'N5']);
    await cluster.electLeader('N1');
    await cluster.proposeCommand('CMD_BASE');

    // Partición: Aislar N1 y N2 en minoría (2 nodos). Mayoría = [N3, N4, N5] (3 nodos).
    cluster.partition(['N1', 'N2']);

    // Proponer comando a la minoría con el viejo líder N1
    const minorityResult = await cluster.proposeCommand('CMD_MINORITY_ROGUE');

    const committedInN1 = cluster.getCommittedEntries('N1');
    const rogueEntryCommitted = committedInN1.some(e => e.command === 'CMD_MINORITY_ROGUE');

    // Invariante: success debe ser FALSE y no debe haber sido comprometida
    const passed = !minorityResult.success && !rogueEntryCommitted;

    tests.push({
      id: 'T3_MINORITY_PARTITION_CANNOT_COMMIT_INVARIANT',
      passed,
      error: passed ? undefined : 'VIOLACIÓN CRÍTICA: Se permitió commit en minoría (success=' + minorityResult.success + ', committed=' + rogueEntryCommitted + ')',
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T3_MINORITY_PARTITION_CANNOT_COMMIT_INVARIANT', passed: false, error: String(err.message || err) });
  }

  // T4: Mayoría elige nuevo líder y reconcilia al sanar partición
  try {
    const t0 = Date.now();
    const cluster = new ClusterClass(['N1', 'N2', 'N3', 'N4', 'N5']);
    await cluster.electLeader('N1');
    await cluster.proposeCommand('INIT');

    // Partición: minoría [N1, N2] vs mayoría [N3, N4, N5]
    cluster.partition(['N1', 'N2']);

    // La mayoría elige a N3 como nuevo líder
    const newElection = await cluster.electLeader('N3');
    const majorityResult = await cluster.proposeCommand('CMD_MAJORITY_VALID');

    // Sanar partición
    cluster.healPartition();

    const committedN1 = cluster.getCommittedEntries('N1');
    const committedN3 = cluster.getCommittedEntries('N3');

    const passed = newElection &&
                   majorityResult.success &&
                   committedN3.some(e => e.command === 'CMD_MAJORITY_VALID') &&
                   committedN1.some(e => e.command === 'CMD_MAJORITY_VALID');

    tests.push({
      id: 'T4_MAJORITY_PROGRESS_AND_HEAL_RECONCILIATION',
      passed,
      error: passed ? undefined : 'Fallo en reconciliación tras partición: newElection=' + newElection + ', majorityResult=' + majorityResult.success,
      durationMs: Date.now() - t0
    });
  } catch (err) {
    tests.push({ id: 'T4_MAJORITY_PROGRESS_AND_HEAL_RECONCILIATION', passed: false, error: String(err.message || err) });
  }

  return tests;
}
`;

