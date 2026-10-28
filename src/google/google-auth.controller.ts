import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Res,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';
import { Public } from '../auth/public.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('google')
@Controller('jarbees/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @Public()
  @Get('login')
  @ApiOperation({ summary: 'Iniciar flujo OAuth2 interactivo de Google' })
  login(@Res() res: Response) {
    const url = this.googleAuthService.getAuthUrl();
    this.logger.log(`[Google Auth] Redirigiendo a Google Login`);
    return res.redirect(url);
  }

  @Public()
  @Post('configure')
  @ApiOperation({
    summary: 'Configurar credenciales de Google OAuth directamente desde el backend (Zero-UI)',
    description:
      'Permite inyectar el refresh_token obtenido previamente sin pasar por el navegador ni la UI. ' +
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
  @ApiOperation({ summary: 'Callback del flujo interactivo OAuth2' })
  async callback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).send('Código de autorización no proporcionado.');
    }

    try {
      await this.googleAuthService.handleCallback(code);
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
