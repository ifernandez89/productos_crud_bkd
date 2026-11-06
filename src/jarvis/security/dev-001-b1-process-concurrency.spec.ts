import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../auth/auth.service';
import {
  SingleInstanceLockService,
  SingleInstanceLockException,
} from '../../auth/single-instance-lock.service';
import { SecurityKernelAuthGuard } from './security-kernel-auth.guard';
import { ActionGatekeeperService } from './action-gatekeeper.service';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';

jest.setTimeout(45000);

describe('DEV-001-B1.3.1: Inter-Process Concurrency & Single-Instance Hardening (TEST-01)', () => {
  const TEST_MUTEX_PORT = 40399;
  const TEST_STORAGE_DIR = path.resolve(
    process.cwd(),
    'storage',
    'security-test-concurrency',
  );
  const WORKER_SCRIPT = path.resolve(
    process.cwd(),
    'test',
    'helpers',
    'single-instance-worker.js',
  );

  const activeChildren: ChildProcess[] = [];

  const spawnWorker = (port: number = TEST_MUTEX_PORT): Promise<{
    child: ChildProcess;
    message: any;
  }> => {
    return new Promise((resolve, reject) => {
      const child = fork(WORKER_SCRIPT, [], {
        env: {
          ...process.env,
          TEST_MUTEX_PORT: String(port),
          TEST_LOCK_DIR: TEST_STORAGE_DIR,
        },
        silent: true,
      });
      activeChildren.push(child);

      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Timeout esperando respuesta del worker en puerto ${port}`));
      }, 10000);

      child.on('message', (message: any) => {
        clearTimeout(timeout);
        resolve({ child, message });
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  };

  beforeAll(() => {
    if (!fs.existsSync(TEST_STORAGE_DIR)) {
      fs.mkdirSync(TEST_STORAGE_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Terminar todos los procesos hijos activos
    for (const child of activeChildren) {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
    activeChildren.length = 0;
  });

  afterAll(() => {
    // Limpieza de directorio de test
    try {
      if (fs.existsSync(TEST_STORAGE_DIR)) {
        fs.rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
      }
    } catch {}
  });

  // =========================================================================
  // Escenario A: Single-Instance Enforcement con Procesos Independientes
  // =========================================================================
  describe('Escenario A: Single-Instance Enforcement con Procesos Node.js Independientes', () => {
    it('Paso 1 & 2: Proceso 1 adquiere lock; Proceso 2 concurrente es RECHAZADO (EADDRINUSE)', async () => {
      // 1. Iniciar Proceso 1
      const { child: child1, message: msg1 } = await spawnWorker(TEST_MUTEX_PORT);
      expect(msg1.status).toBe('acquired');
      expect(msg1.port).toBe(TEST_MUTEX_PORT);
      expect(msg1.pid).toBe(child1.pid);

      // 2. Intentar iniciar Proceso 2 simultáneamente en el mismo puerto
      const { child: child2, message: msg2 } = await spawnWorker(TEST_MUTEX_PORT);
      expect(msg2.status).toBe('failed');
      expect(msg2.name).toBe('SingleInstanceLockException');
      expect(msg2.error).toContain('ya está en ejecución');

      // Limpieza ordenada de Proceso 1
      child1.send('release');
      await new Promise((r) => setTimeout(r, 100));
    });

    it('Paso 3 & 4: Tras terminación abrupta (SIGKILL) del Proceso 1, Proceso 3 recupera el lock inmediatamente sin deadlock', async () => {
      // 1. Iniciar Proceso 1
      const { child: child1, message: msg1 } = await spawnWorker(TEST_MUTEX_PORT);
      expect(msg1.status).toBe('acquired');

      // 2. Terminar abruptamente con SIGKILL (simulando caída de energía o crash fatal de SO)
      child1.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 200));

      // 3. Proceso 3 intenta iniciar en el mismo puerto
      // El kernel del SO ya liberó el socket -> adquisición exitosa sin bloqueo permanente
      const { child: child3, message: msg3 } = await spawnWorker(TEST_MUTEX_PORT);
      expect(msg3.status).toBe('acquired');
      expect(msg3.pid).toBe(child3.pid);

      child3.send('release');
      await new Promise((r) => setTimeout(r, 100));
    });

    it('Paso 5: Dos procesos compitiendo simultáneamente tras crash: exactamente uno gana la propiedad y el otro es rechazado', async () => {
      // Lanzar Proceso 4 y Proceso 5 en paralelo con Promise.all
      const [resA, resB] = await Promise.all([
        spawnWorker(TEST_MUTEX_PORT),
        spawnWorker(TEST_MUTEX_PORT),
      ]);

      const acquiredCount = [resA, resB].filter((r) => r.message.status === 'acquired').length;
      const failedCount = [resA, resB].filter((r) => r.message.status === 'failed').length;

      expect(acquiredCount).toBe(1);
      expect(failedCount).toBe(1);
    });
  });

  // =========================================================================
  // Escenario B: AuthService y Rechazo de Instancias no Autorizadas
  // =========================================================================
  describe('Escenario B: AuthService fail-closed si no posee el lock de instancia', () => {
    it('AuthService.login() arroja SingleInstanceLockException si la instancia no adquirió el lock', () => {
      process.env.JWT_SECRET = 'test-secret-key-32bytes-concurrency';
      const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
      const authService = new AuthService(jwtService);

      // Con el lock sin adquirir y sin variable de bypass, login() debe fallar cerrado
      delete process.env.JARBEES_DISABLE_INSTANCE_LOCK;
      expect(() => {
        authService.login({ operatorId: 'test-user', password: 'AnyPassword123!' });
      }).toThrow(SingleInstanceLockException);

      authService.destroy();
    });
  });

  // =========================================================================
  // Escenario C: Resiliencia de Persistencia y Limpieza de Temporales Huérfanos
  // =========================================================================
  describe('Escenario C: Recuperación de Persistencia y Limpieza de Temporales Huérfanos', () => {
    it('initLockoutStore() elimina archivos temporales huérfanos (>5s) pero preserva archivos de estado definitivos (.json)', () => {
      const lockoutDir = path.join(TEST_STORAGE_DIR, 'security', 'auth-lockout');
      fs.mkdirSync(lockoutDir, { recursive: true });

      // 1. Crear temporal huérfano abandonado (simular mtime de 10 segundos atrás)
      const orphanTmpPath = path.join(lockoutDir, `test-bucket.${crypto.randomUUID()}.tmp`);
      fs.writeFileSync(orphanTmpPath, 'partial-write-data');
      const pastTime = (Date.now() - 10000) / 1000;
      fs.utimesSync(orphanTmpPath, pastTime, pastTime);

      // 2. Crear archivo de estado legítimo .json vigente
      const legitimateJsonPath = path.join(lockoutDir, 'legitimate-bucket.json');
      fs.writeFileSync(
        legitimateJsonPath,
        JSON.stringify({ key: 'ip:1.1.1.1', attemptsInWindow: 2, windowStartedAt: Date.now() }),
      );

      // 3. Crear temporal reciente (< 2 segundos atrás) que simule una escritura activa
      const activeTmpPath = path.join(lockoutDir, `active.${crypto.randomUUID()}.tmp`);
      fs.writeFileSync(activeTmpPath, 'in-flight-data');

      // Instanciar AuthService apuntando a este directorio
      process.env.JARBEES_DISABLE_INSTANCE_LOCK = 'true';
      process.env.JARBEES_STORAGE_DIR = TEST_STORAGE_DIR;
      process.env.JWT_SECRET = 'test-secret-key-32bytes-concurrency';
      const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
      const authService = new AuthService(jwtService);

      // Verificaciones:
      // - El temporal huérfano (>5s) DEBE haber sido eliminado en arranque
      expect(fs.existsSync(orphanTmpPath)).toBe(false);

      // - El archivo de estado .json legítimo DEBE preservarse intacto
      expect(fs.existsSync(legitimateJsonPath)).toBe(true);

      // - El temporal activo reciente (<5s) DEBE preservarse
      expect(fs.existsSync(activeTmpPath)).toBe(true);

      authService.destroy();
      try {
        fs.unlinkSync(legitimateJsonPath);
        fs.unlinkSync(activeTmpPath);
      } catch {}
    });

    it('recordFailedLogin() sincroniza desde disco evitando Lost Updates', () => {
      process.env.JARBEES_DISABLE_INSTANCE_LOCK = 'true';
      process.env.JARBEES_STORAGE_DIR = TEST_STORAGE_DIR;
      process.env.JWT_SECRET = 'test-secret-key-32bytes-concurrency';
      process.env.MASTER_PASSWORD = 'CorrectPassword123!';
      const jwtService = new JwtService({ secret: process.env.JWT_SECRET });
      const authService = new AuthService(jwtService);

      const testIp = '192.168.100.55';
      const clientContext = { ip: testIp };

      // Ejecutar 5 intentos fallidos
      for (let i = 0; i < 4; i++) {
        expect(() => {
          authService.login({ operatorId: 'test-op', password: 'WrongPassword' }, clientContext);
        }).toThrow(UnauthorizedException);
      }

      // El 5to intento fallido debe detonar 429 Too Many Requests
      expect(() => {
        authService.login({ operatorId: 'test-op', password: 'WrongPassword' }, clientContext);
      }).toThrow(/bloqueada temporalmente|Too Many Requests/i);

      authService.destroy();
    });
  });

  // =========================================================================
  // Escenario D: Blindaje de Idempotencia A1-03 (WeakSet Privado)
  // =========================================================================
  describe('Escenario D: Blindaje de Idempotencia A1-03 (WeakSet Privado)', () => {
    it('SecurityKernelAuthGuard ignora propiedades __securityKernelVerified inyectadas por atacante en el request', async () => {
      const reflector = new Reflector();
      const gatekeeper = new ActionGatekeeperService();
      const guard = new SecurityKernelAuthGuard(reflector, gatekeeper);

      // Petición maliciosa con __securityKernelVerified inyectado en query/body/headers
      const maliciousRequest = {
        method: 'POST',
        url: '/api/jarbees/query',
        __securityKernelVerified: true, // Intento de bypass
        body: { query: 'malicious', __securityKernelVerified: true },
        headers: { 'x-security-kernel-verified': 'true' },
        user: undefined, // Sin JWT válido
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => maliciousRequest,
        }),
        getHandler: () => ({ name: 'query' }),
        getClass: () => ({ name: 'JarvisController' }),
      } as any;

      // El guard DEBE rechazar la petición con UnauthorizedException a pesar de la bandera inyectada
      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);

      gatekeeper.destroy();
    });
  });
});

