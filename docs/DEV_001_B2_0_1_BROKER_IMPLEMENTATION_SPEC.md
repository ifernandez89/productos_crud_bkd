# DEV-001-B2.0.1 — Especificación Técnica del Execution Broker en Modo No-Execution (Fase B2.1)

**Misión:** DEV-001-B2.0.1  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** DEV-001-B2.0 (Design Preliminar)  
**Estado:** Documento de Diseño y Validación Técnica (Sin cambios en código)

---

## 1. Propósito y Límites Estrictos de la Fase B2.1

La Fase **DEV-001-B2.1** implementará el **cerebro de validación del Execution Broker** manteniendo las manos del sistema completamente atadas:

> [!IMPORTANT]
> **REGLA DE ORO DE LA FASE B2.1: STRICT NO-EXECUTION**  
> El Broker procesará, auditará, validará y evaluará políticas de seguridad para cada solicitud, pero **NUNCA despachará ninguna llamada al sistema operativo**.  
> Todas las solicitudes procesadas por el Broker en B2.1 terminarán exclusivamente en uno de dos estados controlados:
> 1. **`DENIED` (Denegada):** Solicitud que viola políticas o carece de autorización.
> 2. **`SIMULATED` (Simulada / Dry-Run):** Solicitud autorizada que devuelve una respuesta sintética de prueba sin invocar `child_process`, sin escribir en disco y sin abrir sockets de red.

---

## 2. Arquitectura de Componentes de B2.1

```
┌────────────────────────────────────────────────────────┐
│                   INTELLIGENCE PLANE                   │
│          Petición: ExecutionRequest<T>                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                EXECUTION BROKER (B2.1)                 │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 1. Identity & Auth Validator                     │  │
│  │    - Valida JWT de operador y rol                │  │
│  │    - Verifica y consume token HITL en B1         │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             ▼                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 2. CapabilityRegistry                            │  │
│  │    - Catálogo tipado e inmutable de capacidades  │  │
│  │    - Rechazo automático si no está en catálogo   │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             ▼                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 3. PolicyEvaluator                               │  │
│  │    - Modo Hermético (Offline)                    │  │
│  │    - Validación Canónica de Rutas (Anti-Symlink) │  │
│  │    - Validación Anti-SSRF en Parámetros          │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             ▼                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 4. Audit & Hash Chaining Logger                  │  │
│  │    - Registro append-only en storage/security/   │  │
│  │    - Hash Chaining SHA-256 inmutable             │  │
│  └──────────────────────────┬───────────────────────┘  │
│                             ▼                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 5. Decision Dispatcher (NO-EXECUTION GATE)       │  │
│  │    - Si inválida  --> status: 'DENIED'           │  │
│  │    - Si válida    --> status: 'SIMULATED'        │  │
│  │    ❌ CERO DESPACHO A OS / SHELL / RED / FS       │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 3. Especificación de Tipos e Interfaces de B2.1

### 3.1. Capability Registry
```typescript
export interface CapabilityDefinition {
  id: ExecutionCapabilityId;
  description: string;
  riskLevel: CapabilityRiskLevel;
  requiresHitl: boolean;
  requiredParameters: string[];
  maxTimeoutMs: number;
  maxMemoryMb: number;
}

export const CAPABILITY_REGISTRY: Record<ExecutionCapabilityId, CapabilityDefinition> = {
  'fs:read_file': {
    id: 'fs:read_file',
    description: 'Lectura de archivo en workspace aislado',
    riskLevel: CapabilityRiskLevel.LEVEL_0_OBSERVATION,
    requiresHitl: false,
    requiredParameters: ['path'],
    maxTimeoutMs: 2000,
    maxMemoryMb: 64,
  },
  'fs:write_file': {
    id: 'fs:write_file',
    description: 'Escritura de archivo en workspace efímero',
    riskLevel: CapabilityRiskLevel.LEVEL_2_SANDBOXED,
    requiresHitl: false,
    requiredParameters: ['path', 'content'],
    maxTimeoutMs: 5000,
    maxMemoryMb: 128,
  },
  'test:run_suite': {
    id: 'test:run_suite',
    description: 'Ejecución de pruebas sintéticas sin red',
    riskLevel: CapabilityRiskLevel.LEVEL_2_SANDBOXED,
    requiresHitl: false,
    requiredParameters: ['testSource', 'files'],
    maxTimeoutMs: 10000,
    maxMemoryMb: 256,
  },
  'net:fetch_url': {
    id: 'net:fetch_url',
    description: 'Petición HTTP saliente filtrada',
    riskLevel: CapabilityRiskLevel.LEVEL_1_MONITORED,
    requiresHitl: false,
    requiredParameters: ['url', 'method'],
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  },
  'code:apply_diff': {
    id: 'code:apply_diff',
    description: 'Integración de diff aprobado humanamente en proyecto',
    riskLevel: CapabilityRiskLevel.LEVEL_3_RESTRICTED,
    requiresHitl: true,
    requiredParameters: ['workspaceId', 'targetFilePath', 'diffHash'],
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  },
  'media:render_3d': {
    id: 'media:render_3d',
    description: 'Renderizado 3D Blender confinado',
    riskLevel: CapabilityRiskLevel.LEVEL_1_MONITORED,
    requiresHitl: false,
    requiredParameters: ['glbAssetPath'],
    maxTimeoutMs: 30000,
    maxMemoryMb: 512,
  },
  'os:desktop_intent': {
    id: 'os:desktop_intent',
    description: 'Automatización de escritorio pre-aprobada',
    riskLevel: CapabilityRiskLevel.LEVEL_3_RESTRICTED,
    requiresHitl: true,
    requiredParameters: ['intent', 'params'],
    maxTimeoutMs: 5000,
    maxMemoryMb: 64,
  },
};
```

---

### 3.2. Estructura de Auditoría con Hash Chaining
Para garantizar que el registro de auditoría no pueda ser truncado ni modificado sin ser detectado:

```typescript
export interface ExecutionAuditRecord {
  index: number;
  timestamp: string;
  requestId: string;
  actorId: string;
  capabilityId: string;
  decision: 'APPROVED' | 'DENIED';
  status: 'DENIED' | 'SIMULATED';
  reason?: string;
  payloadHash: string;
  previousEntryHash: string; // Hash SHA-256 de la entrada index - 1
  entryHash: string;         // SHA-256(index + timestamp + requestId + ... + previousEntryHash)
}
```

---

## 4. Lógica de Evaluación de Políticas en `PolicyEvaluator`

El evaluador de políticas ejecuta 6 controles secuenciales con política **Fail-Closed**:

```typescript
export class PolicyEvaluator {
  evaluate(req: ExecutionRequest): PolicyDecision {
    // 1. Verificación en Catálogo de Capacidades
    const cap = CAPABILITY_REGISTRY[req.capabilityId];
    if (!cap) {
      return { approved: false, reason: `Capacidad desconocida o no registrada: "${req.capabilityId}".` };
    }

    // 2. Control de Modo Hermético de Red
    if (req.capabilityId === 'net:fetch_url') {
      return { approved: false, reason: 'Operación de red saliente bloqueada por política hermética de Fase B2.' };
    }

    // 3. Control de Confinamiento de Rutas (Anti-Traversal & Anti-Symlinks)
    if (req.resourceScope.targetPaths && req.resourceScope.targetPaths.length > 0) {
      for (const p of req.resourceScope.targetPaths) {
        if (p.includes('..') || path.isAbsolute(p)) {
          return { approved: false, reason: `Ruta de archivo no confinada o relativa inválida: "${p}".` };
        }
        if (p.match(/(?:\.env|credentials|secrets|private|\.git)/i)) {
          return { approved: false, reason: `Acceso denegado a recurso protegido por política: "${p}".` };
        }
      }
    }

    // 4. Control de Parámetros de Red (Anti-SSRF previo)
    if (req.parameters && typeof req.parameters === 'object' && 'url' in req.parameters) {
      const rawUrl = String((req.parameters as any).url);
      if (rawUrl.match(/(?:localhost|127\.|192\.168\.|10\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1)/i)) {
        return { approved: false, reason: `URL denegada por política Anti-SSRF (destino privado o local): "${rawUrl}".` };
      }
    }

    // 5. Control de Nivel de Riesgo y Token HITL
    if (cap.requiresHitl) {
      if (!req.hitlAuthorizationToken) {
        return { approved: false, reason: `Capacidad de alto riesgo (${cap.id}) requiere token HITL firmado.` };
      }
    }

    // Aprobada para simulación (Modo No-Execution)
    return { approved: true };
  }
}
```

---

## 5. Casos de Prueba Unitarios de Aceptación para la Fase B2.1

La suite de pruebas de la Fase B2.1 (`execution-broker.spec.ts`) verificará de forma determinista:

1. **Test B2.1-01 (Fail-Closed en capacidad no registrada):**
   Solicitud con capacidad inventada (`os:execute_bash`) $\rightarrow$ Retorna `status: 'DENIED'` con código `UNKNOWN_CAPABILITY`.
2. **Test B2.1-02 (Bloqueo hermético de red):**
   Solicitud `net:fetch_url` hacia cualquier dominio $\rightarrow$ Retorna `status: 'DENIED'` con motivo `HERMETIC_OFFLINE_MODE`.
3. **Test B2.1-03 (Bloqueo Anti-SSRF en parámetros):**
   Solicitud con URL `http://127.0.0.1:4000/api` $\rightarrow$ Retorna `status: 'DENIED'` con motivo `SSRF_LOCAL_HOST_PROHIBITED`.
4. **Test B2.1-04 (Bloqueo Anti-Traversal en rutas):**
   Solicitud `fs:read_file` con `../../.env` $\rightarrow$ Retorna `status: 'DENIED'` con motivo `PATH_TRAVERSAL_DETECTED`.
5. **Test B2.1-05 (Exigencia de token HITL en operaciones L3):**
   Solicitud `code:apply_diff` sin `hitlAuthorizationToken` $\rightarrow$ Retorna `status: 'DENIED'`.
6. **Test B2.1-06 (Validación de token HITL y diffHash con ActionGatekeeperService):**
   Solicitud `code:apply_diff` con token válido $\rightarrow$ Valida y consume nonce; retorna `status: 'SIMULATED'`.
7. **Test B2.1-07 (Rechazo inmediato por TOCTOU de diffHash alterado):**
   Solicitud `code:apply_diff` donde el diffHash difiere por 1 carácter $\rightarrow$ Retorna `status: 'DENIED'` (`DIFF_HASH_MISMATCH`).
8. **Test B2.1-08 (Garantía absoluta de no ejecución):**
   Comprobar mediante espías (`jest.spyOn(child_process, 'spawn')`, `jest.spyOn(fs, 'writeFileSync')`, `jest.spyOn(http, 'request')`) que ninguna API del sistema operativo es invocada bajo ninguna circunstancia.
9. **Test B2.1-09 (Integridad de Hash Chaining en Auditoría):**
   Generar 10 solicitudes mixtas (aprobadas y denegadas) y verificar que cada entrada del libro mayor valida el hash de la entrada anterior.

---

## 6. Criterio de Finalización de la Fase B2.1

La Fase B2.1 se considerará exitosa únicamente si:
- El `ExecutionBrokerService` compila con 0 errores TypeScript.
- Todas las pruebas de aceptación anteriores (B2.1-01 a B2.1-09) pasan con 100% de éxito con `--runInBand --silent`.
- Se comprueba empíricamente que **cero procesos del sistema operativo son lanzados**.
- Se preserva el aislamiento absoluto de producción (puerto 4000, `jarbees_data`, ngrok).
- Una auditoría independiente de solo lectura emite dictamen favorable antes de avanzar a B2.2.

