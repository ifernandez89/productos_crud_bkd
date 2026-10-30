import { Injectable } from '@nestjs/common';
import {
  CheckpointComparisonResult,
  CheckpointScoreVector,
  ImmutableCheckpoint,
  IsolatedRunResult,
  StaticValidationResult,
  StructuredDiagnostic,
} from './verification-harness.types';

@Injectable()
export class RepairControllerService {
  /**
   * Construye el vector jerárquico de 5 niveles:
   * 1. Seguridad e invariantes críticos (obligatorio)
   * 2. Compilación, alcance y ejecución sin crash/timeout/error asíncrono (obligatorio)
   * 3. Pruebas funcionales públicas aprobadas (maximizar)
   * 4. Regresiones respecto al mejor checkpoint (penalizar)
   * 5. Calidad y mantenibilidad (desempate)
   */
  computeScoreVector(
    staticResult: StaticValidationResult,
    publicTestResult: IsolatedRunResult,
    currentBest: ImmutableCheckpoint | null,
  ): {
    scoreVector: CheckpointScoreVector;
    regressions: string[];
    newlyPassed: string[];
  } {
    const level1SecurityAndIntegrityOk =
      staticResult.securityViolations.length === 0 &&
      publicTestResult.sha256Verified &&
      publicTestResult.runnerStatus !== 'INTEGRITY_VIOLATION';

    const level2CompilesAndRunsOk =
      level1SecurityAndIntegrityOk &&
      staticResult.compileErrors.length === 0 &&
      staticResult.scopeErrors.length === 0 &&
      publicTestResult.runnerStatus === 'OK' &&
      publicTestResult.unhandledAsyncErrors.length === 0;

    const currentPassedIds = new Set(
      (publicTestResult.tests ?? []).filter((t) => t.passed).map((t) => t.id),
    );

    const bestPassedIds = currentBest ? currentBest.passedTestIds : [];
    const regressions = bestPassedIds.filter(
      (id) => !currentPassedIds.has(id),
    );
    const newlyPassed = [...currentPassedIds].filter(
      (id) => !bestPassedIds.includes(id),
    );

    const lintPenalty = staticResult.lintWarnings.length * 5;
    const complexityPenalty = Math.max(
      0,
      staticResult.astMetrics.cyclomaticEstimate - 10,
    );
    const level5MaintainabilityScore = Math.max(
      0,
      100 - lintPenalty - complexityPenalty,
    );

    return {
      scoreVector: {
        level1SecurityAndIntegrityOk,
        level2CompilesAndRunsOk,
        level3PublicTestsPassed: level2CompilesAndRunsOk
          ? publicTestResult.passedCount
          : 0,
        level4RegressionsCount: regressions.length,
        level5MaintainabilityScore,
      },
      regressions,
      newlyPassed,
    };
  }

  /**
   * Evalúa jerárquicamente un candidato frente al Best Checkpoint actual.
   */
  evaluateCandidateAgainstBest(
    staticResult: StaticValidationResult,
    publicTestResult: IsolatedRunResult,
    currentBest: ImmutableCheckpoint | null,
  ): CheckpointComparisonResult {
    const { scoreVector, regressions, newlyPassed } = this.computeScoreVector(
      staticResult,
      publicTestResult,
      currentBest,
    );

    if (!currentBest) {
      return {
        isBetter: true,
        decision: 'ACCEPT_INITIAL_BASELINE',
        reason: scoreVector.level1SecurityAndIntegrityOk
          ? `Snapshot base registrado (${scoreVector.level3PublicTestsPassed}/${publicTestResult.totalCount} tests públicos aprobados).`
          : 'Snapshot base registrado con advertencia: contiene violaciones de seguridad iniciales que deben repararse.',
        regressions: [],
        newlyPassed,
        scoreVector,
      };
    }

    const bestVec = currentBest.scoreVector;

    // ── NIVEL 1: Seguridad e Invariantes Críticos (Obligatorio) ────────────────
    if (!scoreVector.level1SecurityAndIntegrityOk) {
      return {
        isBetter: false,
        decision: 'ROLLBACK_SECURITY_VIOLATION',
        reason: `Rechazado por Nivel 1 (Seguridad/Integridad): El candidato introdujo ${staticResult.securityViolations.length} violación(es) crítica(s) de seguridad o integridad, aunque obtuvo ${publicTestResult.passedCount}/${publicTestResult.totalCount} tests. Se revierte al Best Checkpoint (${currentBest.checkpointId}).`,
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    // Si el baseline tenía una violación de seguridad y el nuevo candidato la eliminó:
    if (
      !bestVec.level1SecurityAndIntegrityOk &&
      scoreVector.level1SecurityAndIntegrityOk
    ) {
      return {
        isBetter: true,
        decision: 'ACCEPT_NEW_BEST',
        reason:
          'Aceptado por Nivel 1: El candidato eliminó las violaciones de seguridad presentes en el estado inicial.',
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    // ── NIVEL 2: Compilación, Alcance y Ejecución sin Crash/Timeout ────────────
    if (bestVec.level2CompilesAndRunsOk && !scoreVector.level2CompilesAndRunsOk) {
      return {
        isBetter: false,
        decision: 'ROLLBACK_BROKEN_BUILD_OR_RUNTIME',
        reason: `Rechazado por Nivel 2 (Compilación/Runtime): El candidato rompió la compilación, el alcance o el runtime (status=${publicTestResult.runnerStatus}, compileErrs=${staticResult.compileErrors.length}, scopeErrs=${staticResult.scopeErrors.length}). Se revierte al Best Checkpoint (${currentBest.checkpointId}).`,
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    if (!bestVec.level2CompilesAndRunsOk && scoreVector.level2CompilesAndRunsOk) {
      return {
        isBetter: true,
        decision: 'ACCEPT_NEW_BEST',
        reason: `Aceptado por Nivel 2: El candidato reparó los errores de compilación/ejecución y aprobó ${scoreVector.level3PublicTestsPassed}/${publicTestResult.totalCount} pruebas públicas.`,
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    // ── NIVEL 3 y NIVEL 4: Pruebas Funcionales y Bloqueo de Regresiones ────────
    if (
      scoreVector.level3PublicTestsPassed < bestVec.level3PublicTestsPassed
    ) {
      return {
        isBetter: false,
        decision: 'ROLLBACK_SCORE_REGRESSION',
        reason: `Rechazado por Nivel 3/4 (Regresión funcional): Las pruebas públicas cayeron de ${bestVec.level3PublicTestsPassed} a ${scoreVector.level3PublicTestsPassed} (regresiones: [${regressions.join(', ')}]). Se revierte automáticamente al Best Checkpoint (${currentBest.checkpointId}).`,
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    if (regressions.length > 0) {
      return {
        isBetter: false,
        decision: 'ROLLBACK_LATERAL_REGRESSION',
        reason: `Rechazado por Nivel 4 (Regresión en pruebas previamente aprobadas): Aunque aprobó [${newlyPassed.join(', ')}], rompió pruebas ya superadas [${regressions.join(', ')}]. Se revierte al Best Checkpoint (${currentBest.checkpointId}).`,
        regressions,
        newlyPassed,
        scoreVector,
      };
    }

    if (
      scoreVector.level3PublicTestsPassed > bestVec.level3PublicTestsPassed
    ) {
      return {
        isBetter: true,
        decision: 'ACCEPT_NEW_BEST',
        reason: `Aceptado por Nivel 3: Mejoró las pruebas públicas de ${bestVec.level3PublicTestsPassed} a ${scoreVector.level3PublicTestsPassed} sin introducir regresiones (+[${newlyPassed.join(', ')}]).`,
        regressions: [],
        newlyPassed,
        scoreVector,
      };
    }

    // ── NIVEL 5: Calidad y Mantenibilidad (Desempate) ──────────────────────────
    if (
      scoreVector.level5MaintainabilityScore >
      bestVec.level5MaintainabilityScore
    ) {
      return {
        isBetter: true,
        decision: 'ACCEPT_NEW_BEST',
        reason: `Aceptado por Nivel 5 (Desempate de calidad): Mantuvo ${scoreVector.level3PublicTestsPassed} pruebas aprobadas y mejoró mantenibilidad de ${bestVec.level5MaintainabilityScore} a ${scoreVector.level5MaintainabilityScore}.`,
        regressions: [],
        newlyPassed,
        scoreVector,
      };
    }

    return {
      isBetter: false,
      decision: 'REJECT_NO_IMPROVEMENT',
      reason: `Sin mejora neta (${scoreVector.level3PublicTestsPassed}/${publicTestResult.totalCount} tests aprobados, mantenibilidad=${scoreVector.level5MaintainabilityScore} vs ${bestVec.level5MaintainabilityScore}). Se conserva el Best Checkpoint (${currentBest.checkpointId}).`,
      regressions: [],
      newlyPassed: [],
      scoreVector,
    };
  }

  /**
   * Consolida todos los diagnósticos estructurados de una evaluación.
   */
  collectDiagnostics(
    staticResult: StaticValidationResult,
    publicTestResult: IsolatedRunResult,
    regressions: string[],
  ): StructuredDiagnostic[] {
    const list: StructuredDiagnostic[] = [
      ...staticResult.securityViolations,
      ...staticResult.compileErrors,
      ...staticResult.scopeErrors,
    ];

    if (publicTestResult.runnerStatus === 'TIMEOUT') {
      list.push({
        category: 'EXECUTION_TIMEOUT',
        severity: 'error',
        message:
          publicTestResult.unhandledAsyncErrors[0] ||
          'La ejecución superó el límite de tiempo permitido (posible bucle infinito o promesa sin resolver).',
      });
    } else if (publicTestResult.runnerStatus === 'ASYNC_ERROR') {
      for (const asyncErr of publicTestResult.unhandledAsyncErrors) {
        list.push({
          category: 'ASYNC_UNHANDLED_ERROR',
          severity: 'error',
          message: `Error asíncrono no capturado: ${asyncErr}`,
        });
      }
    } else if (publicTestResult.runnerStatus === 'RUNNER_ERROR') {
      list.push({
        category: 'RUNNER_CRASH',
        severity: 'error',
        message:
          publicTestResult.unhandledAsyncErrors[0] ||
          publicTestResult.stderr ||
          'Fallo abrupto del proceso de pruebas.',
      });
    }

    for (const test of publicTestResult.tests ?? []) {
      if (!test.passed) {
        const isRegression = regressions.includes(test.id);
        list.push({
          category: isRegression
            ? 'REGRESSION_DETECTED'
            : 'FUNCTIONAL_TEST_FAILURE',
          severity: 'error',
          message: `${isRegression ? '[REGRESIÓN] ' : ''}Test público ${test.id} falló: ${test.error || 'Assertion failed'}`,
        });
      }
    }

    list.push(...staticResult.lintWarnings);
    return list;
  }

  /**
   * Construye el prompt estructurado de reparación a partir del Best Checkpoint vigente.
   */
  buildRepairPrompt(params: {
    objective: string;
    entryFile: string;
    bestCheckpoint: ImmutableCheckpoint;
    lastAttemptDiagnostics: StructuredDiagnostic[];
    wasRolledBack: boolean;
    rollbackReason?: string;
    regressions?: string[];
  }): string {
    const code = params.bestCheckpoint.files[params.entryFile] ?? '';
    const companionFiles = Object.entries(params.bestCheckpoint.files)
      .filter(([fileName]) => fileName !== params.entryFile)
      .map(
        ([fileName, fileContent]) =>
          `Archivo acoplado (${fileName}):\n\`\`\`typescript\n${fileContent.trim()}\n\`\`\``,
      )
      .join('\n\n');
    const diagLines = params.lastAttemptDiagnostics
      .filter((d) => d.severity !== 'warning')
      .map(
        (d, idx) =>
          `${idx + 1}. [${d.category}${d.line ? ` · línea ${d.line}` : ''}] ${d.message}`,
      )
      .join('\n');

    const rollbackBanner = params.wasRolledBack
      ? [
          `⚠️ AVISO DE ROLLBACK AUTOMÁTICO:`,
          `Tu intento de reparación anterior fue REVERTIDO porque empeoró el estado respecto al Best Checkpoint:`,
          `Motivo: ${params.rollbackReason}`,
          params.regressions && params.regressions.length > 0
            ? `Pruebas que habías aprobado y rompiste (PROHIBIDO romperlas): ${params.regressions.join(', ')}`
            : '',
          ``,
        ]
          .filter(Boolean)
          .join('\n')
      : '';

    return [
      `MISIÓN DE REPARACIÓN DE INGENIERÍA (JarBees Verification Harness)`,
      `OBJETIVO: ${params.objective}`,
      ``,
      rollbackBanner,
      companionFiles
        ? `ARCHIVOS DE CONTEXTO ACOPLADOS EN EL WORKSPACE (solo lectura):\n${companionFiles}\n`
        : '',
      `ESTADO ACTUAL RESTAURADO DE ${params.entryFile} (Best Checkpoint: ${params.bestCheckpoint.checkpointId}, pruebas aprobadas: [${params.bestCheckpoint.passedTestIds.join(', ') || 'ninguna'}]):`,
      `\`\`\`typescript`,
      code,
      `\`\`\``,
      ``,
      `DIAGNÓSTICOS VERIFICADOS A RESOLVER:`,
      diagLines || 'Sin diagnósticos detallados.',
      ``,
      `REGLAS OBLIGATORIAS:`,
      `1. Conserva intacto el comportamiento de las pruebas ya aprobadas: [${params.bestCheckpoint.passedTestIds.join(', ') || 'ninguna'}].`,
      `2. Corrige todas las causas raíz reportadas en los diagnósticos (alcance de bloque try/catch, tipos, invariantes de seguridad y aserciones).`,
      `3. No utilices eval(), Function(), child_process ni process.env.`,
      `4. Devuelve ÚNICAMENTE el archivo completo corregido dentro de un bloque \`\`\`typescript ... \`\`\`.`,
    ]
      .filter((s) => s !== '')
      .join('\n');
  }

  /**
   * Calcula un resumen de diferencias (diff línea a línea) entre dos estados de archivos.
   */
  computeUnifiedDiff(
    beforeFiles: Readonly<Record<string, string>>,
    afterFiles: Readonly<Record<string, string>>,
  ): string {
    const allKeys = Array.from(
      new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)]),
    ).sort();
    const diffChunks: string[] = [];

    for (const file of allKeys) {
      const before = (beforeFiles[file] ?? '').split(/\r?\n/);
      const after = (afterFiles[file] ?? '').split(/\r?\n/);
      if (before.join('\n') === after.join('\n')) continue;

      const changes: string[] = [`--- a/${file}`, `+++ b/${file}`];
      const maxLen = Math.max(before.length, after.length);
      for (let i = 0; i < maxLen; i++) {
        const bLine = before[i];
        const aLine = after[i];
        if (bLine === aLine) continue;
        if (bLine !== undefined) changes.push(`-${i + 1}: ${bLine}`);
        if (aLine !== undefined) changes.push(`+${i + 1}: ${aLine}`);
      }
      diffChunks.push(changes.join('\n'));
    }

    return diffChunks.length > 0 ? diffChunks.join('\n') : '(no changes)';
  }
}

