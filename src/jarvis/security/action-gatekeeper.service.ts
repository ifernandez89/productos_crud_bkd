import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import * as crypto from 'crypto';

export interface ActionChallengeTokenPayload {
  actionType: string;
  targetId: string;
  nonce: string;
  expiresAt: number;
  payloadHash?: string;
  signature: string;
}

export interface ActionChallengeResponse {
  token: string;
  actionType: string;
  targetId: string;
  expiresAt: number;
  expiresInSeconds: number;
  message: string;
}

@Injectable()
export class ActionGatekeeperService implements OnModuleDestroy {
  private readonly logger = new Logger(ActionGatekeeperService.name);
  private readonly secret: Buffer;
  private readonly ttlMs = 60 * 1000; // 60 segundos de validez
  private readonly cleanupInterval: NodeJS.Timeout;

  // Almacén en memoria de nonces activos (previene ataques de repetición)
  private readonly activeNonces = new Map<string, number>();

  constructor() {
    const rawSecret =
      process.env.JWT_SECRET ||
      process.env.ACTION_GATEKEEPER_SECRET ||
      'jarbees-hitl-gatekeeper-secret-key-2026';

    this.secret = crypto
      .createHash('sha256')
      .update(`${rawSecret}:jarbees_action_gatekeeper_salt`)
      .digest();

    // Limpieza periódica de nonces expirados cada 30 segundos
    this.cleanupInterval = setInterval(() => this.cleanupExpiredNonces(), 30000);
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  destroy() {
    this.onModuleDestroy();
  }

  /**
   * Genera un reto de autorización firmado (Action Challenge Token).
   * Este token autoriza UNA SOLA acción destructiva específica dentro de los próximos 60s.
   */
  createChallenge(
    actionType: string,
    targetId: string | number,
    payload?: Record<string, any>,
  ): ActionChallengeResponse {
    if (!actionType || targetId === undefined || targetId === null) {
      throw new BadRequestException('Se requieren actionType y targetId para generar un reto de autorización.');
    }

    const cleanAction = actionType.trim().toUpperCase();
    const cleanTarget = String(targetId).trim();
    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlMs;

    const payloadHash = payload
      ? crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      : undefined;

    const signPayload = `${cleanAction}:${cleanTarget}:${nonce}:${expiresAt}:${payloadHash || ''}`;
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(signPayload)
      .digest('hex');

    const rawTokenObject: ActionChallengeTokenPayload = {
      actionType: cleanAction,
      targetId: cleanTarget,
      nonce,
      expiresAt,
      payloadHash,
      signature,
    };

    const token = Buffer.from(JSON.stringify(rawTokenObject)).toString('base64url');

    // Registrar nonce como activo
    this.activeNonces.set(nonce, expiresAt);

    this.logger.log(
      `[ActionGatekeeper] Reto de acción generado: ${cleanAction} sobre #${cleanTarget} (nonce: ${nonce.slice(0, 8)}...)`,
    );

    return {
      token,
      actionType: cleanAction,
      targetId: cleanTarget,
      expiresAt,
      expiresInSeconds: Math.round(this.ttlMs / 1000),
      message: `Token generado para acción ${cleanAction} sobre recurso #${cleanTarget}. Válido por 60 segundos.`,
    };
  }

  /**
   * Valida y consume el token de autorización firmado (Single-Use).
   * Lanza ForbiddenException si el token es inválido, expirado o ya fue consumido.
   */
  verifyAndConsumeChallenge(
    tokenString: string | undefined | null,
    expectedActionType: string,
    expectedTargetId: string | number,
    payload?: Record<string, any>,
  ): boolean {
    // Si SKIP_HITL está explícitamente habilitado (ej: tests o dev local forzado), registrar y permitir
    if (process.env.SKIP_HITL === 'true') {
      this.logger.warn(
        `[ActionGatekeeper] SKIP_HITL=true activo. Omitiendo validación de reto para ${expectedActionType}.`,
      );
      return true;
    }

    if (!tokenString || typeof tokenString !== 'string') {
      throw new ForbiddenException(
        `Operación crítica rechazada: se requiere cabecera 'x-action-token' o parámetro 'actionToken' firmado. Solicite uno previamente en POST /api/jarbees/security/challenge.`,
      );
    }

    let parsed: ActionChallengeTokenPayload;
    try {
      const decodedJson = Buffer.from(tokenString, 'base64url').toString('utf8');
      parsed = JSON.parse(decodedJson);
    } catch {
      throw new ForbiddenException('Formato de token de acción inválido o malformado.');
    }

    const { actionType, targetId, nonce, expiresAt, payloadHash, signature } = parsed;

    // 1. Validar expiración
    if (!expiresAt || expiresAt < Date.now()) {
      throw new ForbiddenException('El token de autorización de acción ha expirado (validez máxima: 60s).');
    }

    // 2. Validar coincidencia de acción y objetivo concreto
    const cleanExpectedAction = expectedActionType.trim().toUpperCase();
    const cleanExpectedTarget = String(expectedTargetId).trim();

    if (actionType !== cleanExpectedAction || targetId !== cleanExpectedTarget) {
      throw new ForbiddenException(
        `El token de acción no corresponde al recurso solicitado (Token: ${actionType} sobre #${targetId} vs Petición: ${cleanExpectedAction} sobre #${cleanExpectedTarget}).`,
      );
    }

    // 3. Validar payloadHash si aplica
    if (payloadHash) {
      const currentPayloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(payload || {}))
        .digest('hex');
      if (currentPayloadHash !== payloadHash) {
        throw new ForbiddenException('El payload de la acción difiere del payload autorizado en el reto.');
      }
    }

    // 4. Validar firma criptográfica HMAC en tiempo constante
    const signPayload = `${actionType}:${targetId}:${nonce}:${expiresAt}:${payloadHash || ''}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(signPayload)
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Firma criptográfica del token de acción inválida.');
    }

    // 5. Validar que el nonce esté activo (Anti-Replay / Single Use)
    if (!this.activeNonces.has(nonce)) {
      throw new ForbiddenException('El token de acción ya fue consumido o no es válido (Single-Use).');
    }

    // Consumir el nonce de inmediato
    this.activeNonces.delete(nonce);

    this.logger.log(
      `🛡️ [ActionGatekeeper] Reto validado y consumido con éxito: ${actionType} sobre #${targetId} (nonce: ${nonce.slice(0, 8)}...)`,
    );

    return true;
  }

  private cleanupExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.activeNonces.entries()) {
      if (expiresAt < now) {
        this.activeNonces.delete(nonce);
      }
    }
  }
}
