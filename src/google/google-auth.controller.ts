import { Controller, Get, Query, Res, Logger } from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';
import { Public } from '../auth/public.decorator';

@Controller('api/jarbees/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @Public()
  @Get('login')
  login(@Res() res: Response) {
    const url = this.googleAuthService.getAuthUrl();
    this.logger.log(`[Google Auth] Redirigiendo a Google Login`);
    return res.redirect(url);
  }

  @Public()
  @Get('callback')
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
              <p>JarBees ahora tiene acceso seguro a tu Calendar y Tasks.</p>
              <p style="color: #6b7280; font-size: 0.9rem;">Ya puedes cerrar esta pestaña y volver al chat.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
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
