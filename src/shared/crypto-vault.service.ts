import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { validateCryptoSecret } from '../auth/jwt-secret.util';

export interface VaultDecryptionResult {
  plainText: string;
  needsReencryption: boolean;
  reencryptedValue?: string;
  usedKey: 'primary' | 'previous' | 'legacy_plaintext';
}

/**
 * CryptoVaultService — Servicio de cifrado simétrico en reposo (AES-256-GCM).
 *
 * Utilizado para proteger credenciales sensibles (tokens OAuth2, refresh tokens, secrets)
 * en la base de datos PostgreSQL, garantizando confidencialidad y autenticación del payload.
 *
 * Endurecido en DEV-001-B1.1:
 * - Exige CREDENTIALS_ENCRYPTION_KEY dedicada al iniciar (fail-closed).
 * - Elimina fallbacks a JWT_SECRET y a 'jarbees-default-fallback-crypto-key-2026'.
 * - Soporta CREDENTIALS_ENCRYPTION_KEY_PREVIOUS exclusivamente para lectura/descifrado
 *   durante rotación controlada y re-cifrado atómico hacia la clave primaria.
 */
@Injectable()
export class CryptoVaultService {
  private readonly logger = new Logger(CryptoVaultService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly prefix = 'enc:v1:';
  private readonly key: Buffer;
  private readonly previousKey: Buffer | null;

  constructor(
    @Optional()
    options?: {
      primarySecret?: string;
      previousSecret?: string;
    },
  ) {
    const rawPrimary = validateCryptoSecret(
      options?.primarySecret ?? process.env.CREDENTIALS_ENCRYPTION_KEY,
      'CREDENTIALS_ENCRYPTION_KEY',
    );

    // Derivación determinista de 32 bytes (256 bits) usando SHA-256 + salt de dominio
    this.key = this.deriveVaultKey(rawPrimary);

    const rawPrevious = (
      options?.previousSecret ??
      process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS ??
      ''
    ).trim();

    if (rawPrevious.length > 0 && rawPrevious !== rawPrimary) {
      this.previousKey = this.deriveVaultKey(rawPrevious);
    } else {
      this.previousKey = null;
    }
  }

  private deriveVaultKey(secret: string): Buffer {
    return crypto
      .createHash('sha256')
      .update(`${secret}:jarbees_vault_salt_v1`)
      .digest();
  }

  /**
   * Cifra un string de texto plano usando AES-256-GCM siempre con la clave primaria.
   * Retorna formato seguro: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   */
  encrypt(plainText: string | null | undefined): string {
    if (!plainText || typeof plainText !== 'string') {
      return plainText as any;
    }

    // Si ya está cifrado con nuestro prefijo, verificar si ya usa la clave primaria
    if (this.isEncrypted(plainText)) {
      return plainText;
    }

    return this.encryptWithPrimaryKey(plainText);
  }

  private encryptWithPrimaryKey(plainText: string): string {
    // IV aleatorio de 12 bytes recomendado para GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plainText, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    const ivHex = iv.toString('hex');

    return `${this.prefix}${ivHex}:${authTag}:${ciphertext}`;
  }

  /**
   * Descifra un payload cifrado con encrypt().
   * Intenta primero con CREDENTIALS_ENCRYPTION_KEY (primaria) y, si falla la etiqueta GCM y
   * existe CREDENTIALS_ENCRYPTION_KEY_PREVIOUS configurada, intenta descifrar en modo solo-lectura.
   * Si el payload es texto plano legacy (sin prefijo), lo retorna tal cual para retrocompatibilidad.
   */
  decrypt(payload: string | null | undefined): string {
    if (!payload || typeof payload !== 'string') {
      return payload as any;
    }

    return this.decryptWithRotation(payload).plainText;
  }

  /**
   * Descifra un payload e informa si fue abierto con CREDENTIALS_ENCRYPTION_KEY_PREVIOUS
   * o en texto plano legacy, entregando el valor re-cifrado con la clave primaria para
   * persistencia atómica sin riesgo de pérdida de credenciales.
   */
  decryptWithRotation(payload: string): VaultDecryptionResult {
    if (!payload || typeof payload !== 'string') {
      return {
        plainText: payload as any,
        needsReencryption: false,
        usedKey: 'primary',
      };
    }

    if (!this.isEncrypted(payload)) {
      return {
        plainText: payload,
        needsReencryption: true,
        reencryptedValue: this.encryptWithPrimaryKey(payload),
        usedKey: 'legacy_plaintext',
      };
    }

    const parts = payload.slice(this.prefix.length).split(':');
    if (parts.length !== 3) {
      this.logger.error('Formato de payload cifrado inválido.');
      throw new Error('Fallo de integridad criptográfica al descifrar credencial.');
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // 1. Intentar con clave primaria
    try {
      const plainText = this.decryptBuffer(this.key, iv, authTag, ciphertextHex);
      return {
        plainText,
        needsReencryption: false,
        usedKey: 'primary',
      };
    } catch (primaryErr: any) {
      // 2. Si existe clave previa configurada, intentar lectura con CREDENTIALS_ENCRYPTION_KEY_PREVIOUS
      if (this.previousKey) {
        try {
          const plainText = this.decryptBuffer(
            this.previousKey,
            iv,
            authTag,
            ciphertextHex,
          );
          const reencryptedValue = this.encryptWithPrimaryKey(plainText);
          return {
            plainText,
            needsReencryption: true,
            reencryptedValue,
            usedKey: 'previous',
          };
        } catch {
          // Si también falla con la clave previa, reportar fallo de integridad abajo
        }
      }

      this.logger.error(`Error al descifrar secreto: ${primaryErr.message}`);
      throw new Error('Fallo de integridad criptográfica al descifrar credencial.');
    }
  }

  private decryptBuffer(
    key: Buffer,
    iv: Buffer,
    authTag: Buffer,
    ciphertextHex: string,
  ): string {
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Comprueba si un string ya cuenta con el formato cifrado de la bóveda.
   */
  isEncrypted(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.startsWith(this.prefix);
  }

  /**
   * Enmascara un secreto para mostrar en logs de forma segura (ej. "ya29...4fA9")
   */
  maskSecret(secret: string | null | undefined): string {
    if (!secret || typeof secret !== 'string') return '[EMPTY]';
    if (secret.length <= 8) return '****';
    const first4 = secret.slice(0, 4);
    const last4 = secret.slice(-4);
    return `${first4}...${last4} (${secret.length} chars)`;
  }
}
