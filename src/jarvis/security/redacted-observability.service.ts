import { Injectable, Logger } from '@nestjs/common';
import { CryptoVaultService } from '../../shared/crypto-vault.service';

@Injectable()
export class RedactedObservabilityService {
  private readonly logger = new Logger(RedactedObservabilityService.name);

  // Expresiones regulares para detección y ofuscación de datos confidenciales
  private readonly REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
    // Google OAuth access tokens
    { pattern: /ya29\.[a-zA-Z0-9_\-\.]{20,}/g, replacement: '[REDACTED_GOOGLE_TOKEN]' },
    // JWT Tokens (header.payload.signature)
    {
      pattern: /ey[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      replacement: '[REDACTED_JWT]',
    },
    // API Keys comunes (OpenAI sk-..., OpenRouter, etc.)
    { pattern: /sk-[a-zA-Z0-9_\-]{20,}/g, replacement: '[REDACTED_API_KEY]' },
    // Bearer headers genéricos restantes
    { pattern: /Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, replacement: 'Bearer [REDACTED_AUTH]' },
    // Refresh tokens típicos (1//0...)
    { pattern: /1\/\/[a-zA-Z0-9_\-]{30,}/g, replacement: '[REDACTED_REFRESH_TOKEN]' },
    // Rutas locales de usuario en Windows (C:\Users\<user>\...)
    {
      pattern: /([A-Za-z]:[\\\/]Users[\\\/])[^\\\/]+([\\\/])/gi,
      replacement: '$1[USER_HOME]$2',
    },
    // Contraseñas o secretos en pares clave-valor (password=..., secret: "...")
    {
      pattern: /(["']?(?:password|secret|token|apiKey|api_key|client_secret)["']?\s*[:=]\s*["'])([^"'\s]{4,})(["'])/gi,
      replacement: '$1[REDACTED_SECRET]$3',
    },
  ];

  constructor(private readonly cryptoVault: CryptoVaultService) {}

  /**
   * Sanitiza y remueve cualquier secreto, token o ruta personal de un string.
   */
  redactText(text: string): string {
    if (!text || typeof text !== 'string') return text;

    let sanitized = text;
    for (const { pattern, replacement } of this.REDACTION_PATTERNS) {
      sanitized = sanitized.replace(pattern, replacement);
    }

    return sanitized;
  }

  /**
   * Sanitiza recursivamente un objeto o payload JSON para auditoría y observabilidad.
   */
  redactObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
      return typeof obj === 'string' ? (this.redactText(obj) as unknown as T) : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value);
      } else if (typeof value === 'string') {
        const lowerKey = key.toLowerCase();
        if (
          lowerKey.includes('password') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('token') ||
          lowerKey.includes('authorization') ||
          lowerKey.includes('apikey')
        ) {
          result[key] = this.cryptoVault.maskSecret(value);
        } else {
          result[key] = this.redactText(value);
        }
      } else {
        result[key] = value;
      }
    }


    return result as T;
  }
}
