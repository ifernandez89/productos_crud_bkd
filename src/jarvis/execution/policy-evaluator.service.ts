import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import {
  CAPABILITY_REGISTRY,
  CapabilityDefinition,
  ExecutionCapabilityId,
  ExecutionRequest,
  PolicyDecision,
} from './execution-broker.types';

const PROHIBITED_ACTORS = new Set([
  'anonymous',
  'guest',
  'public',
  'default',
  'unknown',
  '',
]);

const SENSITIVE_PATH_PATTERNS = [
  /(?:^|[\\/])\.env/i,
  /(?:^|[\\/])\.git/i,
  /credentials|secrets|private[_-]?key|id_rsa/i,
  /(?:^|[\\/])storage[\\/]security/i,
  /node_modules/i,
];

const PRIVATE_NETWORK_PATTERNS = [
  /localhost/i,
  /127\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /0\.0\.0\.0/,
  /::1/,
  /::ffff:127\./i,
  /10\.\d{1,3}\.\d{1,3}\.\d{1,3}/,
  /172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}/,
  /192\.168\.\d{1,3}\.\d{1,3}/,
  /169\.254\.\d{1,3}\.\d{1,3}/, // Link-Local / Cloud Metadata
];

@Injectable()
export class PolicyEvaluatorService {
  private readonly logger = new Logger(PolicyEvaluatorService.name);

  // En B2.1, el modo hermético está permanentemente activo por política arquitectónica
  private readonly hermeticOfflineMode: boolean = true;

  evaluate(request: ExecutionRequest): PolicyDecision {
    // 1. Verificación en el catálogo inmutable de capacidades (Fail-Closed)
    const capDef = CAPABILITY_REGISTRY[request.capabilityId as ExecutionCapabilityId];
    if (!capDef) {
      return {
        approved: false,
        errorCode: 'UNKNOWN_CAPABILITY',
        reason: `Capacidad no registrada o no autorizada en esta política: "${String(request.capabilityId)}".`,
      };
    }

    // 2. Validación de identidad del solicitante
    const callerValidation = this.validateCaller(request);
    if (!callerValidation.approved) {
      return callerValidation;
    }

    // 3. Validación de presencia de parámetros requeridos por la capacidad
    const paramValidation = this.validateRequiredParameters(request, capDef);
    if (!paramValidation.approved) {
      return paramValidation;
    }

    // 4. Verificación de Modo Hermético de Red (Anti-Egress y Anti-SSRF)
    const networkValidation = this.validateNetworkPolicies(request);
    if (!networkValidation.approved) {
      return networkValidation;
    }

    // 5. Verificación de Confinamiento de Rutas (Anti-Traversal y Anti-Sensitive Files)
    const pathValidation = this.validatePathConfinement(request);
    if (!pathValidation.approved) {
      return pathValidation;
    }

    // 6. Verificación de Requisitos Human-in-the-Loop (HITL)
    const hitlValidation = this.validateHitlRequirements(request, capDef);
    if (!hitlValidation.approved) {
      return hitlValidation;
    }

    // 7. Verificación de Paridad de Hash de Diff (si aplica a mutación de código)
    const diffHashValidation = this.validateDiffHashParity(request);
    if (!diffHashValidation.approved) {
      return diffHashValidation;
    }

    return { approved: true };
  }

  private validateCaller(request: ExecutionRequest): PolicyDecision {
    if (!request.caller || typeof request.caller !== 'object') {
      return {
        approved: false,
        errorCode: 'INVALID_CALLER_IDENTITY',
        reason: 'Identidad del solicitante (caller) ausente o malformada.',
      };
    }

    const actorId = String(request.caller.actorId || '').trim().toLowerCase();
    if (PROHIBITED_ACTORS.has(actorId)) {
      return {
        approved: false,
        errorCode: 'UNAUTHORIZED_ACTOR',
        reason: `El actor "${actorId || 'vacío'}" no está autorizado para solicitar ejecuciones en el Broker.`,
      };
    }

    if (!request.caller.sessionId || typeof request.caller.sessionId !== 'string') {
      return {
        approved: false,
        errorCode: 'MISSING_SESSION_ID',
        reason: 'Identificador de sesión (sessionId) requerido.',
      };
    }

    return { approved: true };
  }

  private validateRequiredParameters(
    request: ExecutionRequest,
    capDef: CapabilityDefinition,
  ): PolicyDecision {
    if (!request.parameters || typeof request.parameters !== 'object') {
      return {
        approved: false,
        errorCode: 'INVALID_PARAMETERS',
        reason: 'El objeto de parámetros de la solicitud es nulo o inválido.',
      };
    }

    const params = request.parameters as Record<string, unknown>;
    const missing: string[] = [];

    for (const reqParam of capDef.requiredParameters) {
      if (params[reqParam] === undefined || params[reqParam] === null || params[reqParam] === '') {
        missing.push(reqParam);
      }
    }

    if (missing.length > 0) {
      return {
        approved: false,
        errorCode: 'MISSING_REQUIRED_PARAMETERS',
        reason: `Parámetros obligatorios faltantes para la capacidad "${capDef.id}": ${missing.join(', ')}.`,
      };
    }

    return { approved: true };
  }

  private validateNetworkPolicies(request: ExecutionRequest): PolicyDecision {
    // Modo Hermético de Fase B2: Toda capacidad de red saliente queda bloqueada
    if (request.capabilityId === 'net:fetch_url' && this.hermeticOfflineMode) {
      return {
        approved: false,
        errorCode: 'HERMETIC_OFFLINE_MODE',
        reason: 'Operación de red saliente bloqueada por política hermética de Fase B2 (Offline / Local-First).',
      };
    }

    // Inspección en parámetros para detectar URLs hacia redes privadas o loopback (Anti-SSRF previo)
    const paramsStr = JSON.stringify(request.parameters || {});
    for (const pattern of PRIVATE_NETWORK_PATTERNS) {
      if (pattern.test(paramsStr)) {
        return {
          approved: false,
          errorCode: 'SSRF_PRIVATE_NETWORK_DENIED',
          reason: `Acceso denegado por política Anti-SSRF: los parámetros contienen referencias a localhost, loopback o direcciones privadas.`,
        };
      }
    }

    if (request.resourceScope?.targetUrls) {
      for (const url of request.resourceScope.targetUrls) {
        for (const pattern of PRIVATE_NETWORK_PATTERNS) {
          if (pattern.test(url)) {
            return {
              approved: false,
              errorCode: 'SSRF_PRIVATE_NETWORK_DENIED',
              reason: `URL objetivo prohibida por política Anti-SSRF: "${url}".`,
            };
          }
        }
      }
    }

    return { approved: true };
  }

  private validatePathConfinement(request: ExecutionRequest): PolicyDecision {
    const pathsToCheck: string[] = [];

    // 1. Extraer rutas declaradas en scope
    if (Array.isArray(request.resourceScope?.targetPaths)) {
      pathsToCheck.push(...request.resourceScope.targetPaths);
    }

    // 2. Extraer rutas presentes en parámetros comunes
    const params = (request.parameters || {}) as Record<string, unknown>;
    if (typeof params.path === 'string') pathsToCheck.push(params.path);
    if (typeof params.targetFilePath === 'string') pathsToCheck.push(params.targetFilePath);
    if (typeof params.glbAssetPath === 'string') pathsToCheck.push(params.glbAssetPath);

    // 3. Validar cada ruta
    for (const rawPath of pathsToCheck) {
      const normalized = String(rawPath).trim();

      // Detección de path traversal (..)
      if (normalized.includes('..') || normalized.includes('..\\') || normalized.includes('../')) {
        return {
          approved: false,
          errorCode: 'PATH_TRAVERSAL_DETECTED',
          reason: `Ruta de archivo rechazada por intento de navegación relativa ascendente (..): "${normalized}".`,
        };
      }

      // Prohibición de rutas absolutas de host
      if (path.isAbsolute(normalized) || /^[a-zA-Z]:[\\/]/.test(normalized)) {
        return {
          approved: false,
          errorCode: 'ABSOLUTE_HOST_PATH_DENIED',
          reason: `Ruta absoluta del host rechazada; las operaciones deben ser relativas al workspace confinado: "${normalized}".`,
        };
      }

      // Detección de archivos sensibles o confidenciales
      for (const sensitivePattern of SENSITIVE_PATH_PATTERNS) {
        if (sensitivePattern.test(normalized)) {
          return {
            approved: false,
            errorCode: 'SENSITIVE_RESOURCE_ACCESS_DENIED',
            reason: `Acceso denegado a recurso protegido por política de seguridad: "${normalized}".`,
          };
        }
      }
    }

    return { approved: true };
  }

  private validateHitlRequirements(
    request: ExecutionRequest,
    capDef: CapabilityDefinition,
  ): PolicyDecision {
    if (capDef.requiresHitl || capDef.riskLevel === 'LEVEL_3_RESTRICTED') {
      if (!request.hitlAuthorizationToken || typeof request.hitlAuthorizationToken !== 'string' || !request.hitlAuthorizationToken.trim()) {
        return {
          approved: false,
          errorCode: 'HITL_TOKEN_REQUIRED',
          reason: `La capacidad "${capDef.id}" (Nivel de Riesgo: ${capDef.riskLevel}) exige un token de aprobación humana firmado.`,
        };
      }
    }

    return { approved: true };
  }

  private validateDiffHashParity(request: ExecutionRequest): PolicyDecision {
    if (request.capabilityId === 'code:apply_diff') {
      const params = request.parameters as Record<string, unknown>;
      const expectedInParams = String(params?.expectedDiffHash || '');
      const expectedInScope = String(request.resourceScope?.expectedDiffHash || request.resourceScope?.diffHash || '');

      if (expectedInParams && expectedInScope && expectedInParams !== expectedInScope) {
        return {
          approved: false,
          errorCode: 'DIFF_HASH_MISMATCH',
          reason: `Discrepancia en el hash del diff unificado entre parámetros y scope de recurso (TOCTOU detectado): "${expectedInParams}" vs "${expectedInScope}".`,
        };
      }
    }

    return { approved: true };
  }
}

