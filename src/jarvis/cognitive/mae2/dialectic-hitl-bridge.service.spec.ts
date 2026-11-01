import { DialecticHitlBridgeService } from './dialectic-hitl-bridge.service';

describe('DialecticHitlBridgeService (MAE 2.0 -> HITL)', () => {
  let service: DialecticHitlBridgeService;

  beforeEach(() => {
    service = new DialecticHitlBridgeService();
    service.clearInMemory();
  });

  it('debe registrar un candidato de contradicción en estado PENDING_APPROVAL', async () => {
    const result = await service.registerContradictionCandidate({
      sessionId: 'session_audit_test_1',
      userMessage: 'Eso es incorrecto, cambiamos el protocolo a Raft v2',
      contestedEntity: 'ConsensusEngine',
      priorBelief: 'Raft v1 con quórum simple',
      newEvidence: 'ADR-029 y commit de refactor',
      confidenceScore: 0.92,
    });

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.requiresHumanReview).toBe(true);
    expect(result.candidateId).toBeDefined();

    const pending = await service.getPendingCandidates();
    expect(pending.length).toBe(1);
    expect(pending[0].title).toContain('ConsensusEngine');
  });

  it('debe resolver un candidato a COMMITTED con trazabilidad del operador', async () => {
    const candidate = await service.registerContradictionCandidate({
      sessionId: 'session_resolve_test',
      userMessage: 'Actualizamos la variable de entorno a USE_MAE_V2',
      contestedEntity: 'ConfigService',
    });

    const resolution = await service.resolveCandidate(
      candidate.candidateId as number,
      'COMMITTED',
      'Evidencia validada en el repositorio',
      'tech_lead_user',
    );

    expect(resolution.newStatus).toBe('COMMITTED');
    expect(resolution.resolvedBy).toBe('tech_lead_user');

    // Ya no debe estar pendiente
    const pending = await service.getPendingCandidates();
    expect(pending.length).toBe(0);
  });

  it('debe resolver un candidato a REJECTED ante falsas premisas o alucinaciones', async () => {
    const candidate = await service.registerContradictionCandidate({
      sessionId: 'session_reject_test',
      userMessage: 'Afirmo falsamente que la base de datos es MySQL',
      contestedEntity: 'DatabaseEngine',
    });

    const resolution = await service.resolveCandidate(
      candidate.candidateId as number,
      'REJECTED',
      'Falsa premisa: el proyecto opera sobre PostgreSQL',
      'operator_reviewer',
    );

    expect(resolution.newStatus).toBe('REJECTED');
  });

  it('debe permitir resolución como QUARANTINED para hipótesis alternativas en conflicto', async () => {
    const candidate = await service.registerContradictionCandidate({
      sessionId: 'session_quarantine_test',
      userMessage: 'Hay dos interpretaciones posibles del alineamiento de Tiwanaku',
      contestedEntity: 'ArchaeoModule',
    });

    const resolution = await service.resolveCandidate(
      candidate.candidateId as number,
      'QUARANTINED',
      'Mantener ambas hipótesis en cuarentena hasta obtener nueva evidencia de campo',
      'archaeo_expert',
    );

    expect(resolution.newStatus).toBe('QUARANTINED');
  });
});

