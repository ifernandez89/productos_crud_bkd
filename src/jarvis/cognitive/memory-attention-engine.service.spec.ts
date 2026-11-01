import { Test, TestingModule } from '@nestjs/testing';
import {
  MemoryAttentionEngineService,
} from './memory-attention-engine.service';
import { KnowledgeAccessService } from '../knowledge/knowledge-access.service';
import { RevocationStatus, KnowledgeEntityType } from '@prisma/client';

describe('MemoryAttentionEngineService', () => {
  let service: MemoryAttentionEngineService;
  let knowledgeAccessMock: any;

  beforeEach(async () => {
    knowledgeAccessMock = {
      queryKnowledgeGraph: jest.fn().mockResolvedValue({
        entities: [
          {
            id: 1,
            name: 'Raft',
            type: KnowledgeEntityType.CONCEPT,
            confidence: 1.0,
            revocationStatus: RevocationStatus.ACTIVE,
          },
        ],
        relations: [],
        provenance: [],
        truncated: false,
        activeOnlyEnforced: true,
        queryLatencyMs: 5,
      }),
      getActiveTopicSnapshots: jest.fn().mockResolvedValue([
        {
          id: 1,
          topic: 'Idempotency',
          conclusion: 'Transactional outbox avoids duplicate side effects',
          revocationStatus: RevocationStatus.ACTIVE,
        },
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryAttentionEngineService,
        { provide: KnowledgeAccessService, useValue: knowledgeAccessMock },
      ],
    }).compile();

    service = module.get<MemoryAttentionEngineService>(
      MemoryAttentionEngineService,
    );
  });

  describe('evaluateAttentionPolicy', () => {
    it('should assign FACTUAL focus with no tools for simple factual inquiries', () => {
      const policy = service.evaluateAttentionPolicy('¿Qué es un vector embedding?');
      expect(policy.suggestedFocus).toBe('FACTUAL');
      expect(policy.enableRag).toBe(true);
      expect(policy.enableGraphTool).toBe(false);
      expect(policy.enableSnapshotTool).toBe(false);
      expect(policy.allowedTools).toHaveLength(0);
    });

    it('should assign RELATIONAL focus and enable graph tool for dependency queries', () => {
      const policy = service.evaluateAttentionPolicy(
        '¿Cómo se relaciona Raft con Paxos y qué dependencias ontológicas comparten?',
      );
      expect(policy.suggestedFocus).toBe('RELATIONAL');
      expect(policy.enableGraphTool).toBe(true);
      expect(policy.allowedTools).toContain('query_knowledge_graph');
    });

    it('should assign EVOLUTIONARY focus and enable snapshot tool for historical queries', () => {
      const policy = service.evaluateAttentionPolicy(
        '¿Cómo cambió nuestra conclusión previa sobre la arquitectura de Postgres?',
      );
      expect(policy.suggestedFocus).toBe('EVOLUTIONARY');
      expect(policy.enableSnapshotTool).toBe(true);
      expect(policy.allowedTools).toContain('fetch_topic_snapshot');
    });

    it('should handle causal inference without forcing static context', () => {
      const policy = service.evaluateAttentionPolicy(
        'Explica la condición de carrera en este algoritmo de concurrencia distribuida',
      );
      expect(policy.suggestedFocus).toBe('CAUSAL_INFERENCE');
      expect(policy.enableGraphTool).toBe(true);
      expect(policy.enableSnapshotTool).toBe(false);
    });

    it('should activate dialectic gate and enable both tools when contradiction is detected', () => {
      const policy = service.evaluateAttentionPolicy(
        'El artículo afirma que 2PC es tolerante a particiones',
        { hasPriorContradiction: true },
      );
      expect(policy.suggestedFocus).toBe('HYBRID');
      expect(policy.activateDialecticGate).toBe(true);
      expect(policy.enableGraphTool).toBe(true);
      expect(policy.enableSnapshotTool).toBe(true);
    });
  });

  describe('executeToolCall', () => {
    it('should route query_knowledge_graph to KnowledgeAccessService', async () => {
      const res = await service.executeToolCall('query_knowledge_graph', {
        entity: 'Raft',
        maxDepth: 2,
      });

      expect(knowledgeAccessMock.queryKnowledgeGraph).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'Raft', maxDepth: 2 }),
      );
      expect(res.success).toBe(true);
      expect(res.result.entities).toHaveLength(1);
    });

    it('should route fetch_topic_snapshot to KnowledgeAccessService', async () => {
      const res = await service.executeToolCall('fetch_topic_snapshot', {
        topic: 'Idempotency',
      });

      expect(knowledgeAccessMock.getActiveTopicSnapshots).toHaveBeenCalledWith(
        'Idempotency',
        3,
      );
      expect(res.success).toBe(true);
      expect(res.result).toHaveLength(1);
    });

    it('should return error for unauthorized or unknown tool', async () => {
      const res = await service.executeToolCall('delete_database', {});
      expect(res.success).toBe(false);
      expect(res.error).toContain('Herramienta desconocida');
    });
  });
});

