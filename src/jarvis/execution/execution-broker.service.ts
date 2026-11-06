import {
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ActionGatekeeperService } from '../security/action-gatekeeper.service';
import { BrokerAuditService } from './broker-audit.service';
import {
  CAPABILITY_REGISTRY,
  ExecutionCapabilityId,
  ExecutionRequest,
  ExecutionResponse,
} from './execution-broker.types';
import { PolicyEvaluatorService } from './policy-evaluator.service';

@Injectable()
export class ExecutionBrokerService {
  private readonly logger = new Logger(ExecutionBrokerService.name);

  constructor(
    private readonly policyEvaluator: PolicyEvaluatorService,
    private readonly auditService: BrokerAuditService,
    @Optional()
    private readonly actionGatekeeper?: ActionGatekeeperService,
  ) {}

  /**
   * Punto único de entrada para solicitar la ejecución de una capacidad.
   * En la Fase B2.1 opera en modo STRICT NO-EXECUTION:
   * Las solicitudes aprobadas terminan en estado 'SIMULATED'; las rechazadas en 'DENIED'.
   * NUNCA se despacha ninguna acción al sistema operativo, shell, red o filesystem.
   */
  async requestExecution<TParams extends Record<string, unknown> = Record<string, unknown>, TResult = unknown>(
    request: ExecutionRequest<TParams>,
  ): Promise<ExecutionResponse<TResult>> {
    const startTime = Date.now();
    const payloadHash = this.computeCanonicalPayloadHash(request.parameters);

    // 1. Evaluación de políticas de seguridad (Fail-Closed)
    const policyDecision = this.policyEvaluator.evaluate(request as ExecutionRequest<Record<string, unknown>>);

    if (!policyDecision.approved) {
      const auditRecord = await this.auditService.recordDecision({
        requestId: request.requestId,
        actorId: request.caller?.actorId || 'unknown',
        capabilityId: String(request.capabilityId),
        decision: 'DENIED',
        status: 'DENIED',
        reason: policyDecision.reason,
        payloadHash,
      });

      return {
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: 'DENIED',
        decision: 'DENIED',
        error: {
          code: policyDecision.errorCode || 'POLICY_VIOLATION',
          message: policyDecision.reason || 'Solicitud rechazada por política de seguridad del Execution Broker.',
          details: policyDecision.details,
        },
        telemetry: {
          durationMs: Date.now() - startTime,
          evaluatedAt: new Date().toISOString(),
          auditIndex: auditRecord.index,
          auditHash: auditRecord.entryHash,
          policyChecksPassed: 0,
          executionDispatched: false,
        },
      };
    }

    // 2. Verificación criptográfica con ActionGatekeeperService (B1) si la capacidad requiere HITL
    const capDef = CAPABILITY_REGISTRY[request.capabilityId as ExecutionCapabilityId];
    if (capDef?.requiresHitl) {
      if (this.actionGatekeeper && request.hitlAuthorizationToken) {
        try {
          const targetResource =
            request.resourceScope?.workspaceId ||
            String((request.parameters as any)?.workspaceId || 'system');

          this.actionGatekeeper.verifyAndConsumeChallenge(
            request.hitlAuthorizationToken,
            request.capabilityId,
            targetResource,
            request.parameters as Record<string, any>,
            request.caller.actorId,
          );
        } catch (authErr: any) {
          const reason = `Fallo de validación de autorización HITL (B1): ${authErr.message}`;
          const auditRecord = await this.auditService.recordDecision({
            requestId: request.requestId,
            actorId: request.caller.actorId,
            capabilityId: request.capabilityId,
            decision: 'DENIED',
            status: 'DENIED',
            reason,
            payloadHash,
          });

          return {
            requestId: request.requestId,
            capabilityId: request.capabilityId,
            status: 'DENIED',
            decision: 'DENIED',
            error: {
              code: 'HITL_TOKEN_VERIFICATION_FAILED',
              message: reason,
            },
            telemetry: {
              durationMs: Date.now() - startTime,
              evaluatedAt: new Date().toISOString(),
              auditIndex: auditRecord.index,
              auditHash: auditRecord.entryHash,
              policyChecksPassed: 5,
              executionDispatched: false,
            },
          };
        }
      }
    }

    // 3. Generación de Resultado Simulado (STRICT NO-EXECUTION)
    // Cero llamadas a child_process, fs.writeFile o sockets de red
    const simulatedResult = this.generateSimulatedResult(request) as TResult;

    // 4. Registro en Auditoría Inmutable
    const auditRecord = await this.auditService.recordDecision({
      requestId: request.requestId,
      actorId: request.caller.actorId,
      capabilityId: request.capabilityId,
      decision: 'APPROVED',
      status: 'SIMULATED',
      payloadHash,
    });

    return {
      requestId: request.requestId,
      capabilityId: request.capabilityId,
      status: 'SIMULATED',
      decision: 'APPROVED',
      simulatedResult,
      telemetry: {
        durationMs: Date.now() - startTime,
        evaluatedAt: new Date().toISOString(),
        auditIndex: auditRecord.index,
        auditHash: auditRecord.entryHash,
        policyChecksPassed: 6,
        executionDispatched: false,
      },
    };
  }

  /**
   * Genera un resultado sintético y determinista para la simulación de B2.1 sin tocar el host.
   */
  private generateSimulatedResult(request: ExecutionRequest<any>): Record<string, unknown> {
    const params = (request.parameters || {}) as Record<string, unknown>;

    switch (request.capabilityId) {
      case 'fs:read_file':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          path: params.path,
          content: `[SIMULATED_CONTENT_FOR_${String(params.path)}]`,
          bytesRead: 42,
        };

      case 'fs:write_file':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          path: params.path,
          bytesWritten: String(params.content || '').length,
          persistedToDisk: false,
        };

      case 'fs:list_directory':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          path: params.path,
          files: ['mock_file_1.ts', 'mock_file_2.ts'],
        };

      case 'test:run_suite':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          runnerStatus: 'OK',
          passedCount: 1,
          totalCount: 1,
          durationMs: 5,
          subprocessesSpawned: 0,
        };

      case 'code:apply_diff':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          applied: true,
          targetFilePath: params.targetFilePath,
          diffHashVerified: params.expectedDiffHash,
          diskMutated: false,
        };

      case 'media:render_3d':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          glbAssetPath: params.glbAssetPath,
          meshCount: 4,
          triangles: 1250,
          blenderSpawned: false,
        };

      case 'media:synthesize_voice':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          voiceId: params.voiceId,
          audioDurationMs: 1200,
          hardwareAudioEmitted: false,
        };

      case 'os:desktop_intent':
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          intent: params.intent,
          osBinariesExecuted: false,
        };

      default:
        return {
          simulated: true,
          mode: 'SIMULATION_ONLY',
          capabilityId: request.capabilityId,
        };
    }
  }

  /**
   * Calcula un hash SHA-256 canónico y determinista sobre los parámetros de la solicitud.
   */
  computeCanonicalPayloadHash(parameters: unknown): string {
    const canonical = this.canonicalizeValue(parameters ?? {});
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical), 'utf8')
      .digest('hex');
  }

  private canonicalizeValue(val: any): any {
    if (val === null || val === undefined) return null;
    if (typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map((item) => this.canonicalizeValue(item));

    const sortedObj: Record<string, any> = {};
    const sortedKeys = Object.keys(val).sort();
    for (const key of sortedKeys) {
      sortedObj[key] = this.canonicalizeValue(val[key]);
    }
    return sortedObj;
  }
}
