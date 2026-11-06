import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export class SingleInstanceLockException extends Error {
  constructor(
    message: string,
    public readonly activePid?: number,
    public readonly port?: number,
  ) {
    super(message);
    this.name = 'SingleInstanceLockException';
  }
}

export interface InstanceLockMetadata {
  pid: number;
  instanceUuid: string;
  acquiredAt: number;
  port: number;
}

/**
 * 🔒 SingleInstanceLockService (DEV-001-B1.3.1: F-B1-02-02)
 *
 * Aplica exclusión mutua estricta a nivel de Sistema Operativo para garantizar
 * que únicamente una sola instancia de JarBees ejecute el backend en el host.
 *
 * Características de seguridad:
 * 1. Adquisición atómica por el kernel del SO mediante socket loopback exclusivo (Win32 / POSIX).
 * 2. Cero bloqueo permanente tras crash (el SO libera automáticamente el socket en SIGKILL o corte de energía).
 * 3. Fallo cerrado inmediato (EADDRINUSE) para cualquier segunda instancia concurrente.
 * 4. Eliminación segura de metadata vinculada inequívocamente al UUID de la instancia propietaria.
 */
@Injectable()
export class SingleInstanceLockService implements OnModuleDestroy {
  private readonly logger = new Logger(SingleInstanceLockService.name);
  private server: net.Server | null = null;
  private isHeld = false;
  private readonly instanceUuid = crypto.randomUUID();
  private readonly lockDir: string;
  private readonly lockFilePath: string;
  private readonly port: number;

  constructor(@Optional() options?: { port?: number; lockDir?: string }) {
    this.port =
      options?.port ??
      (process.env.JARBEES_INSTANCE_MUTEX_PORT
        ? parseInt(process.env.JARBEES_INSTANCE_MUTEX_PORT, 10)
        : 40199);

    this.lockDir = path.resolve(
      options?.lockDir ?? process.env.JARBEES_STORAGE_DIR ?? 'storage',
      'security',
    );
    this.lockFilePath = path.join(this.lockDir, 'jarbees-instance.lock');
  }

  async acquireLock(): Promise<{ pid: number; port: number; instanceUuid: string }> {
    if (this.isHeld) {
      return { pid: process.pid, port: this.port, instanceUuid: this.instanceUuid };
    }

    if (process.env.JARBEES_DISABLE_INSTANCE_LOCK === 'true') {
      this.isHeld = true;
      return { pid: process.pid, port: this.port, instanceUuid: this.instanceUuid };
    }

    return new Promise((resolve, reject) => {
      const srv = net.createServer();
      this.server = srv;

      // Desreferenciar el servidor para que no impida la salida natural del proceso
      if (typeof (srv as any).unref === 'function') {
        srv.unref();
      }

      srv.once('error', (err: any) => {
        this.server = null;
        if (err.code === 'EADDRINUSE') {
          const activeMeta = this.readLockMetadata();
          const activePidStr = activeMeta?.pid ? ` (PID activo: ${activeMeta.pid})` : '';
          const msg = `SecurityKernel: otra instancia de JarBees${activePidStr} ya está en ejecución en el puerto mutex ${this.port}. Se rechaza el arranque concurrente (Single-Instance Enforcement).`;
          this.logger.error(`[SingleInstanceLock] ${msg}`);
          return reject(new SingleInstanceLockException(msg, activeMeta?.pid, this.port));
        }
        return reject(
          new SingleInstanceLockException(
            `Error inesperado al adquirir lock de instancia: ${err.message}`,
          ),
        );
      });

      srv.listen({ host: '127.0.0.1', port: this.port, exclusive: true }, () => {
        this.isHeld = true;
        this.writeLockMetadata();
        this.logger.log(
          `[SingleInstanceLock] Lock de instancia única adquirido exitosamente (PID: ${process.pid}, puerto: ${this.port}, UUID: ${this.instanceUuid.slice(0, 8)}).`,
        );
        resolve({ pid: process.pid, port: this.port, instanceUuid: this.instanceUuid });
      });
    });
  }

  releaseLock(): void {
    if (!this.isHeld) return;
    try {
      if (this.server) {
        this.server.close();
        this.server = null;
      }
    } catch {}

    this.removeLockMetadata();
    this.isHeld = false;
    this.logger.log(`[SingleInstanceLock] Lock de instancia liberado ordenadamente (PID: ${process.pid}).`);
  }

  isLockHeld(): boolean {
    return this.isHeld;
  }

  getPort(): number {
    return this.port;
  }

  getInstanceUuid(): string {
    return this.instanceUuid;
  }

  private writeLockMetadata(): void {
    try {
      if (!fs.existsSync(this.lockDir)) {
        fs.mkdirSync(this.lockDir, { recursive: true });
      }
      const meta: InstanceLockMetadata = {
        pid: process.pid,
        instanceUuid: this.instanceUuid,
        acquiredAt: Date.now(),
        port: this.port,
      };
      fs.writeFileSync(this.lockFilePath, JSON.stringify(meta, null, 2), 'utf8');
    } catch (err: any) {
      this.logger.warn(`No se pudo persistir archivo informativo de lock: ${err.message}`);
    }
  }

  readLockMetadata(): InstanceLockMetadata | null {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        const raw = fs.readFileSync(this.lockFilePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}
    return null;
  }

  private removeLockMetadata(): void {
    try {
      if (fs.existsSync(this.lockFilePath)) {
        const meta = this.readLockMetadata();
        if (!meta || meta.instanceUuid === this.instanceUuid) {
          fs.unlinkSync(this.lockFilePath);
        }
      }
    } catch {}
  }

  onModuleDestroy() {
    this.releaseLock();
  }
}

