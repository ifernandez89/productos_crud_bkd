import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';
import { CryptoVaultService } from '../shared/crypto-vault.service';

export interface BackendGoogleCredentialsDto {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number | bigint;
  scope?: string;
}

@Injectable()
export class GoogleAuthService implements OnModuleInit {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoVault: CryptoVaultService,
  ) {
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
   * Genera la URL para que el usuario inicie sesión y otorgue permisos (flujo opcional).
   */
  getAuthUrl(): string {
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

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Fuerza siempre a dar un refresh token
      scope: scopes,
    });
  }

  /**
   * Recibe el code del callback y solicita los tokens a Google.
   * Cifra los tokens antes de guardarlos en PostgreSQL.
   */
  async handleCallback(code: string): Promise<void> {
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
   * Recupera el cliente configurado, descifrando credenciales y refrescando tokens si es necesario.
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

    // Descifrado seguro de tokens desde la BD
    const decryptedAccessToken = this.cryptoVault.decrypt(creds.accessToken);
    const decryptedRefreshToken = creds.refreshToken
      ? this.cryptoVault.decrypt(creds.refreshToken)
      : undefined;

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
