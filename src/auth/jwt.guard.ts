import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

export const PUBLIC_KEY = 'isPublic';

/**
 * Guard JWT global.
 * Por defecto protege TODOS los endpoints.
 * Para marcar uno como público, usar el decorador @Public().
 *
 * Uso:
 *   @Public()           → sin autenticación
 *   (sin decorador)     → requiere Bearer token
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Verificar si el endpoint está marcado como público
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }
}
