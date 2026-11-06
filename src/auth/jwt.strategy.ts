import { Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import {
  JARBEES_JWT_ALGORITHM,
  JARBEES_JWT_AUDIENCE,
  JARBEES_JWT_ISSUER,
  resolveRequiredJwtSecret,
} from './jwt-secret.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    @Optional() cfg?: ConfigService,
  ) {
    // Fail-closed: rechaza iniciar si JWT_SECRET falta o es un valor por defecto
    const secretOrKey = resolveRequiredJwtSecret(cfg);
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey,
      algorithms: [JARBEES_JWT_ALGORITHM],
      issuer: JARBEES_JWT_ISSUER,
      audience: JARBEES_JWT_AUDIENCE,
    } as any);
  }

  async validate(payload: any) {
    const user = this.authService.verifyPayload(payload);
    if (!user) {
      throw new UnauthorizedException(
        'Token JWT rechazado: claims inválidos, issuer/audience incorrectos, rol no autorizado o identidad no permitida.',
      );
    }
    return user;
  }
}
