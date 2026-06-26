import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  /**
   * Valida la contraseña maestra y emite un JWT.
   * La contraseña vive SOLO en .env (MASTER_PASSWORD).
   */
  login(password: string): { access_token: string; expires_in: string } {
    const master = this.cfg.get<string>('MASTER_PASSWORD');

    if (!master) {
      throw new Error('MASTER_PASSWORD no está configurada en .env');
    }

    if (password !== master) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

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
