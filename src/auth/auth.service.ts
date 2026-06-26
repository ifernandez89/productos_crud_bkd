import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Emite un JWT sin validar credenciales.
   * Acceso simple para uso personal — el token protege las rutas.
   */
  login(): { access_token: string; expires_in: string } {
    const payload = { sub: 'jarbees-owner', role: 'owner' };
    const token = this.jwt.sign(payload);
    const expiresIn = this.cfg.get<string>('JWT_EXPIRES_IN') ?? '30d';

    return { access_token: token, expires_in: expiresIn };
  }

  /**
   * Verifica que un token JWT sea válido.
   * Usado por JwtStrategy — Passport llama esto internamente.
   */
  verifyPayload(payload: { sub: string; role: string }) {
    return { userId: payload.sub, role: payload.role };
  }
}
