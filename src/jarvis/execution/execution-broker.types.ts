/**
 * Tipos e interfaces formales para el Execution Broker (Fase DEV-001-B2.1)
 * Diseñado en modo STRICT NO-EXECUTION: las solicitudes solo alcanzan estados DENIED o SIMULATED.
 */

export type ExecutionCapabilityId =
  | 'fs:read_file'
  | 'fs:write_file'
  | 'fs:list_directory'
  | 'test:run_suite'
  | 'net:fetch_url'
  | 'media:render_3d'
  | 'media:synthesize_voice'
  | 'os:desktop_intent'
  | 'code:apply_diff';

export enum CapabilityRiskLevel {
  LEVEL_0_OBSERVATION = 'LEVEL_0_OBSERVATION',   // Solo lectura inofensiva
  LEVEL_1_MONITORED   = 'LEVEL_1_MONITORED',     // Lectura externa / scraping controlado
  LEVEL_2_SANDBOXED   = 'LEVEL_2_SANDBOXED',     // Modificación en workspace efímero descartable
  LEVEL_3_RESTRICTED  = 'LEVEL_3_RESTRICTED',    // Operación crítica que exige token HITL
}

export type ExecutionStatus = 'DENIED' | 'SIMULATED';

export interface CapabilityDefinition {
  id: ExecutionCapabilityId;
  description: string;
  riskLevel: CapabilityRiskLevel;
  requiresHitl: boolean;
  requiredParameters: readonly string[];
  maxTimeoutMs: number;
  maxMemoryMb: number;
}

/**
 * Catálogo inmutable de capacidades autorizables (Deeply Frozen).
 * Toda capacidad no presente en este catálogo debe ser rechazada de forma determinista (Fail-Closed).
 */
export const CAPABILITY_REGISTRY: Readonly<Record<ExecutionCapabilityId, CapabilityDefinition>> = Object.freeze({
  'fs:read_file': Object.freeze({
    id: 'fs:read_file',
    description: 'Lectura de archivo en workspace aislado',
    riskLevel: CapabilityRiskLevel.LEVEL_0_OBSERVATION,
    requiresHitl: false,
    requiredParameters: Object.freeze(['path']),
    maxTimeoutMs: 2000,
    maxMemoryMb: 64,
  }),
  'fs:write_file': Object.freeze({
    id: 'fs:write_file',
    description: 'Escritura de archivo en workspace efímero',
    riskLevel: CapabilityRiskLevel.LEVEL_2_SANDBOXED,
    requiresHitl: false,
    requiredParameters: Object.freeze(['path', 'content']),
    maxTimeoutMs: 5000,
    maxMemoryMb: 128,
  }),
  'fs:list_directory': Object.freeze({
    id: 'fs:list_directory',
    description: 'Listado de directorio confinado al workspace',
    riskLevel: CapabilityRiskLevel.LEVEL_0_OBSERVATION,
    requiresHitl: false,
    requiredParameters: Object.freeze(['path']),
    maxTimeoutMs: 2000,
    maxMemoryMb: 64,
  }),
  'test:run_suite': Object.freeze({
    id: 'test:run_suite',
    description: 'Ejecución de pruebas sintéticas sin red',
    riskLevel: CapabilityRiskLevel.LEVEL_2_SANDBOXED,
    requiresHitl: false,
    requiredParameters: Object.freeze(['testSource', 'files']),
    maxTimeoutMs: 10000,
    maxMemoryMb: 256,
  }),
  'net:fetch_url': Object.freeze({
    id: 'net:fetch_url',
    description: 'Petición HTTP saliente filtrada',
    riskLevel: CapabilityRiskLevel.LEVEL_1_MONITORED,
    requiresHitl: false,
    requiredParameters: Object.freeze(['url', 'method']),
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  }),
  'code:apply_diff': Object.freeze({
    id: 'code:apply_diff',
    description: 'Integración de diff aprobado humanamente en el proyecto',
    riskLevel: CapabilityRiskLevel.LEVEL_3_RESTRICTED,
    requiresHitl: true,
    requiredParameters: Object.freeze(['workspaceId', 'targetFilePath', 'expectedDiffHash']),
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  }),
  'media:render_3d': Object.freeze({
    id: 'media:render_3d',
    description: 'Renderizado 3D Blender confinado',
    riskLevel: CapabilityRiskLevel.LEVEL_1_MONITORED,
    requiresHitl: false,
    requiredParameters: Object.freeze(['glbAssetPath']),
    maxTimeoutMs: 30000,
    maxMemoryMb: 512,
  }),
  'media:synthesize_voice': Object.freeze({
    id: 'media:synthesize_voice',
    description: 'Síntesis de voz / TTS local',
    riskLevel: CapabilityRiskLevel.LEVEL_0_OBSERVATION,
    requiresHitl: false,
    requiredParameters: Object.freeze(['text', 'voiceId']),
    maxTimeoutMs: 5000,
    maxMemoryMb: 128,
  }),
  'os:desktop_intent': Object.freeze({
    id: 'os:desktop_intent',
    description: 'Automatización de escritorio pre-aprobada',
    riskLevel: CapabilityRiskLevel.LEVEL_3_RESTRICTED,
    requiresHitl: true,
    requiredParameters: Object.freeze(['intent', 'params']),
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  }),
});

export interface ExecutionCallerIdentity {
  actorId: string;
  sessionId: string;
  role: 'operator' | 'admin' | 'system';
}

export interface ExecutionResourceScope {
  workspaceId?: string;
  targetPaths?: string[];
  targetUrls?: string[];
  diffHash?: string;
  expectedDiffHash?: string;
}

export interface ExecutionResourceLimits {
  maxDurationMs?: number;
  maxMemoryMb?: number;
  maxCpuPercent?: number;
  maxOutputBytes?: number;
}

export interface ExecutionRequest<TParams = Record<string, unknown>> {
  requestId: string;
  capabilityId: ExecutionCapabilityId;
  caller: ExecutionCallerIdentity;
  parameters: TParams;
  resourceScope: ExecutionResourceScope;
  resourceLimits?: ExecutionResourceLimits;
  hitlAuthorizationToken?: string;
  simulationMode?: boolean;
}

export interface ExecutionErrorDetails {
  code: string;
  message: string;
  details?: unknown;
}

export interface ExecutionTelemetry {
  durationMs: number;
  evaluatedAt: string;
  auditIndex: number;
  auditHash: string;
  policyChecksPassed: number;
  executionDispatched: false; // Siempre false en B2.1
}

export interface ExecutionResponse<TResult = unknown> {
  requestId: string;
  capabilityId: ExecutionCapabilityId;
  status: ExecutionStatus;
  decision: 'APPROVED' | 'DENIED';
  simulatedResult?: TResult;
  error?: ExecutionErrorDetails;
  telemetry: ExecutionTelemetry;
}

export interface PolicyDecision {
  approved: boolean;
  errorCode?: string;
  reason?: string;
  details?: unknown;
}

export interface ExecutionAuditRecord {
  index: number;
  timestamp: string;
  requestId: string;
  actorId: string;
  capabilityId: string;
  decision: 'APPROVED' | 'DENIED';
  status: ExecutionStatus;
  reason?: string;
  payloadHash: string;
  previousEntryHash: string;
  entryHash: string;
}

