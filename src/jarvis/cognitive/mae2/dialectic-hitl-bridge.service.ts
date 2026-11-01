import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface DialecticCandidateInput {
  sessionId: string;
  userMessage: string;
  contestedEntity?: string;
  priorBelief?: string;
  newEvidence?: string;
  confidenceScore?: number;
}

export interface DialecticCandidateResult {
  candidateId: number | string;
  evolutionSessionId: number | string;
  status: 'PENDING_APPROVAL' | 'CANDIDATE_KNOWLEDGE';
  requiresHumanReview: boolean;
  message: string;
}

@Injectable()
export class DialecticHitlBridgeService {
  private readonly logger = new Logger(DialecticHitlBridgeService.name);

  // Buffer en memoria para pruebas desacopladas y entornos sin conexión DB directa
  private readonly inMemoryCandidates: Map<
    string | number,
    {
      id: number;
      sessionId: string;
      title: string;
      content: string;
      status: 'PENDING_APPROVAL' | 'COMMITTED' | 'REJECTED' | 'QUARANTINED' | 'NEEDS_MORE_EVIDENCE';
      claimsJson: any;
      boundaryConditions: string;
      createdAt: Date;
    }
  > = new Map();
  private idCounter = 1;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Registra una contradicción epistémica detectada por MAE 2.0 como candidato HITL.
   * Garantiza CERO mutación directa de entidades consolidadas.
   */
  async registerContradictionCandidate(
    input: DialecticCandidateInput,
  ): Promise<DialecticCandidateResult> {
    const title = `Conflicto Epistémico: ${input.contestedEntity || 'Premisa Arquitectónica'}`;
    const content = `Afirmación del usuario: "${input.userMessage}". Creencia previa registrada: "${input.priorBelief || 'Consolidado histórico'}". Evidencia aportada: "${input.newEvidence || 'Declaración explícita del usuario'}".`;

    this.logger.log(
      `[DIALECTIC->HITL] Registrando contradicción en PENDING_APPROVAL para sesión ${input.sessionId}`,
    );

    // Si Prisma está disponible y conectado, persistir en base de datos PostgreSQL
    if (this.prisma) {
      try {
        const session = await this.prisma.evolutionSession.create({
          data: {
            domain: 'dialectic_audit',
            title,
            status: 'PENDING_APPROVAL',
            validationScore: input.confidenceScore ? Number((input.confidenceScore * 100).toFixed(1)) : 80.0,
            auditSummary: `MAE 2.0 detectó contradicción potencial con conocimiento persistido. Requiere revisión humana.`,
          },
        });

        const candidate = await this.prisma.candidateKnowledge.create({
          data: {
            sessionId: session.id,
            title,
            category: 'dialectic_audit',
            content,
            claimsJson: [
              {
                contestedEntity: input.contestedEntity,
                userStatement: input.userMessage,
                priorBelief: input.priorBelief,
                status: 'UNVERIFIED',
              },
            ],
            boundaryConditions: 'No muta entidades consolidadas hasta resolución explícita HITL.',
            status: 'PENDING_APPROVAL',
          },
        });

        await this.prisma.evolutionAuditLog.create({
          data: {
            sessionId: session.id,
            phase: 'AUDITING',
            agent: 'MAE2_DialecticAudit',
            action: 'CONTRADICTION_FLAGGED_FOR_HUMAN_REVIEW',
            details: {
              contestedEntity: input.contestedEntity,
              confidenceScore: input.confidenceScore,
            },
          },
        });

        return {
          candidateId: candidate.id,
          evolutionSessionId: session.id,
          status: 'PENDING_APPROVAL',
          requiresHumanReview: true,
          message: 'Candidato registrado exitosamente en cola HITL de PostgreSQL.',
        };
      } catch (err: any) {
        this.logger.warn(
          `Fallback a buffer en memoria por error DB: ${err.message}`,
        );
      }
    }

    // Fallback a buffer aislado en memoria
    const localId = this.idCounter++;
    const candidateRecord = {
      id: localId,
      sessionId: input.sessionId,
      title,
      content,
      status: 'PENDING_APPROVAL' as const,
      claimsJson: [
        {
          contestedEntity: input.contestedEntity,
          userStatement: input.userMessage,
          priorBelief: input.priorBelief,
          status: 'UNVERIFIED',
        },
      ],
      boundaryConditions: 'No muta entidades consolidadas hasta resolución explícita HITL.',
      createdAt: new Date(),
    };
    this.inMemoryCandidates.set(localId, candidateRecord);

    return {
      candidateId: localId,
      evolutionSessionId: `mem_${input.sessionId}`,
      status: 'PENDING_APPROVAL',
      requiresHumanReview: true,
      message: 'Candidato registrado en cola HITL en memoria.',
    };
  }

  /**
   * Resolución humana (HITL) de un candidato de conocimiento dialéctico.
   */
  async resolveCandidate(
    candidateId: number,
    resolution: 'COMMITTED' | 'REJECTED' | 'QUARANTINED' | 'NEEDS_MORE_EVIDENCE',
    reason: string,
    operator: string = 'human_supervisor',
  ): Promise<{ candidateId: number; newStatus: string; resolvedBy: string }> {
    if (this.prisma) {
      try {
        const candidate = await this.prisma.candidateKnowledge.findUnique({
          where: { id: candidateId },
        });

        if (candidate) {
          const sessionStatus =
            resolution === 'COMMITTED'
              ? 'COMMITTED'
              : resolution === 'REJECTED'
              ? 'REJECTED'
              : 'PENDING_APPROVAL';

          await this.prisma.candidateKnowledge.update({
            where: { id: candidateId },
            data: { status: sessionStatus },
          });

          await this.prisma.evolutionSession.update({
            where: { id: candidate.sessionId },
            data: {
              status: sessionStatus,
              approvedBy: operator,
              approvedAt: new Date(),
              auditSummary: `Resolución HITL: ${resolution}. Motivo: ${reason}`,
            },
          });

          await this.prisma.evolutionAuditLog.create({
            data: {
              sessionId: candidate.sessionId,
              phase: 'DELIBERATION',
              agent: operator,
              action: `HITL_RESOLUTION_${resolution}`,
              details: { reason, resolution },
            },
          });

          return {
            candidateId,
            newStatus: resolution,
            resolvedBy: operator,
          };
        }
      } catch (err: any) {
        this.logger.warn(`Error en DB al resolver candidato: ${err.message}`);
      }
    }

    const memCandidate = this.inMemoryCandidates.get(candidateId);
    if (!memCandidate) {
      throw new Error(`Candidato ${candidateId} no encontrado en memoria ni en DB.`);
    }

    memCandidate.status = resolution;
    return {
      candidateId,
      newStatus: resolution,
      resolvedBy: operator,
    };
  }

  /**
   * Obtiene la lista de candidatos en espera de revisión humana.
   */
  async getPendingCandidates(): Promise<any[]> {
    if (this.prisma) {
      try {
        return await this.prisma.candidateKnowledge.findMany({
          where: { status: 'PENDING_APPROVAL' },
          orderBy: { id: 'desc' },
          take: 50,
        });
      } catch {
        // fallback
      }
    }
    return Array.from(this.inMemoryCandidates.values()).filter(
      (c) => c.status === 'PENDING_APPROVAL',
    );
  }

  clearInMemory(): void {
    this.inMemoryCandidates.clear();
  }
}

