import { Test, TestingModule } from '@nestjs/testing';
import {
  KnowledgeAccessService,
  KnowledgeGraphQuery,
} from './knowledge-access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RevocationStatus, KnowledgeEntityType } from '@prisma/client';

describe('KnowledgeAccessService', () => {
  let service: KnowledgeAccessService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      knowledgeEntitySource: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      knowledgeEntity: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      knowledgeRelation: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      document: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      chunk: {
        updateMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      topicSnapshot: {
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeAccessService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<KnowledgeAccessService>(KnowledgeAccessService);
  });

  describe('getActiveEntities', () => {
    it('should always enforce revocationStatus == ACTIVE and clamp limit', async () => {
      prismaMock.knowledgeEntity.findMany.mockResolvedValue([
        { id: 1, name: 'Paxos', revocationStatus: RevocationStatus.ACTIVE },
      ]);

      const result = await service.getActiveEntities('Paxos', undefined, 100);

      expect(prismaMock.knowledgeEntity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            revocationStatus: RevocationStatus.ACTIVE,
          }),
          take: 50, // Clamped to 50 max
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('queryKnowledgeGraph', () => {
    it('should clamp depth to [1, 3] and enforce ACTIVE relations and targets', async () => {
      prismaMock.knowledgeEntity.findMany.mockResolvedValue([
        {
          id: 10,
          name: 'Raft',
          type: KnowledgeEntityType.CONCEPT,
          confidence: 0.95,
          revocationStatus: RevocationStatus.ACTIVE,
        },
      ]);

      prismaMock.knowledgeRelation.findMany
        .mockResolvedValueOnce([
          {
            sourceId: 10,
            targetId: 20,
            source: { id: 10, name: 'Raft' },
            target: {
              id: 20,
              name: 'Leader Election',
              type: KnowledgeEntityType.CONCEPT,
              confidence: 0.9,
              revocationStatus: RevocationStatus.ACTIVE,
            },
            relationType: 'RELATED_TO',
            confidence: 0.9,
            sourceDocId: 101,
            quote: 'Raft uses leader election to ensure consensus',
          },
        ])
        .mockResolvedValue([]);

      prismaMock.document.findMany.mockResolvedValue([
        {
          id: 101,
          title: 'In Search of an Understandable Consensus Algorithm',
          revocationStatus: RevocationStatus.ACTIVE,
        },
      ]);

      const query: KnowledgeGraphQuery = {
        entity: 'Raft',
        maxDepth: 5, // Exceeds max depth of 3 -> will be clamped to 3
        limit: 10,
        includeProvenance: true,
      };

      const res = await service.queryKnowledgeGraph(query);

      expect(res.activeOnlyEnforced).toBe(true);
      expect(res.entities).toHaveLength(2);
      expect(res.relations).toHaveLength(1);
      expect(res.provenance).toHaveLength(1);
      expect(res.provenance[0].documentTitle).toBe(
        'In Search of an Understandable Consensus Algorithm',
      );
    });
  });

  describe('revokeDocument (Integral Rollback & M:N Provenance)', () => {
    it('should NOT revoke an entity if it still has another active source document', async () => {
      const docId = 42;

      // Entity #1 has 1 other active source
      prismaMock.knowledgeEntitySource.findMany.mockResolvedValue([
        { entityId: 1 },
      ]);
      prismaMock.knowledgeEntitySource.count.mockResolvedValue(1); // 1 active source left
      prismaMock.knowledgeEntity.findUnique.mockResolvedValue({
        id: 1,
        name: 'Idempotency Key Pattern',
        revocationStatus: RevocationStatus.ACTIVE,
      });

      const report = await service.revokeDocument(docId, 'Testing rollback');

      expect(prismaMock.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: docId },
          data: expect.objectContaining({
            revocationStatus: RevocationStatus.REVOKED,
          }),
        }),
      );

      // Entity should remain ACTIVE
      expect(prismaMock.knowledgeEntity.update).not.toHaveBeenCalled();
      expect(report.affectedEntities[0].newStatus).toBe(RevocationStatus.ACTIVE);
      expect(report.affectedEntities[0].remainingActiveSources).toBe(1);
      expect(report.revokedEntitiesCount).toBe(0);
    });

    it('should revoke an entity if NO active sources remain (orphan entity)', async () => {
      const docId = 99;

      prismaMock.knowledgeEntitySource.findMany.mockResolvedValue([
        { entityId: 2 },
      ]);
      prismaMock.knowledgeEntitySource.count.mockResolvedValue(0); // 0 active sources left
      prismaMock.knowledgeEntity.findUnique.mockResolvedValue({
        id: 2,
        name: 'Obsolete Algorithm',
        revocationStatus: RevocationStatus.ACTIVE,
      });

      const report = await service.revokeDocument(docId, 'Flawed paper');

      // Entity should be marked REVOKED
      expect(prismaMock.knowledgeEntity.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 2 },
          data: expect.objectContaining({
            revocationStatus: RevocationStatus.REVOKED,
          }),
        }),
      );
      expect(report.affectedEntities[0].newStatus).toBe(RevocationStatus.REVOKED);
      expect(report.revokedEntitiesCount).toBe(1);
    });
  });
});
