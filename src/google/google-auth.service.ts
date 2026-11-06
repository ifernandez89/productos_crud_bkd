import {
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoVaultService } from '../shared/crypto-vault.service';
import { validateCryptoSecret } from '../auth/jwt-secret.util';

export interface BackendGoogleCredentialsDto {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number | bigint;
  scope?: string;
}

interface PendingOAuthStateRecord {
  nonce: string;
  actorId: string;
  issuedAt: number;
  expiresAt: number;
  consumed: boolean;
}

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauth2Client;
  private readonly oauthStateTtlMs = 10 * 60 * 1000; // 10 minutos
  private readonly pendingOAuthStates = new Map<string, PendingOAuthStateRecord>();
  private readonly stateSigningKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoVault: CryptoVaultService,
  ) {
    const rawStateSecret = validateCryptoSecret(
      process.env.CREDENTIALS_ENCRYPTION_KEY,
      'CREDENTIALS_ENCRYPTION_KEY',
    );
    this.stateSigningKey = crypto
      .createHash('sha256')
      .update(`${rawStateSecret}:jarbees_google_oauth_state_v1`)
      .digest();

    const clientId = process.env.GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';
    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET || 'PENDING_CLIENT_SECRET';
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:4000/api/jarbees/google/callback';

    this.oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri,
    );
  }

  /**
   * Genera un token state OAuth2 aleatorio, firmado con HMAC-SHA256, asociado al actor iniciador,
   * de un solo uso y con vencimiento de 10 minutos (DEV-001-B1.1: F-B1-10).
   */
  createOAuthState(actorId = 'operator'): string {
    const now = Date.now();
    this.pruneExpiredOAuthStates(now);

    const safeActorId = (actorId || 'operator').trim() || 'operator';
    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = now + this.oauthStateTtlMs;

    this.pendingOAuthStates.set(nonce, {
      nonce,
      actorId: safeActorId,
      issuedAt: now,
      expiresAt,
      consumed: false,
    });

    const payloadJson = JSON.stringify({
      nonce,
      actorId: safeActorId,
      iat: now,
      exp: expiresAt,
    });
    const payloadB64 = Buffer.from(payloadJson, 'utf8').toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.stateSigningKey)
      .update(payloadB64)
      .digest('hex');

    return `${payloadB64}.${signature}`;
  }

  /**
   * Verifica criptográficamente y consume de forma atómica (single-use) el state OAuth2.
   */
  verifyAndConsumeOAuthState(stateToken?: string): {
    actorId: string;
    nonce: string;
  } {
    if (!stateToken || typeof stateToken !== 'string') {
      throw new ForbiddenException(
        'OAuthCallback denegado: falta el parámetro "state" firmado de la sesión iniciadora.',
      );
    }

    const parts = stateToken.trim().split('.');
    if (parts.length !== 2) {
      throw new ForbiddenException(
        'OAuthCallback denegado: formato de parámetro "state" inválido.',
      );
    }

    const [payloadB64, providedSigHex] = parts;
    const expectedSigHex = crypto
      .createHmac('sha256', this.stateSigningKey)
      .update(payloadB64)
      .digest('hex');

    const providedBuf = Buffer.from(providedSigHex, 'utf8');
    const expectedBuf = Buffer.from(expectedSigHex, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      throw new ForbiddenException(
        'OAuthCallback denegado: firma criptográfica de "state" inválida.',
      );
    }

    let parsed: { nonce?: string; actorId?: string; exp?: number };
    try {
      parsed = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      );
    } catch {
      throw new ForbiddenException(
        'OAuthCallback denegado: payload de "state" corrupto.',
      );
    }

    const now = Date.now();
    this.pruneExpiredOAuthStates(now);

    if (!parsed?.nonce || !parsed?.exp || now > parsed.exp) {
      throw new ForbiddenException(
        'OAuthCallback denegado: el parámetro "state" ha expirado.',
      );
    }

    const record = this.pendingOAuthStates.get(parsed.nonce);
    if (!record) {
      throw new ForbiddenException(
        'OAuthCallback denegado: "state" desconocido, expirado o no emitido por esta instancia.',
      );
    }

    if (record.consumed) {
      throw new ForbiddenException(
        'OAuthCallback denegado: Replay detectado. El parámetro "state" ya fue utilizado.',
      );
    }

    if (now > record.expiresAt) {
      this.pendingOAuthStates.delete(parsed.nonce);
      throw new ForbiddenException(
        'OAuthCallback denegado: el parámetro "state" ha expirado.',
      );
    }

    // Consumo atómico (single-use)
    record.consumed = true;
    this.pendingOAuthStates.delete(parsed.nonce);

    return {
      actorId: record.actorId,
      nonce: record.nonce,
    };
  }

  private pruneExpiredOAuthStates(now: number): void {
    for (const [nonce, rec] of this.pendingOAuthStates.entries()) {
      if (rec.consumed || now > rec.expiresAt) {
        this.pendingOAuthStates.delete(nonce);
      }
    }
  }

  /**
   * Inicialización del módulo:
   * Si existen credenciales configuradas en las variables de entorno del backend (.env),
   * las sincroniza, cifra y persiste automáticamente para evitar requerir el flujo UI/Frontend.
   */
  async onModuleInit() {
    const envRefreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
    if (envRefreshToken) {
      try {
        await this.configureBackendCredentials({
          refreshToken: envRefreshToken,
          accessToken: process.env.GOOGLE_ACCESS_TOKEN?.trim(),
          scope: process.env.GOOGLE_SCOPES?.trim(),
        });
        this.logger.log(
          '🔐 [Google Auth] Credenciales detectadas en .env y sincronizadas cifradas en BD (Zero-UI mode activo).',
        );
      } catch (err: any) {
        this.logger.warn(
          `[Google Auth] No se pudo auto-inicializar credenciales desde .env: ${err.message}`,
        );
      }
    }
  }

  /**
   * Configura credenciales directamente desde el backend (sin interacción con UI/front).
   * Cifra en reposo con AES-256-GCM.
   */
  async configureBackendCredentials(dto: BackendGoogleCredentialsDto): Promise<void> {
    if (!dto.refreshToken) {
      throw new Error('Se requiere al menos un refreshToken válido para configurar Google Auth.');
    }

    // Obtener o crear perfil por defecto
    let userProfile = await this.prisma.userProfile.findFirst();
    if (!userProfile) {
      userProfile = await this.prisma.userProfile.create({
        data: {
          name: 'Ignacio',
          timezone: 'America/Argentina/Buenos_Aires',
          country: 'Argentina',
          language: 'es-AR',
        },
      });
      this.logger.log(`[Google Auth] UserProfile por defecto creado (ID: ${userProfile.id}).`);
    }

    const encryptedAccessToken = this.cryptoVault.encrypt(
      dto.accessToken || 'initial-placeholder-token',
    );
    const encryptedRefreshToken = this.cryptoVault.encrypt(dto.refreshToken);

    await this.prisma.userCredential.upsert({
      where: {
        userProfileId_provider: {
          userProfileId: userProfile.id,
          provider: 'google',
        },
      },
      create: {
        userProfileId: userProfile.id,
        provider: 'google',
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiryDate: dto.expiryDate ? BigInt(dto.expiryDate.toString()) : BigInt(Date.now()),
        scope: dto.scope || 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/tasks',
      },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiryDate: dto.expiryDate ? BigInt(dto.expiryDate.toString()) : undefined,
        scope: dto.scope || undefined,
      },
    });

    this.logger.log(
      `[Google Auth] Credenciales guardadas y cifradas exitosamente en la BD para el usuario ${userProfile.id}`,
    );
  }

  /**
   * Genera la URL para que el usuario inicie sesión y otorgue permisos, incluyendo state firmado de un solo uso.
   */
  getAuthUrl(actorId = 'operator'): string {
    const scopes = [
      // Calendar
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      // Tasks
      'https://www.googleapis.com/auth/tasks.readonly',
      'https://www.googleapis.com/auth/tasks',
      // Gmail
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      // Drive
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      // Perfil básico
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const state = this.createOAuthState(actorId);

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Fuerza siempre a dar un refresh token
      scope: scopes,
      state,
    });
  }

  /**
   * Recibe el code y el state firmado del callback, verifica el state single-use y solicita los tokens a Google.
   * Cifra los tokens antes de guardarlos en PostgreSQL.
   */
  async handleCallback(code: string, state?: string): Promise<void> {
    this.verifyAndConsumeOAuthState(state);

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      const userProfile = await this.prisma.userProfile.findFirst();
      if (!userProfile) {
        throw new Error('No se encontró UserProfile por defecto.');
      }

      // Cifrar tokens en reposo
      const encryptedAccessToken = this.cryptoVault.encrypt(tokens.access_token!);
      const encryptedRefreshToken = tokens.refresh_token
        ? this.cryptoVault.encrypt(tokens.refresh_token)
        : null;

      // Guardar o actualizar en BD
      await this.prisma.userCredential.upsert({
        where: {
          userProfileId_provider: {
            userProfileId: userProfile.id,
            provider: 'google',
          },
        },
        create: {
          userProfileId: userProfile.id,
          provider: 'google',
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : null,
          scope: tokens.scope,
        },
        update: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken || undefined,
          expiryDate: tokens.expiry_date ? BigInt(tokens.expiry_date) : undefined,
          scope: tokens.scope,
        },
      });

      this.logger.log(
        `[Google Auth] Tokens cifrados con AES-256-GCM y almacenados para el usuario ${userProfile.id}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Error manejando el callback de Google: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Recupera el cliente configurado, descifrando credenciales (con soporte de rotación atómica
   * desde CREDENTIALS_ENCRYPTION_KEY_PREVIOUS hacia CREDENTIALS_ENCRYPTION_KEY) y refrescando tokens si es necesario.
   */
  async getAuthenticatedClient() {
    const userProfile = await this.prisma.userProfile.findFirst();
    if (!userProfile) return null;

    const creds = await this.prisma.userCredential.findUnique({
      where: {
        userProfileId_provider: {
          userProfileId: userProfile.id,
          provider: 'google',
        },
      },
    });

    if (!creds) return null;

    // Descifrado seguro de tokens desde la BD con detección de rotación de clave
    const accessRotation = this.cryptoVault.decryptWithRotation(creds.accessToken);
    const refreshRotation = creds.refreshToken
      ? this.cryptoVault.decryptWithRotation(creds.refreshToken)
      : undefined;

    const decryptedAccessToken = accessRotation.plainText;
    const decryptedRefreshToken = refreshRotation?.plainText;

    // Si algún token fue descifrado con CREDENTIALS_ENCRYPTION_KEY_PREVIOUS (o legacy plaintext),
    // re-cifrarlo atómicamente con la clave primaria sin poner en riesgo la credencial existente.
    if (
      (accessRotation.needsReencryption && accessRotation.reencryptedValue) ||
      (refreshRotation?.needsReencryption && refreshRotation?.reencryptedValue)
    ) {
      try {
        const nextAccessToken =
          accessRotation.needsReencryption && accessRotation.reencryptedValue
            ? accessRotation.reencryptedValue
            : creds.accessToken;
        const nextRefreshToken =
          refreshRotation?.needsReencryption && refreshRotation?.reencryptedValue
            ? refreshRotation.reencryptedValue
            : creds.refreshToken;

        // Verificación previa al commit: asegurar que el nuevo ciphertext es descifrable por la clave primaria
        if (this.cryptoVault.decrypt(nextAccessToken) !== decryptedAccessToken) {
          throw new Error('Verificación post-cifrado de accessToken falló.');
        }
        if (
          nextRefreshToken &&
          decryptedRefreshToken &&
          this.cryptoVault.decrypt(nextRefreshToken) !== decryptedRefreshToken
        ) {
          throw new Error('Verificación post-cifrado de refreshToken falló.');
        }

        if (typeof this.prisma.userCredential.update === 'function') {
          await this.prisma.userCredential.update({
            where: { id: creds.id },
            data: {
              accessToken: nextAccessToken,
              refreshToken: nextRefreshToken,
            },
          });
          this.logger.log(
            `[Google Auth] Credencial #${creds.id} rotada atómicamente hacia la clave primaria CREDENTIALS_ENCRYPTION_KEY.`,
          );
        }
      } catch (rotationErr: any) {
        this.logger.warn(
          `[Google Auth] Error no destructivo al rotar credencial #${creds.id} (se conserva el registro válido original): ${rotationErr.message}`,
        );
      }
    }

    this.oauth2Client.setCredentials({
      access_token: decryptedAccessToken,
      refresh_token: decryptedRefreshToken,
      expiry_date: creds.expiryDate ? Number(creds.expiryDate) : undefined,
    });

    // Validar y refrescar token si está expirado o expira en menos de 5 min
    const isExpired =
      creds.expiryDate && Date.now() + 5 * 60 * 1000 > Number(creds.expiryDate);

    if (isExpired && decryptedRefreshToken) {
      this.logger.log(`[Google Auth] Access token expirado, refrescando en segundo plano...`);
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();

        // Cifrar el nuevo access token antes de persistir
        const encryptedNewAccessToken = this.cryptoVault.encrypt(
          credentials.access_token!,
        );

        await this.prisma.userCredential.update({
          where: { id: creds.id },
          data: {
            accessToken: encryptedNewAccessToken,
            expiryDate: credentials.expiry_date ? BigInt(credentials.expiry_date) : undefined,
          },
        });

        this.logger.log(`[Google Auth] Access token refrescado y cifrado exitosamente.`);
      } catch (err: any) {
        this.logger.error(
          `[Google Auth] Error al refrescar token: ${err.message}`,
        );
        return null;
      }
    }

    return this.oauth2Client;
  }
}
