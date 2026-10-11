import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface QueryAnalysis {
  entities: string[];
  ambiguous: boolean;
  contextNeeded: string[];
}

export interface RetrievalResult {
  method: 'vector' | 'textual' | 'hybrid';
  chunks: Array<{
    id: number;
    score: number;
    docTitle: string;
    author: string;
    relevant: boolean;
  }>;
  coverageScore: number;
  distractorsCount: number;
}

export interface AuditResult {
  report: string;
  premisesChecked: Array<{
    premise: string;
    documentalSupport: boolean;
    empiricalSupport: 'demonstrated' | 'hypothesis' | 'speculation' | 'pseudoscience' | 'unknown';
  }>;
  attributionsValid: boolean;
}

export interface SynthesisResult {
  hypothesesCount: number;
  evidenceGaps: string[];
  uncertaintyLevel: number; // 0-1
}

export interface CognitiveTraceData {
  agentRunId: number;
  queryAnalysis?: QueryAnalysis;
  retrievalResult?: RetrievalResult;
  auditResult?: AuditResult;
  synthesisResult?: SynthesisResult;
}

/**
 * Servicio de Trazabilidad Cognitiva
 * 
 * Registra el recorrido REAL del proceso cognitivo, no una reconstrucción
 * retrospectiva. Cada etapa registra lo que realmente ocurrió mientras se ejecuta.
 */
@Injectable()
export class CognitiveTraceService {
  private readonly logger = new Logger(CognitiveTraceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crea una traza cognitiva completa asociada a un AgentRun
   */
  async createTrace(data: CognitiveTraceData): Promise<void> {
    try {
      await this.prisma.cognitiveExecutionTrace.create({
        data: {
          agentRunId: data.agentRunId,
          
          // Query analysis
          queryEntities: data.queryAnalysis 
            ? JSON.stringify(data.queryAnalysis.entities) 
            : null,
          queryAmbiguous: data.queryAnalysis?.ambiguous ?? false,
          contextNeeded: data.queryAnalysis 
            ? JSON.stringify(data.queryAnalysis.contextNeeded)
            : null,
          
          // Retrieval
          retrievalMethod: data.retrievalResult?.method ?? null,
          chunksRetrieved: data.retrievalResult 
            ? JSON.stringify(data.retrievalResult.chunks)
            : null,
          coverageScore: data.retrievalResult?.coverageScore ?? null,
          distractorsFound: data.retrievalResult?.distractorsCount ?? null,
          
          // Audit
          auditReport: data.auditResult?.report ?? null,
          premisesChecked: data.auditResult 
            ? JSON.stringify(data.auditResult.premisesChecked)
            : null,
          attributionsValid: data.auditResult?.attributionsValid ?? null,
          
          // Synthesis
          hypothesesCount: data.synthesisResult?.hypothesesCount ?? null,
          evidenceGaps: data.synthesisResult 
            ? JSON.stringify(data.synthesisResult.evidenceGaps)
            : null,
          uncertaintyLevel: data.synthesisResult?.uncertaintyLevel ?? null,
        },
      });

      this.logger.log(`Traza cognitiva registrada para AgentRun #${data.agentRunId}`);
    } catch (error: any) {
      this.logger.error(`Error registrando traza cognitiva: ${error.message}`);
      // No fallar la ejecución principal por error de observabilidad
    }
  }

  /**
   * Registra afirmaciones individuales y su evidencia
   */
  async recordClaims(
    agentRunId: number,
    claims: Array<{
      claim: string;
      status: 'supported' | 'contradicted' | 'partially_supported' | 'inference' | 'speculative' | 'unverified';
      supportingChunkIds?: number[];
      contradictingChunkIds?: number[];
      author?: string;
      document?: string;
      limitations?: string[];
    }>,
  ): Promise<void> {
    try {
      await this.prisma.claimEvidence.createMany({
        data: claims.map((c) => ({
          agentRunId,
          claim: c.claim,
          status: c.status,
          supportingChunkIds: c.supportingChunkIds 
            ? JSON.stringify(c.supportingChunkIds)
            : null,
          contradictingChunkIds: c.contradictingChunkIds 
            ? JSON.stringify(c.contradictingChunkIds)
            : null,
          author: c.author ?? null,
          document: c.document ?? null,
          limitations: c.limitations ? JSON.stringify(c.limitations) : null,
        })),
      });

      this.logger.log(`${claims.length} afirmaciones registradas para AgentRun #${agentRunId}`);
    } catch (error: any) {
      this.logger.error(`Error registrando afirmaciones: ${error.message}`);
    }
  }

  /**
   * Obtiene la traza completa de una ejecución para inspección
   */
  async getTrace(agentRunId: number) {
    const [run, trace, claims] = await Promise.all([
      this.prisma.agentRun.findUnique({ where: { id: agentRunId } }),
      this.prisma.cognitiveExecutionTrace.findUnique({
        where: { agentRunId },
      }),
      this.prisma.claimEvidence.findMany({
        where: { agentRunId },
      }),
    ]);

    if (!run) {
      return null;
    }

    return {
      // Datos básicos del run
      id: run.id,
      sessionId: run.sessionId,
      question: run.question,
      answer: run.answer,
      modelUsed: run.modelUsed,
      durationMs: run.durationMs,
      success: run.success,
      
      // Intent y routing
      intentClassified: run.intentClassified,
      intentConfidence: run.intentConfidence,
      
      // Recuperación RAG
      ragContextUsed: run.ragContextUsed,
      chunksCount: run.chunksRetrievedCount,
      
      // Pipeline dialéctico
      dialecticUsed: run.dialecticUsed,
      auditPhaseMs: run.auditPhaseMs,
      synthesisPhaseMs: run.synthesisPhaseMs,
      tensionsDetected: run.tensionsDetected,
      
      // Traza detallada
      trace: trace ? {
        queryAnalysis: {
          entities: trace.queryEntities ? JSON.parse(trace.queryEntities) : [],
          ambiguous: trace.queryAmbiguous,
          contextNeeded: trace.contextNeeded ? JSON.parse(trace.contextNeeded) : [],
        },
        retrieval: {
          method: trace.retrievalMethod,
          chunks: trace.chunksRetrieved ? JSON.parse(trace.chunksRetrieved) : [],
          coverageScore: trace.coverageScore,
          distractorsFound: trace.distractorsFound,
        },
        audit: trace.auditReport ? {
          report: trace.auditReport,
          premisesChecked: trace.premisesChecked ? JSON.parse(trace.premisesChecked) : [],
          attributionsValid: trace.attributionsValid,
        } : null,
        synthesis: {
          hypothesesCount: trace.hypothesesCount,
          evidenceGaps: trace.evidenceGaps ? JSON.parse(trace.evidenceGaps) : [],
          uncertaintyLevel: trace.uncertaintyLevel,
        },
      } : null,
      
      // Afirmaciones
      claims: claims.map((c) => ({
        claim: c.claim,
        status: c.status,
        supportingChunkIds: c.supportingChunkIds ? JSON.parse(c.supportingChunkIds) : [],
        contradictingChunkIds: c.contradictingChunkIds ? JSON.parse(c.contradictingChunkIds) : [],
        author: c.author,
        document: c.document,
        limitations: c.limitations ? JSON.parse(c.limitations) : [],
      })),
    };
  }

  /**
   * Obtiene estadísticas de observabilidad
   */
  async getStats() {
    const [totalRuns, withDialectic, withRAG, avgCoverage, claimsByStatus] = await Promise.all([
      this.prisma.agentRun.count(),
      this.prisma.agentRun.count({ where: { dialecticUsed: true } }),
      this.prisma.agentRun.count({ where: { ragContextUsed: true } }),
      this.prisma.cognitiveExecutionTrace.aggregate({
        _avg: { coverageScore: true },
      }),
      this.prisma.claimEvidence.groupBy({
        by: ['status'],
        _count: true,
      }),
    ]);

    return {
      totalRuns,
      withDialectic,
      withRAG,
      ragUsageRate: totalRuns > 0 ? (withRAG / totalRuns) * 100 : 0,
      dialecticUsageRate: totalRuns > 0 ? (withDialectic / totalRuns) * 100 : 0,
      avgCoverageScore: avgCoverage._avg.coverageScore ?? 0,
      claimsByStatus: Object.fromEntries(
        claimsByStatus.map((g) => [g.status, g._count]),
      ),
    };
  }
}
