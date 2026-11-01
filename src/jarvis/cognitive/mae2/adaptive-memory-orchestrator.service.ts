import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { RetrievalDecision, RetrievalDecisionRecord, RetrievalPlan } from './mae2.types';
import { MemoryAttentionPolicyService } from './memory-attention-policy.service';
import { MemoryDecisionLoggerService } from './memory-decision-logger.service';
import { RetrievalPlannerService } from './retrieval-planner.service';
import { DialecticHitlBridgeService } from './dialectic-hitl-bridge.service';

export type RolloutMode = 'OFF' | 'SHADOW' | 'CANARY' | 'DEFAULT';

export interface ShadowDivergenceRecord {
  sessionId: string;
  userMessageHash: string;
  legacySelected: string[];
  mae2Decision: RetrievalDecision;
  divergenceType: 'NO_OP' | 'SAVED_TOKENS' | 'AVOIDED_INTERFERENCE' | 'POTENTIAL_OMISSION';
  tokenDifference: number;
  createdAt: Date;
}

export interface OrchestrationDecisionResult {
  activeMode: RolloutMode;
  engineUsed: 'MAE_1' | 'MAE_2';
  decision: RetrievalDecision | string;
  plan: RetrievalPlan;
  fallbackTriggered: boolean;
  shadowDivergenceLogged: boolean;
  decisionLatencyMs: number;
}

@Injectable()
export class AdaptiveMemoryOrchestratorService {
  private readonly logger = new Logger(AdaptiveMemoryOrchestratorService.name);

  private mode: RolloutMode = 'SHADOW';
  private canaryPercentage: number = 10; // 10% de sesiones a MAE 2.0 en Canary Mode

  private readonly shadowDivergences: ShadowDivergenceRecord[] = [];
  private fallbackCount: number = 0;
  private totalQueriesProcessed: number = 0;

  constructor(
    private readonly policyService: MemoryAttentionPolicyService,
    private readonly loggerService: MemoryDecisionLoggerService,
    private readonly plannerService: RetrievalPlannerService,
    private readonly hitlBridge: DialecticHitlBridgeService,
  ) {
    // Lectura de configuración por variable de entorno sin necesidad de migraciones
    const envMode = process.env.USE_MAE_V2_MODE?.toUpperCase() as RolloutMode;
    if (envMode && ['OFF', 'SHADOW', 'CANARY', 'DEFAULT'].includes(envMode)) {
      this.mode = envMode;
    }
    const envCanary = process.env.MAE_V2_CANARY_PERCENT;
    if (envCanary && !isNaN(Number(envCanary))) {
      this.canaryPercentage = Math.min(100, Math.max(0, Number(envCanary)));
    }
    this.logger.log(`[MAE Rollout] Inicializado en modo: ${this.mode} (Canary: ${this.canaryPercentage}%)`);
  }

  setMode(mode: RolloutMode): void {
    this.mode = mode;
    this.logger.log(`[MAE Rollout] Modo cambiado dinámicamente a: ${mode}`);
  }

  getMode(): RolloutMode {
    return this.mode;
  }

  setCanaryPercentage(pct: number): void {
    this.canaryPercentage = Math.min(100, Math.max(0, pct));
  }

  /**
   * Orquesta la selección de motor de atención según la fase de despliegue gradual.
   */
  async orchestrateDecision(
    sessionId: string,
    userMessage: string,
    legacyEvaluator?: (msg: string) => { tools: string[]; focus: string },
  ): Promise<OrchestrationDecisionResult> {
    const t0 = Date.now();
    this.totalQueriesProcessed++;

    // 1. MODO OFF: 100% MAE 1.0
    if (this.mode === 'OFF') {
      const legacyPlan = this.buildLegacyPlan(userMessage, legacyEvaluator);
      return {
        activeMode: this.mode,
        engineUsed: 'MAE_1',
        decision: 'LEGACY_HEURISTIC',
        plan: legacyPlan,
        fallbackTriggered: false,
        shadowDivergenceLogged: false,
        decisionLatencyMs: Date.now() - t0,
      };
    }

    // 2. MODO SHADOW: MAE 1.0 ejecuta la respuesta real, MAE 2.0 evalúa y registra silenciosamente
    if (this.mode === 'SHADOW') {
      const legacyPlan = this.buildLegacyPlan(userMessage, legacyEvaluator);

      // Evaluación paralela silenciosa de MAE 2.0
      try {
        const { record, plan } = this.plannerService.createPlan({
          userMessage,
          sessionId,
        });

        this.recordShadowDivergence(sessionId, userMessage, legacyPlan.allowedTools, record);

        // Si MAE 2.0 detecta conflicto dialéctico en Shadow, notifica al bridge HITL
        if (record.decision === RetrievalDecision.DIALECTIC_AUDIT) {
          await this.hitlBridge.registerContradictionCandidate({
            sessionId,
            userMessage,
            confidenceScore: record.confidenceScore,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Error en evaluación Shadow de MAE 2.0: ${err.message}`);
      }

      return {
        activeMode: this.mode,
        engineUsed: 'MAE_1',
        decision: 'LEGACY_HEURISTIC_WITH_SHADOW',
        plan: legacyPlan,
        fallbackTriggered: false,
        shadowDivergenceLogged: true,
        decisionLatencyMs: Date.now() - t0,
      };
    }

    // 3. MODO CANARY: Enrutamiento fraccional por hash de sessionId
    if (this.mode === 'CANARY') {
      const hashInt = parseInt(
        crypto.createHash('md5').update(sessionId).digest('hex').slice(0, 4),
        16,
      );
      const isCanarySession = hashInt % 100 < this.canaryPercentage;

      if (!isCanarySession) {
        // Tráfico de control asignado a MAE 1.0
        const legacyPlan = this.buildLegacyPlan(userMessage, legacyEvaluator);
        return {
          activeMode: this.mode,
          engineUsed: 'MAE_1',
          decision: 'CANARY_CONTROL_LEGACY',
          plan: legacyPlan,
          fallbackTriggered: false,
          shadowDivergenceLogged: false,
          decisionLatencyMs: Date.now() - t0,
        };
      }
      // Tráfico experimental asignado a MAE 2.0 (continúa al flujo de ejecución)
    }

    // 4. MODO DEFAULT (o sesión Canary seleccionada): Ejecución activa de MAE 2.0 con Fallback Seguro
    try {
      const { record, plan } = this.plannerService.createPlan({
        userMessage,
        sessionId,
      });

      // Si detecta contradicción, conectar con HITL sin alterar entidades consolidadas
      if (record.decision === RetrievalDecision.DIALECTIC_AUDIT) {
        await this.hitlBridge.registerContradictionCandidate({
          sessionId,
          userMessage,
          confidenceScore: record.confidenceScore,
        });
      }

      return {
        activeMode: this.mode,
        engineUsed: 'MAE_2',
        decision: record.decision,
        plan,
        fallbackTriggered: false,
        shadowDivergenceLogged: false,
        decisionLatencyMs: Date.now() - t0,
      };
    } catch (err: any) {
      // POLÍTICA DE FALLBACK IDEMPOTENTE: Fallo interno en MAE 2.0 degrada limpiamente a MAE 1.0
      this.logger.error(`Fallo en motor MAE 2.0. Activando fallback a MAE 1.0: ${err.message}`);
      this.fallbackCount++;

      const legacyPlan = this.buildLegacyPlan(userMessage, legacyEvaluator);
      return {
        activeMode: this.mode,
        engineUsed: 'MAE_1',
        decision: 'FALLBACK_TO_LEGACY',
        plan: legacyPlan,
        fallbackTriggered: true,
        shadowDivergenceLogged: false,
        decisionLatencyMs: Date.now() - t0,
      };
    }
  }

  private buildLegacyPlan(
    userMessage: string,
    legacyEvaluator?: (msg: string) => { tools: string[]; focus: string },
  ): RetrievalPlan {
    if (legacyEvaluator) {
      const evalRes = legacyEvaluator(userMessage);
      return {
        decision: RetrievalDecision.SELECTIVE_RAG,
        allowedTools: evalRes.tools,
        maxTokensBudget: 500,
        shouldExecuteMemoryQuery: true,
        instructions: 'LEGACY_HEURISTIC: Herramientas reactivas habilitadas.',
      };
    }
    // Plan por defecto de MAE 1.0: reactivo con herramientas siempre habilitadas
    return {
      decision: RetrievalDecision.SELECTIVE_GRAPH,
      allowedTools: ['query_knowledge_graph', 'fetch_topic_snapshot'],
      maxTokensBudget: 500,
      shouldExecuteMemoryQuery: true,
      instructions: 'MAE 1.0: Herramientas de grafo y snapshot habilitadas para llamada reactiva.',
    };
  }

  private recordShadowDivergence(
    sessionId: string,
    userMessage: string,
    legacyTools: string[],
    record: RetrievalDecisionRecord,
  ): void {
    const hash = crypto.createHash('sha256').update(userMessage).digest('hex').slice(0, 16);
    let divergenceType: ShadowDivergenceRecord['divergenceType'] = 'NO_OP';
    let tokenDifference = 0;

    if (record.decision === RetrievalDecision.NO_RETRIEVAL) {
      divergenceType = 'AVOIDED_INTERFERENCE';
      tokenDifference = 500; // Ahorro de ~500 tokens inyectados
    } else if (legacyTools.length > 0 && record.toolsEnabled.length === 0) {
      divergenceType = 'SAVED_TOKENS';
      tokenDifference = 350;
    } else if (legacyTools.length === 0 && record.toolsEnabled.length > 0) {
      divergenceType = 'POTENTIAL_OMISSION';
      tokenDifference = -record.dimensions.estimatedTokenCost;
    }

    const divergence: ShadowDivergenceRecord = {
      sessionId,
      userMessageHash: hash,
      legacySelected: legacyTools,
      mae2Decision: record.decision,
      divergenceType,
      tokenDifference,
      createdAt: new Date(),
    };
    this.shadowDivergences.push(divergence);
  }

  getRolloutStats(): {
    totalQueries: number;
    mode: RolloutMode;
    canaryPercentage: number;
    shadowDivergencesCount: number;
    fallbackCount: number;
    tokenSavingsEstimate: number;
  } {
    const totalSavings = this.shadowDivergences.reduce(
      (acc, d) => (d.tokenDifference > 0 ? acc + d.tokenDifference : acc),
      0,
    );
    return {
      totalQueries: this.totalQueriesProcessed,
      mode: this.mode,
      canaryPercentage: this.canaryPercentage,
      shadowDivergencesCount: this.shadowDivergences.length,
      fallbackCount: this.fallbackCount,
      tokenSavingsEstimate: totalSavings,
    };
  }

  clearStats(): void {
    this.shadowDivergences.length = 0;
    this.fallbackCount = 0;
    this.totalQueriesProcessed = 0;
  }
}

