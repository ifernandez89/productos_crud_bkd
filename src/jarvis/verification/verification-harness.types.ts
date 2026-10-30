import { ILLMProvider } from '../llm/llm-provider.interface';

export type VerificationPhase =
  | 'INITIAL_SNAPSHOT'
  | 'STATIC_VALIDATION'
  | 'PUBLIC_TESTS'
  | 'EVALUATE_CHECKPOINT'
  | 'SAVE_BEST_CHECKPOINT'
  | 'ROLLBACK_TO_BEST'
  | 'DIAGNOSIS_AND_REPAIR'
  | 'HIDDEN_TESTS_FINAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'INTERRUPTED_WAITING_RECOVERY';

export type DiagnosticCategory =
  | 'SECURITY_INVARIANT_VIOLATION'
  | 'SYNTAX_OR_COMPILE_ERROR'
  | 'STATIC_SCOPE_ERROR'
  | 'LINT_OR_CONTRACT_WARNING'
  | 'ASYNC_UNHANDLED_ERROR'
  | 'EXECUTION_TIMEOUT'
  | 'RUNNER_CRASH'
  | 'FUNCTIONAL_TEST_FAILURE'
  | 'REGRESSION_DETECTED';

export interface StructuredDiagnostic {
  category: DiagnosticCategory;
  severity: 'critical' | 'error' | 'warning';
  file?: string;
  line?: number;
  message: string;
  evidence?: string;
}

export interface StaticValidationOptions {
  allowedFiles?: string[];
  requiredExports?: string[];
  forbiddenPatterns?: Array<{
    pattern: RegExp;
    reason: string;
    severity?: 'critical' | 'error' | 'warning';
  }>;
}

export interface StaticValidationResult {
  passed: boolean;
  compileErrors: StructuredDiagnostic[];
  scopeErrors: StructuredDiagnostic[];
  securityViolations: StructuredDiagnostic[];
  lintWarnings: StructuredDiagnostic[];
  astMetrics: {
    functionCount: number;
    cyclomaticEstimate: number;
    lineCount: number;
  };
}

export interface SingleTestResult {
  id: string;
  passed: boolean;
  error?: string;
  durationMs?: number;
}

export interface IsolatedRunOptions {
  missionId: string;
  attemptIndex: number;
  files: Record<string, string>;
  entryFile: string;
  testSuiteSource: string;
  expectedTestSha256?: string;
  timeoutMs?: number;
  maxMemoryMb?: number;
  simulateRunnerCrash?: boolean;
}

export interface IsolatedRunResult {
  runnerStatus:
    | 'OK'
    | 'TIMEOUT'
    | 'ASYNC_ERROR'
    | 'SYNTAX_ERROR'
    | 'RUNNER_ERROR'
    | 'INTEGRITY_VIOLATION';
  passedCount: number;
  totalCount: number;
  tests: SingleTestResult[];
  unhandledAsyncErrors: string[];
  stderr: string;
  durationMs: number;
  sha256Verified: boolean;
  testSuiteHash: string;
}

/**
 * Vector de evaluación jerárquica de 5 niveles para Best-Checkpoint Rollback:
 * 1. Seguridad e invariantes críticos (obligatorio)
 * 2. Compilación y contratos sin crash/timeout (obligatorio)
 * 3. Pruebas funcionales públicas aprobadas (maximizar)
 * 4. Regresiones respecto al mejor checkpoint (penalizar / bloquear)
 * 5. Calidad y mantenibilidad (desempate)
 */
export interface CheckpointScoreVector {
  level1SecurityAndIntegrityOk: boolean;
  level2CompilesAndRunsOk: boolean;
  level3PublicTestsPassed: number;
  level4RegressionsCount: number;
  level5MaintainabilityScore: number;
}

export interface ImmutableCheckpoint {
  readonly checkpointId: string;
  readonly missionId: string;
  readonly attemptIndex: number;
  readonly createdAt: string;
  readonly files: Readonly<Record<string, string>>;
  readonly workingTreeHash: string;
  readonly checkpointIntegrityHash: string;
  readonly staticResult: StaticValidationResult;
  readonly publicTestResult: IsolatedRunResult;
  readonly scoreVector: CheckpointScoreVector;
  readonly passedTestIds: readonly string[];
}

export type RepairDecisionType =
  | 'ACCEPT_INITIAL_BASELINE'
  | 'ACCEPT_NEW_BEST'
  | 'ROLLBACK_SECURITY_VIOLATION'
  | 'ROLLBACK_BROKEN_BUILD_OR_RUNTIME'
  | 'ROLLBACK_SCORE_REGRESSION'
  | 'ROLLBACK_LATERAL_REGRESSION'
  | 'REJECT_NO_IMPROVEMENT';

export interface CheckpointComparisonResult {
  isBetter: boolean;
  decision: RepairDecisionType;
  reason: string;
  regressions: string[];
  newlyPassed: string[];
  scoreVector: CheckpointScoreVector;
}

export interface LlmCallAuditEntry {
  attemptIndex: number;
  purpose: 'INITIAL_GENERATION' | 'REPAIR';
  requestId: string;
  provider: string;
  model: string;
  httpStatus?: number;
  endpointUrl?: string;
  promptTokens?: number;
  completionTokens?: number;
  tokensUsed?: number;
  tokensPerSecond?: number;
  durationMs: number;
}

export interface AttemptAuditEntry {
  attemptIndex: number;
  phaseReached: VerificationPhase;
  workingTreeHash: string;
  checkpointId?: string;
  decision: RepairDecisionType;
  decisionReason: string;
  rolledBackToCheckpointId?: string;
  diffFromBest: string;
  staticPassed: boolean;
  publicPassedCount: number;
  publicTotalCount: number;
  regressions: string[];
  diagnostics: StructuredDiagnostic[];
  durationMs: number;
}

export interface VerificationMissionRequest {
  missionId: string;
  objective: string;
  /** Directorio de trabajo opcional en disco donde aplicar/restaurar allowedFiles */
  workspaceDir?: string;
  /** Lista blanca de archivos relativos que la misión tiene permiso de leer/modificar */
  allowedFiles: string[];
  /** Archivo principal a evaluar (ej. 'solution.ts') */
  entryFile: string;
  /** Mapa inicial de archivos (si no se provee, se genera en el intento 0 con el LLM) */
  initialFiles?: Record<string, string>;
  /** Código de pruebas públicas (ejecutado en cada intento) */
  publicTestsSource: string;
  /** Código de pruebas ocultas (ejecutado únicamente al final sobre el Best Checkpoint) */
  hiddenTestsSource?: string;
  /** Límite máximo de reparaciones tras el intento 0 (default: 2) */
  maxRepairs?: number;
  /** Timeout por ejecución de subproceso de pruebas en ms (default: 2000) */
  testTimeoutMs?: number;
  /** Límite de memoria RAM del subproceso en MB (default: 256) */
  maxMemoryMb?: number;
  /** Modelo a solicitar al ILLMProvider */
  model?: string;
  /** Proveedor de inferencia opcional (sobreescribe el inyectado para pruebas o multi-backend) */
  llmProviderOverride?: ILLMProvider;
  /** Opciones adicionales de validación estática */
  staticOptions?: StaticValidationOptions;
  /** Simula una interrupción tras persistir el intento indicado (para pruebas de recuperación) */
  simulateInterruptAfterAttempt?: number;
  /** Simula un fallo abrupto del runner en el intento indicado */
  simulateRunnerCrashOnAttempt?: number;
}

export interface VerificationReport {
  missionId: string;
  objective: string;
  finalPhase: VerificationPhase;
  success: boolean;
  totalAttempts: number;
  repairsAttempted: number;
  rollbacksCount: number;
  resumedFromDisk: boolean;
  bestCheckpointId: string;
  bestAttemptIndex: number;
  finalWorkingTreeHash: string;
  finalFiles: Readonly<Record<string, string>>;
  publicTestsSummary: {
    passed: number;
    total: number;
    sha256Verified: boolean;
    suiteHash: string;
  };
  hiddenTestsSummary?: {
    passed: number;
    total: number;
    sha256Verified: boolean;
    suiteHash: string;
    tests: SingleTestResult[];
  };
  attemptsHistory: AttemptAuditEntry[];
  llmCallsHistory?: LlmCallAuditEntry[];
  finalDiagnostics: StructuredDiagnostic[];
  totalDurationMs: number;
}

