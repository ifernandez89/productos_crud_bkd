import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Lista negra de secretos por defecto o débiles que quedan terminantemente prohibidos
 * en cualquier componente criptográfico de JarBees (DEV-001-B1 / B1.1: SEC-01 / SEC-03).
 */
export const PROHIBITED_DEFAULT_SECRETS = new Set<string>([
  'changeme-set-jwt_secret-in-env',
  'jarbees-hitl-gatekeeper-secret-key-2026',
  'jarbees-default-gatekeeper-secret-key-2026',
  'jarbees-default-fallback-crypto-key-2026',
  'jarbees-mobile-gateway-default-hmac-key-2026',
  'jarbeesflightsim_beemesh_securesignature_v1',
  'changeme',
  'secret',
  'jwt_secret',
  'default',
  'password',
  '123456',
  '12345678',
  'admin',
]);

export const MIN_CRYPTO_SECRET_LENGTH = 16;

export const JARBEES_JWT_ISSUER = 'jarbees-security-kernel';
export const JARBEES_JWT_AUDIENCE = 'jarbees-core-api';
export const JARBEES_JWT_ALGORITHM = 'HS256' as const;

export interface ScryptCostParameters {
  N?: number;
  r?: number;
  p?: number;
  saltHex?: string;
}

const DEFAULT_SCRYPT_N = 16384;
const DEFAULT_SCRYPT_R = 8;
const DEFAULT_SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Valida que un secreto criptográfico esté configurado, tenga longitud suficiente
 * y no coincida con ningún valor por defecto conocido.
 * Falla de forma segura (Fail-Closed) lanzando un error en el arranque.
 */
export function validateCryptoSecret(
  rawSecret: string | undefined | null,
  secretName = 'JWT_SECRET',
): string {
  if (!rawSecret || typeof rawSecret !== 'string') {
    throw new Error(
      `SECURITY_BOOT_ERROR: ${secretName} no está configurado. La aplicación no puede iniciar sin un secreto criptográfico válido.`,
    );
  }

  const trimmed = rawSecret.trim();
  if (trimmed.length < MIN_CRYPTO_SECRET_LENGTH) {
    throw new Error(
      `SECURITY_BOOT_ERROR: ${secretName} es demasiado corto (${trimmed.length} caracteres; mínimo requerido: ${MIN_CRYPTO_SECRET_LENGTH}).`,
    );
  }

  if (PROHIBITED_DEFAULT_SECRETS.has(trimmed.toLowerCase())) {
    throw new Error(
      `SECURITY_BOOT_ERROR: ${secretName} utiliza un valor por defecto inseguro ("${trimmed}"). Configure un secreto aleatorio fuerte.`,
    );
  }

  return trimmed;
}

/**
 * Resuelve y valida obligatoriamente JWT_SECRET desde ConfigService o process.env.
 */
export function resolveRequiredJwtSecret(cfg?: ConfigService): string {
  const candidate = cfg?.get<string>('JWT_SECRET') ?? process.env.JWT_SECRET;
  return validateCryptoSecret(candidate, 'JWT_SECRET');
}

/**
 * Genera un hash seguro de contraseña usando scrypt con sal criptográfica aleatoria de 16 bytes
 * y parámetros de costo configurables (formato: scrypt$N=16384,r=8,p=1$<saltHex>$<derivedHex>).
 */
export function hashOperatorPasswordScrypt(
  plainPassword: string,
  options?: ScryptCostParameters,
): string {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('La contraseña a hashear con scrypt no puede estar vacía.');
  }

  const envN = Number(process.env.SCRYPT_COST_N);
  const envR = Number(process.env.SCRYPT_BLOCK_SIZE_R);
  const envP = Number(process.env.SCRYPT_PARALLELIZATION_P);

  const N =
    options?.N ??
    (Number.isInteger(envN) && envN >= 1024 ? envN : DEFAULT_SCRYPT_N);
  const r =
    options?.r ??
    (Number.isInteger(envR) && envR >= 1 ? envR : DEFAULT_SCRYPT_R);
  const p =
    options?.p ??
    (Number.isInteger(envP) && envP >= 1 ? envP : DEFAULT_SCRYPT_P);

  const saltBuf = options?.saltHex
    ? Buffer.from(options.saltHex, 'hex')
    : crypto.randomBytes(16);

  if (saltBuf.length < 16) {
    throw new Error(
      'La sal criptográfica para scrypt debe tener al menos 16 bytes.',
    );
  }

  const derived = crypto.scryptSync(plainPassword, saltBuf, SCRYPT_KEYLEN, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });

  return `scrypt$N=${N},r=${r},p=${p}$${saltBuf.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifica una contraseña en texto plano contra un registro scrypt$N=...,r=...,p=...$<saltHex>$<hashHex>
 * en tiempo constante (crypto.timingSafeEqual).
 */
export function verifyOperatorPasswordScrypt(
  plainPassword: string,
  scryptRecord: string,
): boolean {
  if (
    !plainPassword ||
    typeof plainPassword !== 'string' ||
    !scryptRecord ||
    typeof scryptRecord !== 'string' ||
    !scryptRecord.startsWith('scrypt$')
  ) {
    return false;
  }

  const parts = scryptRecord.trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') {
    return false;
  }

  const paramsPart = parts[1];
  const saltHex = parts[2];
  const expectedHashHex = parts[3];

  const paramMatches = paramsPart.match(/^N=(\d+),r=(\d+),p=(\d+)$/);
  if (!paramMatches) {
    return false;
  }

  const N = parseInt(paramMatches[1], 10);
  const r = parseInt(paramMatches[2], 10);
  const p = parseInt(paramMatches[3], 10);

  if (
    !Number.isInteger(N) ||
    N < 1024 ||
    (N & (N - 1)) !== 0 ||
    !Number.isInteger(r) ||
    r < 1 ||
    !Number.isInteger(p) ||
    p < 1
  ) {
    return false;
  }

  try {
    const saltBuf = Buffer.from(saltHex, 'hex');
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    if (saltBuf.length < 16 || expectedBuf.length < 32) {
      return false;
    }

    const actualBuf = crypto.scryptSync(
      plainPassword,
      saltBuf,
      expectedBuf.length,
      {
        N,
        r,
        p,
        maxmem: SCRYPT_MAXMEM,
      },
    );

    if (actualBuf.length !== expectedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}
