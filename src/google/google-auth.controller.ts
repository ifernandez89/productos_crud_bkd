import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  Logger,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';
import { Public } from '../auth/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import {
  SecurityKernelAuthGuard,
  RequireSecurityPermission,
} from '../jarvis/security/security-kernel-auth.guard';

@ApiTags('google')
@UseGuards(SecurityKernelAuthGuard)
@Controller('jarbees/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({ level: 2, requiredScope: 'jarbees:mutate' })
  @Get('login')
  @ApiOperation({
    summary: 'Iniciar flujo OAuth2 interactivo de Google (Requiere Operador Autenticado)',
  })
  login(@Req() req: any, @Res() res: Response) {
    const actorId = req?.user?.userId || 'operator';
    const url = this.googleAuthService.getAuthUrl(actorId);
    this.logger.log(`[Google Auth] Redirigiendo a Google Login (actor=${actorId})`);
    return res.redirect(url);
  }

  @UseGuards(SecurityKernelAuthGuard)
  @RequireSecurityPermission({
    level: 3,
    requiredScope: 'jarbees:mutate',
    actionType: 'GOOGLE_OAUTH_CONFIGURE',
    targetIdSource: { from: 'static', key: 'google-oauth' },
    requireHitlChallenge: true,
    includeBodyInPayloadHash: true,
  })
  @Post('configure')
  @ApiOperation({
    summary:
      'Configurar credenciales de Google OAuth directamente desde el backend (Requiere Operador + HITL)',
    description:
      'Permite inyectar el refresh_token obtenido previamente con autorización HITL firmada. ' +
      'Las credenciales se cifran en reposo con AES-256-GCM.',
  })
  async configureDirectly(
    @Body()
    body: {
      refreshToken: string;
      accessToken?: string;
      expiryDate?: number;
      scope?: string;
    },
  ) {
    if (!body?.refreshToken) {
      throw new BadRequestException('Se requiere "refreshToken"');
    }

    await this.googleAuthService.configureBackendCredentials(body);

    return {
      success: true,
      message:
        'Credenciales de Google OAuth configuradas y cifradas exitosamente en la base de datos.',
    };
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary:
      'Callback del flujo interactivo OAuth2 (Exige state firmado, single-use y vigente)',
  })
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(400).send('Código de autorización no proporcionado.');
    }

    if (!state) {
      return res
        .status(403)
        .send('OAuthCallback denegado: falta el parámetro "state" firmado.');
    }

    try {
      await this.googleAuthService.handleCallback(code, state);
      return res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0fdf4; color: #166534; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h1 style="margin-bottom: 1rem;">✅ Conectado a Google exitosamente</h1>
              <p>JarBees ahora tiene acceso seguro y cifrado a tu Calendar, Tasks y Drive.</p>
              <p style="color: #6b7280; font-size: 0.9rem;">Ya puedes cerrar esta pestaña.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      this.logger.error(`[Google Auth] Error en callback: ${error.message}`);
      if (error instanceof ForbiddenException) {
        return res.status(403).send(error.message);
      }
      return res.status(500).send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #fef2f2; color: #991b1b; margin: 0;">
            <div style="text-align: center; padding: 2rem; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h1 style="margin-bottom: 1rem;">❌ Error de conexión</h1>
              <p>No se pudo completar la integración con Google.</p>
              <p style="color: #6b7280; font-size: 0.9rem;">Revisa los logs del servidor para más detalles.</p>
            </div>
          </body>
        </html>
      `);
    }
  }
}
