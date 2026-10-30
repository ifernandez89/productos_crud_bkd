import { Injectable, Optional } from '@nestjs/common';
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { RedactedObservabilityService } from '../security/redacted-observability.service';
import {
  IsolatedRunOptions,
  IsolatedRunResult,
  SingleTestResult,
} from './verification-harness.types';

@Injectable()
export class IsolatedTestRunnerService {
  constructor(
    @Optional()
    private readonly redactedObservability?: RedactedObservabilityService,
  ) {}

  computeSha256(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  async runSuite(options: IsolatedRunOptions): Promise<IsolatedRunResult> {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 2000;
    const maxMemoryMb = options.maxMemoryMb ?? 256;

    const preRunHash = this.computeSha256(options.testSuiteSource);
    if (
      options.expectedTestSha256 &&
      preRunHash !== options.expectedTestSha256
    ) {
      return {
        runnerStatus: 'INTEGRITY_VIOLATION',
        passedCount: 0,
        totalCount: 0,
        tests: [],
        unhandledAsyncErrors: [
          `Discrepancia de integridad SHA-256 en suite de pruebas antes de ejecutar (esperado=${options.expectedTestSha256}, actual=${preRunHash}).`,
        ],
        stderr: 'SHA-256 integrity violation',
        durationMs: Date.now() - startTime,
        sha256Verified: false,
        testSuiteHash: preRunHash,
      };
    }

    if (options.simulateRunnerCrash) {
      return {
        runnerStatus: 'RUNNER_ERROR',
        passedCount: 0,
        totalCount: 0,
        tests: [],
        unhandledAsyncErrors: [],
        stderr: 'Simulated runner crash (process exited unexpectedly with signal SIGKILL/137).',
        durationMs: Date.now() - startTime,
        sha256Verified: true,
        testSuiteHash: preRunHash,
      };
    }

    const nonce = crypto.randomBytes(6).toString('hex');
    const safeMissionId = options.missionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const sandboxDir = path.join(
      os.tmpdir(),
      `jarbees-verify-${safeMissionId}-${options.attemptIndex}-${nonce}`,
    );

    fs.mkdirSync(sandboxDir, { recursive: true });

    try {
      // 1. Transpilar y escribir los archivos de la misión en el sandbox aislado
      for (const [relFile, tsCode] of Object.entries(options.files)) {
        const cleanRel = relFile.replace(/\\/g, '/').replace(/^\.\//, '');
        if (cleanRel.includes('..') || path.isAbsolute(cleanRel)) {
          throw new Error(`Ruta inválida en sandbox: ${relFile}`);
        }
        const jsCode = this.transpileToCommonJs(tsCode, cleanRel);
        const destPath = path.join(
          sandboxDir,
          cleanRel.replace(/\.ts$/, '.js'),
        );
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.writeFileSync(destPath, jsCode, 'utf8');
      }

      const entryJsRel = options.entryFile
        .replace(/\\/g, '/')
        .replace(/^\.\//, '')
        .replace(/\.ts$/, '.js');

      const transpiledTests = this.transpileToCommonJs(
        options.testSuiteSource,
        'suite.ts',
      );

      // 2. Construir el harness de proceso hijo con captura de errores asíncronos
      const runnerScriptPath = path.join(sandboxDir, '__jarbees_runner__.cjs');
      const runnerSource = `'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const __asyncErrors = [];
process.on('uncaughtException', (err) => {
  __asyncErrors.push('uncaughtException: ' + (err && err.stack ? err.stack : String(err)));
});
process.on('unhandledRejection', (reason) => {
  __asyncErrors.push('unhandledRejection: ' + (reason && reason.stack ? reason.stack : String(reason)));
});

let candidateModule = {};
try {
  candidateModule = require('./' + ${JSON.stringify(entryJsRel)});
  if (candidateModule && typeof candidateModule === 'object') {
    for (const [k, v] of Object.entries(candidateModule)) {
      global[k] = v;
    }
  }
} catch (loadErr) {
  process.stdout.write('__JARBEES_RESULT_START__' + JSON.stringify({
    runnerStatus: loadErr instanceof SyntaxError ? 'SYNTAX_ERROR' : 'RUNNER_ERROR',
    passedCount: 0,
    totalCount: 0,
    tests: [],
    unhandledAsyncErrors: [loadErr && loadErr.stack ? loadErr.stack : String(loadErr)]
  }) + '__JARBEES_RESULT_END__\\n');
  process.exit(0);
}

${transpiledTests}

(async () => {
  try {
    if (typeof runTests !== 'function') {
      throw new Error('La suite de pruebas no definió una función async runTests().');
    }
    const rawTests = await runTests(candidateModule);
    // Esperar un tick corto para capturar promesas rechazadas sin await o setImmediate
    await new Promise((r) => setTimeout(r, 20));
    const tests = Array.isArray(rawTests) ? rawTests : [];
    const passedCount = tests.filter((t) => t && t.passed).length;
    const status = __asyncErrors.length > 0 ? 'ASYNC_ERROR' : 'OK';
    process.stdout.write('__JARBEES_RESULT_START__' + JSON.stringify({
      runnerStatus: status,
      passedCount: status === 'ASYNC_ERROR' ? 0 : passedCount,
      totalCount: tests.length,
      tests,
      unhandledAsyncErrors: __asyncErrors
    }) + '__JARBEES_RESULT_END__\\n');
    process.exit(0);
  } catch (err) {
    process.stdout.write('__JARBEES_RESULT_START__' + JSON.stringify({
      runnerStatus: __asyncErrors.length > 0 ? 'ASYNC_ERROR' : 'RUNNER_ERROR',
      passedCount: 0,
      totalCount: 0,
      tests: [],
      unhandledAsyncErrors: [...__asyncErrors, err && err.stack ? err.stack : String(err)]
    }) + '__JARBEES_RESULT_END__\\n');
    process.exit(0);
  }
})();
`;

      fs.writeFileSync(runnerScriptPath, runnerSource, 'utf8');

      // 3. Ejecutar en subproceso Node con entorno sanitizado sin secretos
      const sanitizedEnv: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        NODE_PATH: path.resolve(process.cwd(), 'node_modules'),
        SystemRoot: process.env.SystemRoot,
        SYSTEMROOT: process.env.SYSTEMROOT,
        TEMP: sandboxDir,
        TMP: sandboxDir,
        HOME: sandboxDir,
        USERPROFILE: sandboxDir,
        NODE_NO_WARNINGS: '1',
      };

      const execResult = await this.spawnWithTimeout(
        process.execPath,
        [`--max-old-space-size=${maxMemoryMb}`, runnerScriptPath],
        sandboxDir,
        sanitizedEnv,
        timeoutMs,
      );

      const postRunHash = this.computeSha256(options.testSuiteSource);
      const sha256Verified =
        preRunHash === postRunHash &&
        (!options.expectedTestSha256 ||
          postRunHash === options.expectedTestSha256);

      if (execResult.timedOut) {
        return {
          runnerStatus: 'TIMEOUT',
          passedCount: 0,
          totalCount: 0,
          tests: [],
          unhandledAsyncErrors: [
            `Timeout de ejecución alcanzado (${timeoutMs}ms). Subproceso terminado limpiamente.`,
          ],
          stderr: this.sanitizeOutput(execResult.stderr),
          durationMs: Date.now() - startTime,
          sha256Verified,
          testSuiteHash: postRunHash,
        };
      }

      const startMarker = '__JARBEES_RESULT_START__';
      const endMarker = '__JARBEES_RESULT_END__';
      const sIdx = execResult.stdout.indexOf(startMarker);
      const eIdx = execResult.stdout.indexOf(endMarker);

      if (sIdx === -1 || eIdx === -1 || eIdx <= sIdx) {
        return {
          runnerStatus: 'RUNNER_ERROR',
          passedCount: 0,
          totalCount: 0,
          tests: [],
          unhandledAsyncErrors: [
            `El subproceso terminó sin emitir reporte estructurado (exitCode=${execResult.exitCode}). ${this.sanitizeOutput(execResult.stderr || execResult.stdout)}`,
          ],
          stderr: this.sanitizeOutput(execResult.stderr),
          durationMs: Date.now() - startTime,
          sha256Verified,
          testSuiteHash: postRunHash,
        };
      }

      const jsonStr = execResult.stdout.slice(sIdx + startMarker.length, eIdx);
      const parsed = JSON.parse(jsonStr) as {
        runnerStatus: IsolatedRunResult['runnerStatus'];
        passedCount: number;
        totalCount: number;
        tests: SingleTestResult[];
        unhandledAsyncErrors: string[];
      };

      return {
        runnerStatus: sha256Verified
          ? parsed.runnerStatus
          : 'INTEGRITY_VIOLATION',
        passedCount: parsed.passedCount ?? 0,
        totalCount: parsed.totalCount ?? 0,
        tests: (parsed.tests ?? []).map((t) => ({
          id: String(t.id),
          passed: Boolean(t.passed),
          error: t.error ? this.sanitizeOutput(String(t.error)) : undefined,
          durationMs: t.durationMs,
        })),
        unhandledAsyncErrors: (parsed.unhandledAsyncErrors ?? []).map((e) =>
          this.sanitizeOutput(String(e)),
        ),
        stderr: this.sanitizeOutput(execResult.stderr),
        durationMs: Date.now() - startTime,
        sha256Verified,
        testSuiteHash: postRunHash,
      };
    } finally {
      try {
        fs.rmSync(sandboxDir, { recursive: true, force: true });
      } catch {
        // Ignorar errores de limpieza en archivos temporales bloqueados momentáneamente
      }
    }
  }

  private transpileToCommonJs(source: string, fileName: string): string {
    // Si el archivo no exporta explícitamente pero define funciones/clases top-level,
    // adjuntamos exportaciones automáticas para que el test runner pueda importarlas.
    const exportNames: string[] = [];
    const fnClassRegex =
      /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = fnClassRegex.exec(source)) !== null) {
      if (m[1] && m[1] !== 'runTests') {
        exportNames.push(m[1]);
      }
    }

    const transpiled = ts.transpileModule(source, {
      fileName: fileName.endsWith('.ts') ? fileName : `${fileName}.ts`,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        esModuleInterop: true,
      },
    }).outputText;

    if (exportNames.length === 0) {
      return transpiled;
    }

    const autoExports = exportNames
      .map(
        (name) =>
          `if (typeof ${name} !== 'undefined' && typeof exports.${name} === 'undefined') { exports.${name} = ${name}; }`,
      )
      .join('\n');

    return `${transpiled}\n${autoExports}\n`;
  }

  private spawnWithTimeout(
    executable: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeoutMs: number,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
  }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;

      const child = spawn(executable, args, {
        cwd,
        env,
        shell: false,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignorar
        }
      }, timeoutMs);
      timer.unref?.();

      child.stdout?.on('data', (chunk) => {
        if (stdout.length < 65536) {
          stdout += chunk.toString('utf8');
        }
      });

      child.stderr?.on('data', (chunk) => {
        if (stderr.length < 65536) {
          stderr += chunk.toString('utf8');
        }
      });

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode, timedOut });
      };

      child.on('close', (code) => finish(code));
      child.on('error', (err) => {
        stderr += `\nSpawn error: ${err.message}`;
        finish(1);
      });
    });
  }

  private sanitizeOutput(text: string): string {
    if (!text) return '';
    if (this.redactedObservability) {
      return this.redactedObservability.redactText(text);
    }
    return text.replace(
      /(["']?(?:password|secret|token|apiKey|api_key)["']?\s*[:=]\s*["'])([^"'\s]{4,})(["'])/gi,
      '$1[REDACTED]$3',
    );
  }
}

