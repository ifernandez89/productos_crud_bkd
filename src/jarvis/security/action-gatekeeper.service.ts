import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  OnModuleDestroy,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { validateCryptoSecret } from '../../auth/jwt-secret.util';

export interface ActionChallengeTokenPayload {
  actorId: string;
  actionType: string;
  targetId: string;
  nonce: string;
  expiresAt: number;
  payloadHash: string;
  signature: string;
}

export interface ActionChallengeResponse {
  token: string;
  actorId: string;
  actionType: string;
  targetId: string;
  payloadHash: string;
  expiresAt: number;
  expiresInSeconds: number;
  message: string;
}

interface ActiveNonceRecord {
  actorId: string;
  actionType: string;
  targetId: string;
  payloadHash: string;
  expiresAt: number;
}

const PROHIBITED_ACTORS = new Set([
  'anonymous',
  'jarbees-owner',
  'owner',
  'system',
  'public',
  'default',
  'guest',
]);

@Injectable()
export class ActionGatekeeperService implements OnModuleDestroy {
  private readonly logger = new Logger(ActionGatekeeperService.name);
  private readonly secret: Buffer;
  private readonly ttlMs = 60 * 1000; // 60 segundos de validez estricta
  private readonly cleanupInterval: NodeJS.Timeout;

  // Almacén en memoria de nonces activos atados a (actorId, actionType, targetId, payloadHash)
  private readonly activeNonces = new Map<string, ActiveNonceRecord>();

  constructor() {
    // Fail-closed: prohibido usar secretos criptográficos por defecto
    const rawSecret = validateCryptoSecret(
      process.env.ACTION_GATEKEEPER_SECRET ?? process.env.JWT_SECRET,
      'ACTION_GATEKEEPER_SECRET',
    );

    this.secret = crypto
      .createHash('sha256')
      .update(`${rawSecret}:jarbees_action_gatekeeper_salt_v2`)
      .digest();

    // Limpieza periódica de nonces expirados cada 30 segundos
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredNonces(),
      30000,
    );
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
   * Calcula un hash SHA-256 determinista sobre el payload canónico (claves ordenadas recursivamente).
   */
  computePayloadHash(payload?: Record<string, any> | null): string {
    const canonical = this.canonicalizeValue(payload ?? {});
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical), 'utf8')
      .digest('hex');
  }

  /**
   * Genera un reto de autorización firmado (Action Challenge Token) de un solo uso.
   * Exige identidad de operador autenticado (actorId) y vincula criptográficamente:
   * actorId + actionType + targetId + nonce + expiresAt + payloadHash.
   */
  createChallenge(
    actionType: string,
    targetId: string | number,
    payload?: Record<string, any>,
    actorId?: string,
  ): ActionChallengeResponse {
    const cleanActor = typeof actorId === 'string' ? actorId.trim() : '';
    if (
      !cleanActor ||
      cleanActor.length < 3 ||
      PROHIBITED_ACTORS.has(cleanActor.toLowerCase())
    ) {
      throw new UnauthorizedException(
        'Emisión HITL denegada: se requiere un operador autenticado válido (actorId) para solicitar un reto de autorización.',
      );
    }

    if (
      !actionType ||
      typeof actionType !== 'string' ||
      actionType.trim().length === 0 ||
      targetId === undefined ||
      targetId === null ||
      String(targetId).trim().length === 0
    ) {
      throw new BadRequestException(
        'Se requieren actionType y targetId válidos para generar un reto de autorización.',
      );
    }

    const cleanAction = actionType.trim().toUpperCase();
    const cleanTarget = String(targetId).trim();
    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + this.ttlMs;
    const payloadHash = this.computePayloadHash(payload);

    const signPayload = `${cleanActor}:${cleanAction}:${cleanTarget}:${nonce}:${expiresAt}:${payloadHash}`;
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(signPayload, 'utf8')
      .digest('hex');

    const rawTokenObject: ActionChallengeTokenPayload = {
      actorId: cleanActor,
      actionType: cleanAction,
      targetId: cleanTarget,
      nonce,
      expiresAt,
      payloadHash,
      signature,
    };

    const token = Buffer.from(JSON.stringify(rawTokenObject), 'utf8').toString(
      'base64url',
    );

    this.activeNonces.set(nonce, {
      actorId: cleanActor,
      actionType: cleanAction,
      targetId: cleanTarget,
      payloadHash,
      expiresAt,
    });

    this.logger.log(
      `[ActionGatekeeper] Reto HITL emitido para actor="${cleanActor}" acción="${cleanAction}" recurso="#${cleanTarget}" (nonce=${nonce.slice(0, 8)}...)`,
    );

    return {
      token,
      actorId: cleanActor,
      actionType: cleanAction,
      targetId: cleanTarget,
      payloadHash,
      expiresAt,
      expiresInSeconds: Math.round(this.ttlMs / 1000),
      message: `Token HITL generado para ${cleanActor} -> ${cleanAction} sobre #${cleanTarget}. Válido por 60 segundos (Single-Use).`,
    };
  }

  /**
   * Valida y consume el token de autorización firmado (Single-Use).
   * Prohibido cualquier bypass por variables de entorno (SKIP_HITL eliminado).
   */
  verifyAndConsumeChallenge(
    tokenString: string | undefined | null,
    expectedActionType: string,
    expectedTargetId: string | number,
    payload?: Record<string, any>,
    expectedActorId?: string,
  ): boolean {
    if (!tokenString || typeof tokenString !== 'string') {
      throw new ForbiddenException(
        'Operación crítica rechazada: se requiere un Action Challenge Token firmado (x-action-token).',
      );
    }

    let parsed: ActionChallengeTokenPayload;
    try {
      const decodedJson = Buffer.from(tokenString, 'base64url').toString(
        'utf8',
      );
      parsed = JSON.parse(decodedJson);
    } catch {
      throw new ForbiddenException(
        'Formato de token de acción inválido o malformado.',
      );
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new ForbiddenException('Payload de token HITL inválido.');
    }

    const {
      actorId,
      actionType,
      targetId,
      nonce,
      expiresAt,
      payloadHash,
      signature,
    } = parsed;

    if (
      typeof actorId !== 'string' ||
      typeof actionType !== 'string' ||
      typeof targetId !== 'string' ||
      typeof nonce !== 'string' ||
      typeof expiresAt !== 'number' ||
      typeof payloadHash !== 'string' ||
      typeof signature !== 'string'
    ) {
      throw new ForbiddenException(
        'Token HITL incompleto: faltan campos obligatorios de vinculación.',
      );
    }

    // 1. Validar expiración estricta
    if (expiresAt <= Date.now()) {
      this.activeNonces.delete(nonce);
      throw new ForbiddenException(
        'El token de autorización HITL ha expirado (validez máxima: 60s).',
      );
    }

    // 2. Validar coincidencia de actor si fue suministrado por el guard
    if (expectedActorId !== undefined) {
      const cleanExpectedActor = expectedActorId.trim();
      if (!cleanExpectedActor || actorId !== cleanExpectedActor) {
        throw new ForbiddenException(
          `El token HITL pertenece a otro operador ("${actorId}") y no puede ser utilizado por "${cleanExpectedActor}".`,
        );
      }
    }

    if (PROHIBITED_ACTORS.has(actorId.toLowerCase())) {
      throw new ForbiddenException(
        'El token HITL contiene un actor inválido o no permitido.',
      );
    }

    // 3. Validar coincidencia de acción y recurso concreto
    const cleanExpectedAction = expectedActionType.trim().toUpperCase();
    const cleanExpectedTarget = String(expectedTargetId).trim();

    if (
      actionType !== cleanExpectedAction ||
      targetId !== cleanExpectedTarget
    ) {
      throw new ForbiddenException(
        `El token de acción no corresponde a la operación solicitada (Token: ${actionType} sobre #${targetId} vs Petición: ${cleanExpectedAction} sobre #${cleanExpectedTarget}).`,
      );
    }

    // 4. Validar integridad criptográfica del payload (vinculación obligatoria)
    const currentPayloadHash = this.computePayloadHash(payload);
    if (payloadHash !== currentPayloadHash) {
      throw new ForbiddenException(
        'El payload de la operación fue alterado respecto al autorizado en el reto HITL.',
      );
    }

    // 5. Validar firma criptográfica HMAC en tiempo constante
    const signPayload = `${actorId}:${actionType}:${targetId}:${nonce}:${expiresAt}:${payloadHash}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(signPayload, 'utf8')
      .digest('hex');

    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      sigBuffer.length === 0 ||
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException(
        'Firma criptográfica del token de acción inválida.',
      );
    }

    // 6. Validar que el nonce esté activo y coincida con el registro en memoria (Single-Use Anti-Replay)
    const storedNonce = this.activeNonces.get(nonce);
    if (!storedNonce) {
      throw new ForbiddenException(
        'El token de acción ya fue consumido o no es válido (Single-Use).',
      );
    }

    if (
      storedNonce.actorId !== actorId ||
      storedNonce.actionType !== actionType ||
      storedNonce.targetId !== targetId ||
      storedNonce.payloadHash !== payloadHash
    ) {
      this.activeNonces.delete(nonce);
      throw new ForbiddenException(
        'Discrepancia de integridad en el registro del nonce HITL.',
      );
    }

    // Consumir el nonce de inmediato
    this.activeNonces.delete(nonce);

    this.logger.log(
      `🛡️ [ActionGatekeeper] Reto HITL validado y consumido: actor="${actorId}" acción="${actionType}" recurso="#${targetId}" (nonce=${nonce.slice(0, 8)}...)`,
    );

    return true;
  }

  /**
   * Revoca todos los nonces activos (para emergencias / Kill Switch).
   */
  revokeAllActiveChallenges(): number {
    const count = this.activeNonces.size;
    this.activeNonces.clear();
    return count;
  }

  private canonicalizeValue(value: any): any {
    if (value === null || value === undefined) {
      return {};
    }
    if (Array.isArray(value)) {
      return value.map((item) =>
        item && typeof item === 'object' ? this.canonicalizeValue(item) : item,
      );
    }
    if (typeof value === 'object') {
      const sortedKeys = Object.keys(value)
        .filter((k) => value[k] !== undefined)
        .sort();
      const result: Record<string, any> = {};
      for (const key of sortedKeys) {
        const v = value[key];
        result[key] =
          v && typeof v === 'object' ? this.canonicalizeValue(v) : v;
      }
      return result;
    }
    return value;
  }

  private cleanupExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, record] of this.activeNonces.entries()) {
      if (record.expiresAt <= now) {
        this.activeNonces.delete(nonce);
      }
    }
  }
}
