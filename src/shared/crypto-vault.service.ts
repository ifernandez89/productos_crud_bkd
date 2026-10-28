import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * CryptoVaultService — Servicio de cifrado simétrico en reposo (AES-256-GCM).
 *
 * Utilizado para proteger credenciales sensibles (tokens OAuth2, refresh tokens, secrets)
 * en la base de datos PostgreSQL, garantizando confidencialidad y autenticación del payload.
 */
@Injectable()
export class CryptoVaultService {
  private readonly logger = new Logger(CryptoVaultService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly prefix = 'enc:v1:';
  private readonly key: Buffer;

  constructor() {
    const rawSecret =
      process.env.CREDENTIALS_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      'jarbees-default-fallback-crypto-key-2026';

    // Derivación determinista de 32 bytes (256 bits) usando SHA-256 + salt de dominio
    this.key = crypto
      .createHash('sha256')
      .update(`${rawSecret}:jarbees_vault_salt_v1`)
      .digest();
  }

  /**
   * Cifra un string de texto plano usando AES-256-GCM.
   * Retorna formato seguro: "enc:v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>"
   */
  encrypt(plainText: string | null | undefined): string {
    if (!plainText || typeof plainText !== 'string') {
      return plainText as any;
    }

    // Si ya está cifrado con nuestro prefijo, no re-cifrar
    if (this.isEncrypted(plainText)) {
      return plainText;
    }

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
   * Si el payload es texto plano legacy (sin prefijo), lo retorna tal cual para retrocompatibilidad.
   */
  decrypt(payload: string | null | undefined): string {
    if (!payload || typeof payload !== 'string') {
      return payload as any;
    }

    if (!this.isEncrypted(payload)) {
      // Retrocompatibilidad con datos legacy guardados antes del cifrado
      return payload;
    }

    try {
      const parts = payload.slice(this.prefix.length).split(':');
      if (parts.length !== 3) {
        throw new Error('Formato de payload cifrado inválido.');
      }

      const [ivHex, authTagHex, ciphertextHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (err: any) {
      this.logger.error(`Error al descifrar secreto: ${err.message}`);
      throw new Error('Fallo de integridad criptográfica al descifrar credencial.');
    }
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
