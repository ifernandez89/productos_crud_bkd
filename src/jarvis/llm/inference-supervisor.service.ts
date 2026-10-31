import {
  Injectable,
  Logger,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as fs from 'fs';
import axios from 'axios';

import * as path from 'path';

export enum InferenceServerStatus {
  STOPPED = 'STOPPED',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  DRAINING = 'DRAINING',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}

export interface GpuTelemetryReport {
  vramUsedMiB: number;
  vramFreeMiB: number;
  vramTotalMiB: number;
  gpuTempC: number;
  gpuUtilPercent: number;
}

export interface SupervisorState {
  status: InferenceServerStatus;
  pid?: number;
  managedByJarBees: boolean;
  port: number;
  routerMode: boolean;
  lastStarted?: Date;
  lastError?: string;
  restartAttempts: number;
  circuitBreakerTripped: boolean;
  gpu?: GpuTelemetryReport;
}

const MAX_RESTARTS = 3;
const CIRCUIT_BREAKER_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
const READY_POLL_INTERVAL_MS = 500;

/**
 * Supervisor de procesos de inferencia local.
 * Administra el ciclo de vida de llama-server.exe, coordina el uso de VRAM
 * con Ollama, implementa Circuit Breaker y garantiza la liberación de los 12 GB
 * de memoria GPU de la RTX 5070 al apagar el backend.
 */
@Injectable()
export class InferenceSupervisorService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(InferenceSupervisorService.name);

  private readonly binaryPath: string;
  private readonly modelPath: string;
  private readonly host: string;
  private readonly port: number;
  private readonly ngl: string;
  private readonly ctxSize: string;
  private readonly parallel: string;
  private readonly autoStart: boolean;
  private readonly routerMode: boolean;
  private readonly modelsDir: string;
  private readonly presetsPath: string;
  private readonly modelsMax: string;
  private readonly ctk: string;
  private readonly ctv: string;

  private serverProcess?: ChildProcess;
  private status: InferenceServerStatus = InferenceServerStatus.UNKNOWN;
  private managedByJarBees = false;
  private stoppedExplicitly = false;
  private lastStarted?: Date;
  private lastError?: string;
  private restartAttempts = 0;
  private windowStart?: Date;

  constructor() {
    this.binaryPath =
      process.env.LLAMACPP_BINARY_PATH ||
      'C:\\AI\\llama.cpp\\b11935\\llama-server.exe';
    this.modelPath =
      process.env.LLAMACPP_MODEL_PATH ||
      'C:\\AI\\models\\qwen3-8b-q4_k_m.gguf';
    this.host = process.env.LLAMACPP_HOST || '127.0.0.1';
    this.port = parseInt(process.env.LLAMACPP_PORT || '8080', 10);
    this.ngl = process.env.LLAMACPP_NGL || '99';
    this.ctxSize = process.env.LLAMACPP_CTX_SIZE || '16384';
    this.parallel = process.env.LLAMACPP_PARALLEL || '1';
    this.autoStart = process.env.LLAMACPP_AUTO_START === 'true';
    this.routerMode = process.env.LLAMACPP_ROUTER_MODE !== 'false';
    this.modelsDir = process.env.LLAMACPP_MODELS_DIR || 'C:\\AI\\models';
    const localPresets = path.resolve(__dirname, 'models_presets.ini');
    const srcPresets = path.resolve(
      process.cwd(),
      'src',
      'jarvis',
      'llm',
      'models_presets.ini',
    );
    this.presetsPath =
      process.env.LLAMACPP_PRESETS_PATH ||
      (fs.existsSync(localPresets) ? localPresets : srcPresets);
    this.modelsMax = process.env.LLAMACPP_MODELS_MAX || '1';
    this.ctk = process.env.LLAMACPP_CTK || 'q8_0';
    this.ctv = process.env.LLAMACPP_CTV || 'q8_0';
  }

  async onModuleInit(): Promise<void> {
    const alive = await this.isServerAlive();
    if (alive) {
      this.status = InferenceServerStatus.RUNNING;
      this.managedByJarBees = false;
      this.logger.log(
        `[supervisor] llama-server ya está en ejecución externa en ${this.host}:${this.port}`,
      );
      return;
    }

    this.status = InferenceServerStatus.STOPPED;

    if (this.autoStart) {
      this.logger.log(
        '[supervisor] LLAMACPP_AUTO_START activo — iniciando servidor...',
      );
      try {
        await this.startServer();
      } catch (err: any) {
        this.logger.warn(
          `[supervisor] No se pudo auto-iniciar llama-server: ${err.message}. El sistema continuará usando Ollama como respaldo.`,
        );
      }
    } else {
      this.logger.log(
        `[supervisor] llama-server no activo. (LLAMACPP_AUTO_START=false — bajo demanda o administrado externamente)`,
      );
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `[supervisor] Apagando backend (${signal || 'SHUTDOWN'}) — verificando liberación de VRAM...`,
    );
    if (this.managedByJarBees) {
      await this.stopServer();
    }
  }

  // ── API pública ─────────────────────────────────────────────────────────────

  getState(): SupervisorState {
    this.checkWindowExpiration();
    return {
      status: this.status,
      pid: this.serverProcess?.pid,
      managedByJarBees: this.managedByJarBees,
      port: this.port,
      routerMode: this.routerMode,
      lastStarted: this.lastStarted,
      lastError: this.lastError,
      restartAttempts: this.restartAttempts,
      circuitBreakerTripped: this.status === InferenceServerStatus.FAILED,
    };
  }

  /**
   * Verifica conectividad HTTP contra /health de llama-server
   */
  async isServerAlive(): Promise<boolean> {
    try {
      const res = await axios.get(`http://${this.host}:${this.port}/health`, {
        timeout: 2000,
      });
      return res.status === 200 && (res.data?.status === 'ok' || res.data?.status === 'loading model');
    } catch {
      return false;
    }
  }

  /**
   * Descarga de la memoria GPU los modelos cargados en Ollama para evitar OOM
   */
  async freeOllamaVram(): Promise<void> {
    try {
      const psRes = await axios.get('http://localhost:11434/api/ps', {
        timeout: 1500,
      });
      const models = psRes.data?.models || [];
      for (const m of models) {
        this.logger.log(
          `[supervisor] Descargando '${m.name}' de VRAM en Ollama para garantizar los 12 GB para llama-server...`,
        );
        await axios.post(
          'http://localhost:11434/api/generate',
          { model: m.name, keep_alive: 0 },
          { timeout: 3000 },
        );
      }
    } catch {
      // Si Ollama no está corriendo, no hay modelos en VRAM
    }
  }

  /**
   * Inicia el proceso llama-server.exe
   */
  async startServer(): Promise<void> {
    this.stoppedExplicitly = false;
    if (await this.isServerAlive()) {
      this.status = InferenceServerStatus.RUNNING;
      return;
    }

    if (this.status === InferenceServerStatus.FAILED) {
      this.checkWindowExpiration();
      if (this.status === InferenceServerStatus.FAILED) {
        throw new Error(
          `Circuit breaker abierto: demasiados fallos (${this.restartAttempts}/${MAX_RESTARTS}). Esperando reinicio de ventana.`,
        );
      }
    }

    if (!fs.existsSync(this.binaryPath)) {
      throw new Error(`Binario no encontrado en ${this.binaryPath}`);
    }

    this.status = InferenceServerStatus.STARTING;

    // Liberar VRAM de Ollama previamente
    await this.freeOllamaVram();

    let args: string[] = [];

    if (this.routerMode && fs.existsSync(this.modelsDir)) {
      args = [
        '--models-dir',
        this.modelsDir,
        '--models-max',
        this.modelsMax,
        '--host',
        this.host,
        '--port',
        String(this.port),
        '-ngl',
        this.ngl,
        '-c',
        this.ctxSize,
        '-ctk',
        this.ctk,
        '-ctv',
        this.ctv,
        '--jinja',
        '--parallel',
        this.parallel,
      ];

      if (fs.existsSync(this.presetsPath)) {
        args.splice(2, 0, '--models-preset', this.presetsPath);
      }

      this.logger.log(
        `[supervisor] Iniciando llama-server en Router Mode (directorio: ${this.modelsDir}, max: ${this.modelsMax}, ctk: ${this.ctk}, ctv: ${this.ctv})`,
      );
    } else {
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Modelo GGUF no encontrado en ${this.modelPath}`);
      }

      const defaultAlias =
        process.env.LLAMACPP_DEFAULT_MODEL || 'qwen2.5-coder:14b';
      args = [
        '-m',
        this.modelPath,
        '--host',
        this.host,
        '--port',
        String(this.port),
        '-ngl',
        this.ngl,
        '-c',
        this.ctxSize,
        '-np',
        this.parallel,
        '--alias',
        defaultAlias,
      ];

      this.logger.log(
        `[supervisor] Iniciando proceso: ${this.binaryPath} con modelo ${this.modelPath} (-c ${this.ctxSize}, -ngl ${this.ngl}, -np ${this.parallel})`,
      );
    }

    const proc = spawn(this.binaryPath, args, {
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
    });
    this.serverProcess = proc;

    this.managedByJarBees = true;

    proc.on('error', (err) => {
      if (this.serverProcess !== proc) return;
      this.logger.error(`[supervisor] Error en llama-server: ${err.message}`);
      this.lastError = err.message;
      this.status = InferenceServerStatus.FAILED;
      this.recordFailure();
    });

    proc.on('exit', (code, signal) => {
      this.logger.warn(
        `[supervisor] llama-server finalizó (code: ${code}, signal: ${signal})`,
      );
      if (this.serverProcess === proc) {
        this.status = InferenceServerStatus.STOPPED;
        this.serverProcess = undefined;
        this.managedByJarBees = false;
      }
    });

    try {
      await this.waitUntilReady(25000, proc);
      this.status = InferenceServerStatus.RUNNING;
      this.lastStarted = new Date();
      this.logger.log(
        `✅ [supervisor] llama-server listo en ${this.host}:${this.port} (PID: ${proc.pid})`,
      );
    } catch (err: any) {
      this.lastError = err.message;
      this.recordFailure();
      await this.stopServer();
      throw err;
    }
  }

  /**
   * Detiene el proceso y libera la VRAM
   */
  async stopServer(): Promise<void> {
    this.stoppedExplicitly = true;
    const pid = this.serverProcess?.pid;
    if (!pid) {
      this.status = InferenceServerStatus.STOPPED;
      return;
    }

    this.logger.log(`[supervisor] Deteniendo llama-server (PID: ${pid})...`);

    try {
      if (process.platform === 'win32') {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
        } catch {
          this.serverProcess?.kill('SIGKILL');
        }
      } else {
        this.serverProcess?.kill('SIGTERM');
      }
    } catch (err: any) {
      this.logger.warn(`[supervisor] Error deteniendo proceso: ${err.message}`);
    }

    // Esperar a que el kernel libere efectivamente el socket TCP y el contexto CUDA
    const stopDeadline = Date.now() + 5000;
    while (Date.now() < stopDeadline) {
      if (!(await this.isServerAlive())) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await new Promise((r) => setTimeout(r, 250));

    this.serverProcess = undefined;
    this.managedByJarBees = false;
    this.status = InferenceServerStatus.STOPPED;
    this.logger.log('[supervisor] ✅ Proceso detenido y memoria GPU liberada.');
  }

  /**
   * Intenta recuperar el servidor si cayó (evitando reinicios innecesarios si ya responde /health)
   */
  async recover(): Promise<void> {
    if (
      this.status === InferenceServerStatus.STARTING ||
      this.stoppedExplicitly
    ) {
      return;
    }
    if (await this.isServerAlive()) {
      this.status = InferenceServerStatus.RUNNING;
      return;
    }
    this.logger.log('[supervisor] Solicitud de recuperación recibida...');
    await this.startServer();
  }

  /**
   * Obtiene métricas reales de la GPU (NVIDIA RTX 5070) vía nvidia-smi.
   */
  getGpuTelemetry(): GpuTelemetryReport | undefined {
    try {
      const out = execSync(
        'nvidia-smi --query-gpu=memory.used,memory.free,memory.total,temperature.gpu,utilization.gpu --format=csv,noheader,nounits',
        { timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString('utf8')
        .trim();
      const firstLine = out.split(/\r?\n/)[0];
      if (!firstLine) return undefined;
      const parts = firstLine.split(',').map((s) => Number(s.trim()));
      if (parts.length < 5 || parts.some((n) => Number.isNaN(n))) {
        return undefined;
      }
      return {
        vramUsedMiB: parts[0],
        vramFreeMiB: parts[1],
        vramTotalMiB: parts[2],
        gpuTempC: parts[3],
        gpuUtilPercent: parts[4],
      };
    } catch {
      return undefined;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async waitUntilReady(
    timeoutMs: number,
    proc?: ChildProcess,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (proc && proc.exitCode !== null) {
        throw new Error(
          `llama-server finalizó prematuramente durante el arranque (exitCode: ${proc.exitCode})`,
        );
      }
      if (await this.isServerAlive()) return;
      await new Promise((r) => setTimeout(r, READY_POLL_INTERVAL_MS));
    }
    throw new Error(
      `llama-server no respondió después de ${timeoutMs / 1000}s`,
    );
  }

  private recordFailure(): void {
    const now = new Date();
    if (!this.windowStart) this.windowStart = now;

    this.checkWindowExpiration();

    this.restartAttempts++;
    if (this.restartAttempts >= MAX_RESTARTS) {
      this.status = InferenceServerStatus.FAILED;
      this.logger.error(
        `🚨 [supervisor] Circuit breaker activado: ${this.restartAttempts} fallos registrados. Pausando auto-start.`,
      );
    }
  }

  private checkWindowExpiration(): void {
    if (this.windowStart) {
      const elapsed = Date.now() - this.windowStart.getTime();
      if (elapsed > CIRCUIT_BREAKER_WINDOW_MS) {
        this.restartAttempts = 0;
        this.windowStart = new Date();
        if (this.status === InferenceServerStatus.FAILED) {
          this.status = InferenceServerStatus.STOPPED;
        }
      }
    }
  }
}
