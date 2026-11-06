import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PUBLIC_KEY } from '../../auth/jwt.guard';
import { ActionGatekeeperService } from './action-gatekeeper.service';
import { AuditService } from './audit.service';

export const SECURITY_KERNEL_PERMISSION_KEY = 'jarbees:security_kernel_permission';

export type SecurityPermissionLevel = 0 | 1 | 2 | 3;

export interface SecurityKernelPermissionMetadata {
  level: SecurityPermissionLevel;
  requiredScope: string;
  actionType?: string;
  targetIdSource?: {
    from: 'param' | 'body' | 'query' | 'static';
    key: string;
    compositeParamKey?: string;
  };
  requireHitlChallenge?: boolean;
  includeBodyInPayloadHash?: boolean;
}

export const RequireSecurityPermission = (
  metadata: SecurityKernelPermissionMetadata,
) => SetMetadata(SECURITY_KERNEL_PERMISSION_KEY, metadata);

const PROHIBITED_KERNEL_IDENTITIES = new Set([
  'anonymous',
  'jarbees-owner',
  'owner',
  'system',
  'public',
  'default',
  'guest',
]);

/**
 * Lista blanca estricta y cerrada de endpoints que tienen autorización explícita
 * para permanecer públicos en todo el backend (DEV-001-B1.1 / B1.2: A1).
 * Vinculación estricta y obligatoria por tupla Controller.handler exactos.
 */
export const AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES = new Set<string>([
  'AuthController.login', // POST /auth/login
  'JarvisController.getInferenceStatus', // GET /jarbees/inference/status
  'MobileGatewayController.getHealth', // GET /mobile/v1/health
  'GoogleAuthController.callback', // GET /jarbees/google/callback (protegido por OAuth state firmado de un solo uso)
]);

export const AUTHORIZED_PUBLIC_HANDLERS = new Set<string>([
  'login',
  'getInferenceStatus',
  'getHealth',
  'callback',
]);

/**
 * SecurityKernelAuthGuard — Guard independiente del Security Kernel (DEV-001-B1 / B1.1 / B1.2).
 *
 * Aplica la política de "Privado por Defecto" y separación de responsabilidades en 4 niveles:
 * 0. Excepción pública: Solo si el handler tiene @Public() Y coincide exactamente su tupla Controller.method
 *    en AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES (Fail-Closed).
 * 1. Identidad: Exige un operador autenticado real en request.user (proveniente de JwtAuthGuard).
 * 2. Autorización de Kernel: Comprueba que el operador posea el rol ('operator'|'admin') y el
 *    scope específico requerido para la operación solicitada (con fallback fail-closed si faltara decorador).
 * 3. Aprobación Humana (HITL): Para operaciones críticas (Nivel 3 / requireHitlChallenge),
 *    verifica y consume el ActionChallengeToken en ActionGatekeeperService vinculando
 *    actorId + actionType + targetId + payloadHash.
 */
@Injectable()
export class SecurityKernelAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly actionGatekeeper: ActionGatekeeperService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = context.getHandler();
    const handlerName = handler?.name ?? '';
    const controllerClass = context.getClass();
    const controllerName = controllerClass?.name ?? '';
    const endpointSignature = `${controllerName}.${handlerName}`;

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      handler,
      controllerClass,
    ]);

    if (isPublic) {
      if (AUTHORIZED_PUBLIC_ENDPOINT_SIGNATURES.has(endpointSignature)) {
        return true;
      }
      throw new ForbiddenException(
        `SecurityKernel: el endpoint "${endpointSignature}" tiene @Public() pero no figura en la lista blanca de excepciones públicas autorizadas (Fail-Closed).`,
      );
    }

    const metadata =
      this.reflector.getAllAndOverride<SecurityKernelPermissionMetadata>(
        SECURITY_KERNEL_PERMISSION_KEY,
        [handler, context.getClass()],
      );

    const request = context.switchToHttp().getRequest();
    const user = request?.user;

    // 1. Verificar identidad autenticada del operador
    if (!user || typeof user !== 'object') {
      await this.auditService?.log('securityKernel.auth.denied_unauthenticated', {
        path: request?.url,
        method: request?.method,
        handler: handlerName,
      });
      throw new UnauthorizedException(
        'SecurityKernel: acceso denegado. Se requiere operador autenticado con JWT válido.',
      );
    }

    const actorId = typeof user.userId === 'string' ? user.userId.trim() : '';
    const role = typeof user.role === 'string' ? user.role.trim() : '';
    const scopes: string[] = Array.isArray(user.scopes) ? user.scopes : [];

    if (
      !actorId ||
      actorId.length < 3 ||
      PROHIBITED_KERNEL_IDENTITIES.has(actorId.toLowerCase()) ||
      (role !== 'operator' && role !== 'admin')
    ) {
      await this.auditService?.log('securityKernel.auth.denied_invalid_identity', {
        actorId,
        role,
        path: request?.url,
        handler: handlerName,
      });
      throw new UnauthorizedException(
        'SecurityKernel: identidad de operador inválida o rol no autorizado.',
      );
    }

    // Fallback fail-closed si algún endpoint no declaró metadata explícita
    const methodUpper = String(request?.method ?? 'GET').toUpperCase();
    const effectiveScope =
      metadata?.requiredScope ??
      (methodUpper === 'GET' ? 'jarbees:read' : 'jarbees:mutate');

    // 2. Verificar permiso / scope específico para la operación
    const hasRequiredScope =
      scopes.includes(effectiveScope) ||
      (role === 'admin' && scopes.includes('jarbees:admin'));

    if (!hasRequiredScope) {
      await this.auditService?.log('securityKernel.auth.denied_insufficient_scope', {
        actorId,
        requiredScope: effectiveScope,
        actualScopes: scopes,
        path: request?.url,
        handler: handlerName,
      });
      throw new ForbiddenException(
        `SecurityKernel: permisos insuficientes. La operación requiere el scope "${effectiveScope}".`,
      );
    }

    // 3. Si la operación es de Nivel 3 o exige reto HITL, validar y consumir el token en ActionGatekeeper
    if (metadata && (metadata.level === 3 || metadata.requireHitlChallenge)) {
      if (!metadata.actionType) {
        throw new ForbiddenException(
          'SecurityKernel: configuración inválida de endpoint crítico (falta actionType).',
        );
      }

      const targetId = this.extractTargetId(request, metadata);
      const token = this.extractActionToken(request);
      const payloadToVerify = metadata.includeBodyInPayloadHash
        ? (request?.body ?? {})
        : undefined;

      this.actionGatekeeper.verifyAndConsumeChallenge(
        token,
        metadata.actionType,
        targetId,
        payloadToVerify,
        actorId,
      );

      // Marcar en la request que el reto HITL ya fue verificado y consumido por el SecurityKernel
      request.hitlChallengeVerified = {
        verified: true,
        actorId,
        actionType: metadata.actionType.trim().toUpperCase(),
        targetId: String(targetId).trim(),
        verifiedAt: Date.now(),
      };

      await this.auditService?.log('securityKernel.hitl.verified', {
        actorId,
        actionType: metadata.actionType,
        targetId: String(targetId),
        path: request?.url,
      });
    }

    return true;
  }

  private extractActionToken(request: any): string | undefined {
    const headerToken =
      request?.headers?.['x-action-token'] ??
      request?.headers?.['X-Action-Token'];
    if (typeof headerToken === 'string' && headerToken.trim().length > 0) {
      return headerToken.trim();
    }
    if (
      typeof request?.query?.actionToken === 'string' &&
      request.query.actionToken.trim().length > 0
    ) {
      return request.query.actionToken.trim();
    }
    if (
      typeof request?.body?.humanApprovalToken === 'string' &&
      request.body.humanApprovalToken.trim().length > 0
    ) {
      return request.body.humanApprovalToken.trim();
    }
    return undefined;
  }

  private extractTargetId(
    request: any,
    metadata: SecurityKernelPermissionMetadata,
  ): string {
    const src = metadata.targetIdSource;
    if (!src) {
      return 'global';
    }
    if (src.from === 'static') {
      return src.key;
    }
    if (src.from === 'param') {
      const primary = request?.params?.[src.key];
      if (src.compositeParamKey) {
        const secondary = request?.params?.[src.compositeParamKey];
        return `${primary}:${secondary}`;
      }
      if (primary !== undefined && primary !== null) {
        return String(primary);
      }
    }
    if (src.from === 'body') {
      const val = request?.body?.[src.key];
      if (val !== undefined && val !== null) {
        return String(val);
      }
    }
    if (src.from === 'query') {
      const val = request?.query?.[src.key];
      if (val !== undefined && val !== null) {
        return String(val);
      }
    }
    throw new ForbiddenException(
      `SecurityKernel: no se pudo determinar el identificador del recurso objetivo (${src.from}.${src.key}) para validar la autorización HITL.`,
    );
  }
}
