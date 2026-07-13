import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private oauth2Client;

  constructor(private prisma: PrismaService) {
    const clientId = process.env.GOOGLE_CLIENT_ID || 'PENDING_CLIENT_ID';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'PENDING_CLIENT_SECRET';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/jarbees/google/callback';

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Genera la URL para que el usuario inicie sesión y otorgue permisos.
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
   */
  async handleCallback(code: string): Promise<void> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      // Usar perfil por defecto (o recuperar ID real en un entorno con usuarios)
      const userProfile = await this.prisma.userProfile.findFirst();
      if (!userProfile) {
        throw new Error('No se encontró UserProfile por defecto.');
      }

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
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token || null,
          expiryDate: tokens.expiry_date,
          scope: tokens.scope,
        },
        update: {
          accessToken: tokens.access_token!,
          refreshToken: tokens.refresh_token || undefined, // Si no viene, mantenemos el anterior
          expiryDate: tokens.expiry_date,
          scope: tokens.scope,
        },
      });

      this.logger.log(`[Google Auth] Tokens actualizados exitosamente en la BD para el usuario ${userProfile.id}`);
    } catch (error) {
      this.logger.error(`Error manejando el callback de Google: ${error.message}`);
      throw error;
    }
  }

  /**
   * Recupera el cliente configurado, refrescando tokens si es necesario.
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

    this.oauth2Client.setCredentials({
      access_token: creds.accessToken,
      refresh_token: creds.refreshToken,
      expiry_date: Number(creds.expiryDate),
    });

    // Validar y refrescar token si está expirado o expira en menos de 5 min
    const isExpired = creds.expiryDate && (Date.now() + 5 * 60 * 1000) > Number(creds.expiryDate);
    
    if (isExpired && creds.refreshToken) {
      this.logger.log(`[Google Auth] Access token expirado, refrescando...`);
      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        
        await this.prisma.userCredential.update({
          where: { id: creds.id },
          data: {
            accessToken: credentials.access_token!,
            expiryDate: credentials.expiry_date,
          },
        });
        
        this.logger.log(`[Google Auth] Access token refrescado.`);
      } catch (err) {
        this.logger.error(`[Google Auth] Error al refrescar token: ${err.message}`);
        return null;
      }
    }

    return this.oauth2Client;
  }
}
