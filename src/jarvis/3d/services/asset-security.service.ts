import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 🛡️ JarBees 3D Asset Security Service
 *
 * Módulo de empaquetado, cifrado y descifrado de contenedores protegidos .jb3d
 * Compatible al 100% con la implementación de Web Crypto API en Jarbees_the_game.
 *
 * Estructura de cabecera binaria (.jb3d v1):
 * [0..3]   : Magic bytes 'JB3D' (0x4A, 0x42, 0x33, 0x44)
 * [4]      : Versión (1)
 * [5]      : Flags (0 = Estándar)
 * [6..21]  : IV (16 bytes pseudoaleatorios criptográficos para AES-CTR)
 * [22..29] : Reservado (8 bytes en cero)
 * [30..N]  : Payload cifrado (AES-256-CTR)
 */

export const VAULT_SALT = 'Jarbees:TheGame:ProtectedAsset:2026';
export const VAULT_SECRET = 'JarbeesFlightSim_BeeMesh_SecureSignature_v1';

export interface Jb3dValidationResult {
  valid: boolean;
  version?: number;
  totalSize: number;
  payloadSize?: number;
  isGlb?: boolean;
  isJb3d?: boolean;
  error?: string;
}

export interface PackResult {
  status: 'success' | 'error';
  sourcePath: string;
  targetPath: string;
  sourceSizeBytes: number;
  targetSizeBytes: number;
  compressionRatio: number;
  durationMs: number;
  message?: string;
}

@Injectable()
export class AssetSecurityService {
  private readonly logger = new Logger(AssetSecurityService.name);
  private cachedKey: Buffer | null = null;

  /**
   * Obtiene o deriva la clave AES de 256 bits mediante SHA-256
   */
  getDerivedKey(): Buffer {
    if (!this.cachedKey) {
      this.cachedKey = crypto
        .createHash('sha256')
        .update(VAULT_SECRET + VAULT_SALT)
        .digest();
    }
    return this.cachedKey;
  }

  /**
   * Comprueba si el buffer contiene la firma de contenedor JB3D
   */
  isJb3dContainer(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) return false;
    return (
      buffer[0] === 0x4a && // 'J'
      buffer[1] === 0x42 && // 'B'
      buffer[2] === 0x33 && // '3'
      buffer[3] === 0x44    // 'D'
    );
  }

  /**
   * Comprueba si el buffer corresponde a un GLB binario sin cifrar ('glTF')
   */
  isGlb(buffer: Buffer): boolean {
    if (!buffer || buffer.length < 4) return false;
    return (
      buffer[0] === 0x67 && // 'g'
      buffer[1] === 0x6c && // 'l'
      buffer[2] === 0x54 && // 'T'
      buffer[3] === 0x46    // 'F'
    );
  }

  /**
   * Valida la estructura y cabecera de un contenedor binario 3D
   */
  validateBuffer(buffer: Buffer): Jb3dValidationResult {
    if (!buffer || buffer.length === 0) {
      return { valid: false, totalSize: 0, error: 'Buffer vacío o no proporcionado' };
    }

    if (this.isGlb(buffer)) {
      return {
        valid: true,
        isGlb: true,
        isJb3d: false,
        totalSize: buffer.length,
        payloadSize: buffer.length,
      };
    }

    if (!this.isJb3dContainer(buffer)) {
      return {
        valid: false,
        isGlb: false,
        isJb3d: false,
        totalSize: buffer.length,
        error: 'Firma de archivo 3D inválida. No es un contenedor .jb3d ni un modelo .glb',
      };
    }

    if (buffer.length < 30) {
      return {
        valid: false,
        isGlb: false,
        isJb3d: true,
        totalSize: buffer.length,
        error: 'Contenedor JB3D corrupto: menor a la cabecera mínima requerida (30 bytes)',
      };
    }

    const version = buffer[4];
    if (version !== 1) {
      return {
        valid: false,
        isGlb: false,
        isJb3d: true,
        version,
        totalSize: buffer.length,
        error: `Versión de contenedor JB3D incompatible: ${version}`,
      };
    }

    return {
      valid: true,
      isGlb: false,
      isJb3d: true,
      version: 1,
      totalSize: buffer.length,
      payloadSize: buffer.length - 30,
    };
  }

  /**
   * Cifra un buffer GLB y genera un contenedor protegido .jb3d
   */
  encryptGlbToJb3d(glbBuffer: Buffer): Buffer {
    if (!glbBuffer || glbBuffer.length === 0) {
      throw new Error('El buffer GLB de entrada está vacío');
    }

    const key = this.getDerivedKey();
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv('aes-256-ctr', key, iv);
    const encryptedPayload = Buffer.concat([cipher.update(glbBuffer), cipher.final()]);

    const header = Buffer.alloc(30);
    header.write('JB3D', 0, 4, 'ascii');
    header.writeUInt8(1, 4); // Versión 1
    header.writeUInt8(0, 5); // Flags
    iv.copy(header, 6, 0, 16); // IV 16 bytes
    header.fill(0, 22, 30); // 8 bytes reservados

    return Buffer.concat([header, encryptedPayload]);
  }

  /**
   * Descifra un contenedor .jb3d a su GLB original
   */
  decryptJb3dToGlb(jb3dBuffer: Buffer): Buffer {
    const validation = this.validateBuffer(jb3dBuffer);
    if (!validation.valid) {
      throw new Error(validation.error || 'Contenedor .jb3d inválido');
    }

    // Si ya es un GLB sin cifrar, devolver intacto
    if (validation.isGlb) {
      return jb3dBuffer;
    }

    const iv = jb3dBuffer.subarray(6, 22);
    const ciphertext = jb3dBuffer.subarray(30);
    const key = this.getDerivedKey();

    const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Empaqueta y cifra un archivo GLB del disco en un archivo .jb3d
   */
  async packFile(sourceGlbPath: string, targetJb3dPath: string): Promise<PackResult> {
    const startTime = Date.now();
    const absSource = path.resolve(sourceGlbPath);
    const absTarget = path.resolve(targetJb3dPath);

    if (!fs.existsSync(absSource)) {
      throw new Error(`Archivo fuente no encontrado: ${absSource}`);
    }

    const sourceBuffer = await fs.promises.readFile(absSource);
    const encryptedBuffer = this.encryptGlbToJb3d(sourceBuffer);

    await fs.promises.mkdir(path.dirname(absTarget), { recursive: true });
    await fs.promises.writeFile(absTarget, encryptedBuffer);

    const durationMs = Date.now() - startTime;
    const ratio = Number((encryptedBuffer.length / sourceBuffer.length).toFixed(4));

    this.logger.log(
      `[AssetSecurity] Empaquetado exitoso: ${path.basename(absSource)} → ${path.basename(absTarget)} ` +
      `(${encryptedBuffer.length} bytes, ratio: ${ratio}) en ${durationMs}ms`
    );

    return {
      status: 'success',
      sourcePath: absSource,
      targetPath: absTarget,
      sourceSizeBytes: sourceBuffer.length,
      targetSizeBytes: encryptedBuffer.length,
      compressionRatio: ratio,
      durationMs,
    };
  }

  /**
   * Desempaqueta y descifra un archivo .jb3d del disco a un archivo GLB
   */
  async unpackFile(sourceJb3dPath: string, targetGlbPath: string): Promise<PackResult> {
    const startTime = Date.now();
    const absSource = path.resolve(sourceJb3dPath);
    const absTarget = path.resolve(targetGlbPath);

    if (!fs.existsSync(absSource)) {
      throw new Error(`Archivo .jb3d no encontrado: ${absSource}`);
    }

    const sourceBuffer = await fs.promises.readFile(absSource);
    const decryptedGlb = this.decryptJb3dToGlb(sourceBuffer);

    await fs.promises.mkdir(path.dirname(absTarget), { recursive: true });
    await fs.promises.writeFile(absTarget, decryptedGlb);

    const durationMs = Date.now() - startTime;
    const ratio = Number((decryptedGlb.length / sourceBuffer.length).toFixed(4));

    return {
      status: 'success',
      sourcePath: absSource,
      targetPath: absTarget,
      sourceSizeBytes: sourceBuffer.length,
      targetSizeBytes: decryptedGlb.length,
      compressionRatio: ratio,
      durationMs,
    };
  }
}
