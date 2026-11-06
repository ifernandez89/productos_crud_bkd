import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  SingleInstanceLockService,
  SingleInstanceLockException,
} from './single-instance-lock.service';
import {
  JARBEES_JWT_ALGORITHM,
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
  PROHIBITED_DEFAULT_SECRETS,
  hashOperatorPasswordScrypt,
  resolveRequiredJwtSecret,
  verifyOperatorPasswordScrypt,
} from './jwt-secret.util';

export const DEFAULT_OPERATOR_SCOPES = [
  'jarbees:read',
  'jarbees:research',
  'jarbees:mutate',
  'jarbees:audiobooks:ingest',
  'jarbees:engineering',
  'jarbees:security:challenge',
  'jarbees:library:delete',
  'jarbees:library:approve',
  'jarbees:3d:read',
  'jarbees:3d:mutate',
  'jarbees:poster:read',
  'jarbees:poster:mutate',
] as const;

export type OperatorScope = (typeof DEFAULT_OPERATOR_SCOPES)[number] | string;

export interface OperatorLoginRequest {
  operatorId?: string;
  password?: string;
  scopes?: string[];
}

export interface LoginClientContext {
  ip?: string;
  forwardedFor?: string;
  userAgent?: string;
}

export interface VerifiedOperatorIdentity {
  userId: string;
  role: 'operator' | 'admin';
  scopes: string[];
  jti: string;
  iss: string;
  aud: string;
}

interface BruteForceBucket {
  attemptsInWindow: number;
  windowStartedAt: number;
  consecutiveFailures: number;
  lockedUntil: number;
}

const VALID_OPERATOR_ID_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;
const PROHIBITED_HARDCODED_IDENTITIES = new Set([
  'jarbees-owner',
  'owner',
  'root',
  'anonymous',
  'system',
  'default',
]);

const LOGIN_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_LOGIN_ATTEMPTS_PER_MINUTE = 5;

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly bruteForceBuckets = new Map<string, BruteForceBucket>();
  private readonly derivedLegacyScryptCache = new Map<string, string>();
  private readonly corruptedLockoutKeys = new Set<string>();
  private readonly lockoutDir: string;
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly instanceLock: SingleInstanceLockService;
  private legacyPlaintextWarned = false;

  constructor(
    private readonly jwt: JwtService,
    @Optional() private readonly cfg?: ConfigService,
    @Optional() private readonly instanceLockService?: SingleInstanceLockService,
  ) {
    // Fail-closed: la aplicación no puede instanciar AuthService sin JWT_SECRET válido
    this.jwtSecret = resolveRequiredJwtSecret(this.cfg);

    this.lockoutDir = path.resolve(
      this.cfg?.get<string>('JARBEES_STORAGE_DIR') ??
        process.env.JARBEES_STORAGE_DIR ??
        'storage',
      'security',
      'auth-lockout',
    );

    this.instanceLock =
      this.instanceLockService ??
      new SingleInstanceLockService({
        lockDir: path.dirname(this.lockoutDir),
        port: process.env.JARBEES_INSTANCE_MUTEX_PORT
          ? parseInt(process.env.JARBEES_INSTANCE_MUTEX_PORT, 10)
          : undefined,
      });

    this.initLockoutStore();

    // Limpieza periódica de lockouts expirados y temporales huérfanos cada 60s (DEV-001-B1.3 / B1.3.1)
    this.cleanupInterval = setInterval(() => {
      this.pruneExpiredLockouts();
    }, 60000);

    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  async onModuleInit() {
    await this.acquireInstanceLock();
  }

  async acquireInstanceLock(): Promise<void> {
    if (!this.instanceLock.isLockHeld()) {
      await this.instanceLock.acquireLock();
    }
  }

  assertInstanceLock(): void {
    if (process.env.JARBEES_DISABLE_INSTANCE_LOCK === 'true') {
      return;
    }
    if (!this.instanceLock.isLockHeld()) {
      throw new SingleInstanceLockException(
        'SecurityKernel: AuthService no puede operar porque el lock de instancia única no ha sido adquirido en el host.',
      );
    }
  }

  getInstanceLockService(): SingleInstanceLockService {
    return this.instanceLock;
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.instanceLock) {
      this.instanceLock.releaseLock();
    }
  }

  destroy() {
    this.onModuleDestroy();
  }

  private initLockoutStore(): void {
    try {
      if (!fs.existsSync(this.lockoutDir)) {
        fs.mkdirSync(this.lockoutDir, { recursive: true });
      }
      this.pruneOrphanedTempFiles();
      this.pruneAndLoadPersistedLockouts();
    } catch (err: any) {
      this.logger.error(`Error inicializando directorio auth-lockout (${this.lockoutDir}): ${err.message}`);
    }
  }

  private pruneOrphanedTempFiles(): void {
    const now = Date.now();
    const ORPHAN_THRESHOLD_MS = 5000; // Cualquier archivo .tmp con más de 5s está abandonado (DEV-001-B1.3.1)

    try {
      if (!fs.existsSync(this.lockoutDir)) return;
      const files = fs.readdirSync(this.lockoutDir);
      for (const file of files) {
        if (!file.includes('.tmp')) continue;
        const fullPath = path.join(this.lockoutDir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > ORPHAN_THRESHOLD_MS) {
            fs.unlinkSync(fullPath);
            this.logger.warn(
              `[AuthService] Archivo temporal huérfano eliminado: ${file} (antigüedad: ${Math.round((now - stat.mtimeMs) / 1000)}s).`,
            );
          }
        } catch (err: any) {
          this.logger.error(`Error evaluando temporal huérfano ${file}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error limpiando temporales huérfanos: ${err.message}`);
    }
  }

  private getLockoutFilePath(key: string): string {
    const safeKey = crypto.createHash('sha256').update(key).digest('hex');
    return path.join(this.lockoutDir, `${safeKey}.json`);
  }

  private pruneExpiredLockouts(): void {
    const now = Date.now();
    this.pruneOrphanedTempFiles();
    try {
      if (!fs.existsSync(this.lockoutDir)) return;
      const files = fs.readdirSync(this.lockoutDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const fullPath = path.join(this.lockoutDir, file);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          if (!raw || raw.trim().length === 0) continue;
          const data = JSON.parse(raw);
          if (
            data &&
            typeof data === 'object' &&
            data.key &&
            (!data.lockedUntil || data.lockedUntil <= now) &&
            now - (data.windowStartedAt || 0) >= LOGIN_WINDOW_MS
          ) {
            try {
              fs.unlinkSync(fullPath);
            } catch {}
          }
        } catch {
          // No borrar archivos corruptos en la purga periódica
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error purgando lockouts expirados: ${err.message}`);
    }
  }

  private pruneAndLoadPersistedLockouts(): void {
    const now = Date.now();
    try {
      if (!fs.existsSync(this.lockoutDir)) return;
      const files = fs.readdirSync(this.lockoutDir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const fullPath = path.join(this.lockoutDir, file);
        const fileKeyHash = file.slice(0, -5);
        try {
          const raw = fs.readFileSync(fullPath, 'utf8');
          if (!raw || raw.trim().length === 0) {
            // Archivo de 0 bytes: NO BORRAR (Fail-Closed ante caídas)
            this.corruptedLockoutKeys.add(fileKeyHash);
            this.logger.warn(
              `[AuthService] Archivo de lockout vacío (0 bytes) detectado: ${file}. Se retiene en disco (Fail-Closed).`,
            );
            continue;
          }
          const data = JSON.parse(raw);
          if (data && typeof data === 'object' && data.key) {
            if (data.lockedUntil && data.lockedUntil > now) {
              this.bruteForceBuckets.set(data.key, {
                attemptsInWindow: data.attemptsInWindow || 0,
                windowStartedAt: data.windowStartedAt || now,
                consecutiveFailures: data.consecutiveFailures || 0,
                lockedUntil: data.lockedUntil,
              });
            } else if (now - (data.windowStartedAt || 0) >= LOGIN_WINDOW_MS) {
              try {
                fs.unlinkSync(fullPath);
              } catch {}
            }
          }
        } catch (parseErr: any) {
          // Archivo corrupto o incompleto tras crash: NO BORRAR AUTOMÁTICAMENTE (DEV-001-B1.3: F-B1-02-01 resuelto)
          this.corruptedLockoutKeys.add(fileKeyHash);
          this.logger.error(
            `[AuthService] Archivo de lockout corrupto detectado: ${file} (${parseErr.message}). Retenido en cuarentena Fail-Closed.`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`Error leyendo o purgando lockouts persistidos: ${err.message}`);
    }
  }

  /**
   * Sincronización multi-worker / multi-proceso desde disco (DEV-001-B1.3: F-B1-02-02 resuelto).
   * Permite que múltiples workers de Node.js en el mismo host compartan el estado de bloqueos.
   */
  private syncBucketFromDisk(key: string, bucket: BruteForceBucket, now: number): BruteForceBucket {
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    if (this.corruptedLockoutKeys.has(keyHash)) {
      bucket.lockedUntil = Math.max(bucket.lockedUntil, now + LOGIN_WINDOW_MS);
      return bucket;
    }

    try {
      const filePath = this.getLockoutFilePath(key);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (raw && raw.trim().length > 0) {
          const diskData = JSON.parse(raw);
          if (diskData && typeof diskData === 'object') {
            if (diskData.lockedUntil && diskData.lockedUntil > now) {
              bucket.lockedUntil = Math.max(bucket.lockedUntil, diskData.lockedUntil);
              bucket.consecutiveFailures = Math.max(
                bucket.consecutiveFailures,
                diskData.consecutiveFailures || 0,
              );
            }
            if (
              diskData.attemptsInWindow &&
              diskData.windowStartedAt &&
              now - diskData.windowStartedAt < LOGIN_WINDOW_MS
            ) {
              bucket.attemptsInWindow = Math.max(
                bucket.attemptsInWindow,
                diskData.attemptsInWindow,
              );
              bucket.windowStartedAt = Math.min(
                bucket.windowStartedAt,
                diskData.windowStartedAt,
              );
            }
          }
        }
      }
    } catch {}
    return bucket;
  }

  /**
   * Persistencia atómica de buckets mediante archivo temporal + fsyncSync + renameSync (DEV-001-B1.3: F-B1-02-01).
   */
  private persistLockoutBucket(key: string, bucket: BruteForceBucket): void {
    try {
      if (!fs.existsSync(this.lockoutDir)) {
        fs.mkdirSync(this.lockoutDir, { recursive: true });
      }
      const filePath = this.getLockoutFilePath(key);
      const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
      const payload = JSON.stringify({ key, ...bucket });

      const fd = fs.openSync(
        tempPath,
        fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
        0o600,
      );
      try {
        fs.writeFileSync(fd, payload, 'utf8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }

      fs.renameSync(tempPath, filePath);
    } catch (err: any) {
      this.logger.error(`Error persistiendo lockout para ${key}: ${err.message}`);
    }
  }

  private deletePersistedLockoutBucket(key: string): void {
    try {
      const filePath = this.getLockoutFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {}
  }

  /**
   * Extrae la IP real del cliente considerando proxies únicamente cuando TRUST_PROXY=true.
   */
  resolveClientIp(ctx?: LoginClientContext): string {
    const trustProxy =
      (this.cfg?.get<string>('TRUST_PROXY') ?? process.env.TRUST_PROXY) ===
      'true';
    if (trustProxy && ctx?.forwardedFor && typeof ctx.forwardedFor === 'string') {
      const firstHop = ctx.forwardedFor.split(',')[0]?.trim();
      if (firstHop) {
        return firstHop;
      }
    }
    return (ctx?.ip && typeof ctx.ip === 'string' ? ctx.ip.trim() : '') || 'local-client';
  }

  /**
   * Autentica al operador verificando credenciales mediante scrypt + timingSafeEqual,
   * aplicando rate-limiting estricto (5 req/min) y bloqueo progresivo contra fuerza bruta,
   * y emitiendo un JWT firmado con HS256 y claims completos (sub, role, scopes, jti, iss, aud, exp).
   */
  login(
    credentials?: OperatorLoginRequest,
    clientContext?: LoginClientContext,
  ): {
    access_token: string;
    expires_in: string;
    operatorId: string;
    role: string;
    scopes: string[];
    issuer: string;
    audience: string;
  } {
    // 0. Exclusión mutua estricta: asegurar que esta instancia posee el lock del host
    this.assertInstanceLock();

    const clientIp = this.resolveClientIp(clientContext);
    const candidateOperator =
      typeof credentials?.operatorId === 'string' && credentials.operatorId.trim()
        ? credentials.operatorId.trim().toLowerCase()
        : 'unknown-operator';

    const ipKey = `ip:${clientIp}`;
    const opIpKey = `op:${candidateOperator}@${clientIp}`;

    // 1. Verificar rate limit por minuto y bloqueo progresivo antes de procesar credenciales
    this.enforceRateLimitAndLockout(ipKey);
    this.enforceRateLimitAndLockout(opIpKey);

    if (!credentials || typeof credentials !== 'object') {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException(
        'Credenciales requeridas: debe proporcionar operatorId y password.',
      );
    }

    const providedPassword =
      typeof credentials.password === 'string' ? credentials.password : '';
    if (!providedPassword) {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException(
        'Credenciales inválidas: la contraseña del operador es obligatoria.',
      );
    }

    const targetScryptHash = this.resolveTargetOperatorScryptHash();
    if (!targetScryptHash) {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException(
        'Autenticación rechazada: MASTER_PASSWORD_HASH / MASTER_PASSWORD no está configurado de forma segura.',
      );
    }

    if (!verifyOperatorPasswordScrypt(providedPassword, targetScryptHash)) {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException('Credenciales de operador inválidas.');
    }

    const rawOperatorId = (
      credentials.operatorId ??
      this.cfg?.get<string>('JARBEES_OPERATOR_ID') ??
      process.env.JARBEES_OPERATOR_ID ??
      ''
    ).trim();

    if (
      !rawOperatorId ||
      !VALID_OPERATOR_ID_REGEX.test(rawOperatorId) ||
      PROHIBITED_HARDCODED_IDENTITIES.has(rawOperatorId.toLowerCase())
    ) {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException(
        'Identidad de operador inválida o no permitida: especifique un operatorId nominal válido.',
      );
    }

    const allowedScopeSet = new Set<string>(DEFAULT_OPERATOR_SCOPES);
    const requestedScopes = Array.isArray(credentials.scopes)
      ? credentials.scopes.filter(
          (s): s is string => typeof s === 'string' && allowedScopeSet.has(s),
        )
      : [...DEFAULT_OPERATOR_SCOPES];

    if (requestedScopes.length === 0) {
      this.recordFailedLogin(ipKey, opIpKey);
      throw new UnauthorizedException(
        'Ninguno de los scopes solicitados está autorizado para el operador.',
      );
    }

    // Login exitoso: limpiar fallos acumulados del par operador+IP
    this.resetFailuresOnSuccess(ipKey, opIpKey);

    const expiresIn =
      this.cfg?.get<string>('JWT_EXPIRES_IN') ??
      process.env.JWT_EXPIRES_IN ??
      '12h';
    const jti = crypto.randomUUID();

    const payload = {
      sub: rawOperatorId,
      role: 'operator' as const,
      scopes: requestedScopes,
      jti,
    };

    const token = this.jwt.sign(payload, {
      secret: this.jwtSecret,
      algorithm: JARBEES_JWT_ALGORITHM,
      issuer: JARBEES_JWT_ISSUER,
      audience: JARBEES_JWT_AUDIENCE,
      expiresIn: expiresIn as any,
    });

    return {
      access_token: token,
      expires_in: expiresIn,
      operatorId: rawOperatorId,
      role: payload.role,
      scopes: requestedScopes,
      issuer: JARBEES_JWT_ISSUER,
      audience: JARBEES_JWT_AUDIENCE,
    };
  }

  /**
   * Verifica la integridad semántica de los claims del JWT.
   * Rechaza tokens sin expiración, sin iss/aud válidos, con roles legacy hardcodeados
   * ('owner' / 'jarbees-owner') o sin scopes/jti válidos.
   */
  verifyPayload(payload: any): VerifiedOperatorIdentity | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (
      !sub ||
      !VALID_OPERATOR_ID_REGEX.test(sub) ||
      PROHIBITED_HARDCODED_IDENTITIES.has(sub.toLowerCase())
    ) {
      return null;
    }

    if (payload.role !== 'operator' && payload.role !== 'admin') {
      return null;
    }

    if (
      !Array.isArray(payload.scopes) ||
      payload.scopes.length === 0 ||
      !payload.scopes.every(
        (s: unknown) => typeof s === 'string' && s.trim().length > 0,
      )
    ) {
      return null;
    }

    if (typeof payload.jti !== 'string' || payload.jti.trim().length < 8) {
      return null;
    }

    if (payload.iss !== JARBEES_JWT_ISSUER) {
      return null;
    }

    const audClaim = payload.aud;
    const validAudience = Array.isArray(audClaim)
      ? audClaim.includes(JARBEES_JWT_AUDIENCE)
      : audClaim === JARBEES_JWT_AUDIENCE;
    if (!validAudience) {
      return null;
    }

    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      return null;
    }

    return {
      userId: sub,
      role: payload.role,
      scopes: payload.scopes,
      jti: payload.jti,
      iss: payload.iss,
      aud: JARBEES_JWT_AUDIENCE,
    };
  }

  /**
   * Limpia los contadores de fuerza bruta (útil para aislamiento en tests).
   */
  clearRateLimitState(): void {
    this.bruteForceBuckets.clear();
    this.corruptedLockoutKeys.clear();
    try {
      if (fs.existsSync(this.lockoutDir)) {
        const files = fs.readdirSync(this.lockoutDir);
        for (const file of files) {
          if (file.endsWith('.json') || file.includes('.tmp')) {
            try {
              fs.unlinkSync(path.join(this.lockoutDir, file));
            } catch {}
          }
        }
      }
    } catch {}
  }

  private resolveTargetOperatorScryptHash(): string | null {
    const explicitHash = (
      this.cfg?.get<string>('MASTER_PASSWORD_HASH') ??
      process.env.MASTER_PASSWORD_HASH ??
      this.cfg?.get<string>('JARBEES_OPERATOR_PASSWORD_HASH') ??
      process.env.JARBEES_OPERATOR_PASSWORD_HASH ??
      ''
    ).trim();

    if (explicitHash) {
      return explicitHash.startsWith('scrypt$') ? explicitHash : null;
    }

    const requireHashOnly =
      (this.cfg?.get<string>('REQUIRE_PASSWORD_HASH') ??
        process.env.REQUIRE_PASSWORD_HASH) === 'true';
    if (requireHashOnly) {
      return null;
    }

    const legacyPlainOrHash = (
      this.cfg?.get<string>('MASTER_PASSWORD') ??
      process.env.MASTER_PASSWORD ??
      this.cfg?.get<string>('JARBEES_OPERATOR_PASSWORD') ??
      process.env.JARBEES_OPERATOR_PASSWORD ??
      ''
    ).trim();

    if (!legacyPlainOrHash) {
      return null;
    }

    if (legacyPlainOrHash.startsWith('scrypt$')) {
      return legacyPlainOrHash;
    }

    if (
      legacyPlainOrHash.length < 8 ||
      PROHIBITED_DEFAULT_SECRETS.has(legacyPlainOrHash.toLowerCase())
    ) {
      return null;
    }

    // Derivar una sola vez por contraseña configurada un registro scrypt con sal aleatoria en memoria
    const cacheKey = crypto
      .createHash('sha256')
      .update(legacyPlainOrHash, 'utf8')
      .digest('hex');

    let derived = this.derivedLegacyScryptCache.get(cacheKey);
    if (!derived) {
      derived = hashOperatorPasswordScrypt(legacyPlainOrHash);
      this.derivedLegacyScryptCache.set(cacheKey, derived);
      if (!this.legacyPlaintextWarned) {
        this.legacyPlaintextWarned = true;
        this.logger.warn(
          '[AuthService] MASTER_PASSWORD detectada en formato plano. Se derivó hash scrypt con sal aleatoria en memoria. Configure MASTER_PASSWORD_HASH=scrypt$... para eliminar la contraseña plana del entorno.',
        );
      }
    }

    return derived;
  }

  private enforceRateLimitAndLockout(key: string): void {
    const now = Date.now();
    let bucket = this.bruteForceBuckets.get(key);

    if (!bucket) {
      bucket = {
        attemptsInWindow: 0,
        windowStartedAt: now,
        consecutiveFailures: 0,
        lockedUntil: 0,
      };
      this.bruteForceBuckets.set(key, bucket);
    }

    // Sincronizar con el estado persistido en disco para entornos multi-worker (DEV-001-B1.3: F-B1-02-02)
    bucket = this.syncBucketFromDisk(key, bucket, now);

    if (bucket.lockedUntil > now) {
      const remainingSec = Math.ceil((bucket.lockedUntil - now) / 1000);
      throw new HttpException(
        `SecurityKernel: cuenta o IP bloqueada temporalmente por múltiples intentos fallidos. Reintente en ${remainingSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (now - bucket.windowStartedAt >= LOGIN_WINDOW_MS) {
      bucket.attemptsInWindow = 0;
      bucket.windowStartedAt = now;
    }

    bucket.attemptsInWindow += 1;
    if (bucket.attemptsInWindow > MAX_LOGIN_ATTEMPTS_PER_MINUTE) {
      bucket.lockedUntil = now + LOGIN_WINDOW_MS;
      this.persistLockoutBucket(key, bucket);
      throw new HttpException(
        'SecurityKernel: límite de intentos de inicio de sesión excedido (máximo 5 intentos por minuto).',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.persistLockoutBucket(key, bucket);
  }

  private recordFailedLogin(...keys: string[]): void {
    const now = Date.now();
    let maxLockedUntil = 0;
    for (const key of keys) {
      let bucket = this.bruteForceBuckets.get(key) ?? {
        attemptsInWindow: 1,
        windowStartedAt: now,
        consecutiveFailures: 0,
        lockedUntil: 0,
      };

      // F-B1-02-02: Sincronizar desde disco antes de registrar el fallo para evitar Lost Updates
      bucket = this.syncBucketFromDisk(key, bucket, now);

      bucket.consecutiveFailures += 1;

      if (bucket.consecutiveFailures >= 10) {
        bucket.lockedUntil = now + 15 * 60 * 1000; // 15 min
      } else if (bucket.consecutiveFailures >= 8) {
        bucket.lockedUntil = now + 5 * 60 * 1000; // 5 min
      } else if (bucket.consecutiveFailures >= MAX_LOGIN_ATTEMPTS_PER_MINUTE) {
        bucket.lockedUntil = now + 60 * 1000; // 1 min
      }

      if (bucket.lockedUntil > maxLockedUntil) {
        maxLockedUntil = bucket.lockedUntil;
      }

      this.bruteForceBuckets.set(key, bucket);
      this.persistLockoutBucket(key, bucket);
    }

    if (maxLockedUntil > now) {
      const remainingSec = Math.ceil((maxLockedUntil - now) / 1000);
      throw new HttpException(
        `SecurityKernel: cuenta o IP bloqueada temporalmente por múltiples intentos fallidos. Reintente en ${remainingSec}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private resetFailuresOnSuccess(...keys: string[]): void {
    for (const key of keys) {
      const bucket = this.bruteForceBuckets.get(key);
      if (bucket) {
        bucket.consecutiveFailures = 0;
        bucket.lockedUntil = 0;
        this.deletePersistedLockoutBucket(key);
      }
    }
  }
}
