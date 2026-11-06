# DEV-001-B2.0 — Diseño Arquitectónico del Execution Broker

**Misión:** DEV-001-B2.0  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** Homologación DEV-001-B1 bajo restricciones operacionales  
**Estado:** Documento de Diseño Arquitectónico (Sin cambios en código)

---

## 1. Principio Fundamental de Separación

El principio rector del **Execution Broker** establece una separación estricta entre la formulación de una acción y la autoridad para ejecutarla:

> **El Intelligence Plane (LLM / Planner / RAG) propone acciones; NUNCA concede permisos ni evalúa su propia legitimidad.**  
> **El Security Kernel (B1) autentica y autoriza al operador.**  
> **El Execution Broker (B2) valida la capacidad, audita el alcance, vincula criptográficamente los parámetros y delega la ejecución a un entorno confinado.**

```
┌────────────────────────────────────────────────────────┐
│                   INTELLIGENCE PLANE                   │
│        Formula: ExecutionRequestProposal               │
└──────────────────────────┬─────────────────────────────┘
                           │ (Petición no confiable)
                           ▼
┌────────────────────────────────────────────────────────┐
│                    EXECUTION BROKER                    │
│  1. Verificación de Identidad del Operador             │
│  2. Resolución contra Capability Registry              │
│  3. Verificación de Riesgo y Tokens HITL (B1)          │
│  4. Vinculación Criptográfica (PayloadHash + Nonce)    │
│  5. Validación de Rutas Canónicas y Red                │
│  6. Aplicación de Cuotas (CPU, RAM, Timeout, Buffer)   │
└──────────────────────────┬─────────────────────────────┘
                           │ (Despacho Confinado)
                           ▼
┌────────────────────────────────────────────────────────┐
│                   EXECUTION ADAPTER                    │
│       (Windows Job Object / Sandboxed Subprocess)       │
└────────────────────────────────────────────────────────┘
```

---

## 2. Contratos de Solicitud y Respuesta (TypeScript Schemas)

### 2.1. Tipos de Capacidades Autorizables
```typescript
export type ExecutionCapabilityId =
  | 'fs:read_file'          // Lectura de archivo en workspace
  | 'fs:write_file'         // Escritura en workspace temporal
  | 'fs:list_directory'     // Listado de archivos confinado
  | 'test:run_suite'        // Ejecución de pruebas en sandbox
  | 'net:fetch_url'         // Petición HTTP saliente filtrada
  | 'media:render_3d'       // Renderizado Blender confinado
  | 'media:synthesize_voice'// Síntesis de voz / TTS
  | 'os:desktop_intent';    // Intención móvil pre-aprobada
```

### 2.2. Niveles de Riesgo y Políticas de Aprobación
```typescript
export enum CapabilityRiskLevel {
  LEVEL_0_OBSERVATION = 'LEVEL_0_OBSERVATION',   // Solo lectura inofensiva (auto-aprobada si autenticado)
  LEVEL_1_MONITORED   = 'LEVEL_1_MONITORED',     // Lectura externa / scraping controlado
  LEVEL_2_SANDBOXED   = 'LEVEL_2_SANDBOXED',     // Modificación en workspace efímero descartable
  LEVEL_3_RESTRICTED  = 'LEVEL_3_RESTRICTED',    // Acciones críticas (exige token HITL criptográfico)
}
```

### 2.3. Contrato de Solicitud de Ejecución (`ExecutionRequest`)
```typescript
export interface ExecutionRequest<TParams = Record<string, unknown>> {
  requestId: string;              // UUID v4 único
  capabilityId: ExecutionCapabilityId;
  caller: {
    actorId: string;              // Identidad verificada por B1 (ej: 'ignacio.operator')
    sessionId: string;            // ID de sesión activa
    role: 'operator' | 'admin';
  };
  parameters: TParams;            // Parámetros específicos de la capacidad
  resourceScope: {
    workspaceId: string;          // Identificador del workspace aislado
    targetPaths?: string[];       // Rutas canónicas afectadas (relativas al workspace)
    targetUrls?: string[];        // URLs objetivo (si aplica)
  };
  resourceLimits?: {
    maxDurationMs?: number;       // Timeout estricto (ej. 5.000 ms)
    maxMemoryMb?: number;         // Memoria máxima de proceso (ej. 256 MB)
    maxCpuPercent?: number;       // Porcentaje de CPU permitido (ej. 50%)
    maxOutputBytes?: number;      // Límite de buffer stdout/stderr (ej. 65.536 bytes)
  };
  hitlAuthorizationToken?: string;// Token HMAC-SHA256 emitido por ActionGatekeeperService (B1)
}
```

### 2.4. Contrato de Resultado de Ejecución (`ExecutionResponse`)
```typescript
export interface ExecutionResponse<TResult = unknown> {
  requestId: string;
  capabilityId: ExecutionCapabilityId;
  status: 'SUCCESS' | 'DENIED' | 'TIMEOUT' | 'RESOURCE_EXCEEDED' | 'EXECUTION_ERROR';
  result?: TResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  telemetry: {
    durationMs: number;
    cpuTimeMs?: number;
    peakMemoryMb?: number;
    bytesWritten?: number;
    bytesOutput?: number;
    sandboxExitCode?: number;
  };
  auditSignature: string;         // Firma SHA-256 encadenada en log de auditoría
}
```

---

## 3. Registro Central de Capacidades (`CapabilityRegistry`)

Cada capacidad disponible en JarBees se registra con una definición estricta e inmutable:

| Capacidad | Nivel de Riesgo | Parámetros Obligatorios | Validaciones Pre-Ejecución | Requiere HITL |
| :--- | :---: | :--- | :--- | :---: |
| `fs:read_file` | L0 | `path: string` | Path traversal, canonical realpath, symlinks | No |
| `fs:write_file` | L2 | `path: string, content: string` | Confinamiento a workspace efímero, tamaño máx (2 MB) | Si toca sensibles |
| `fs:list_directory`| L0 | `path: string` | Confinamiento a workspace, sin symlinks | No |
| `test:run_suite` | L2 | `testSource: string, files: dict` | SHA-256 pre-verificado, sin red en sandbox | No |
| `net:fetch_url` | L1 | `url: string, method: string` | Filtro anti-SSRF, DNS pre-resolution, whitelist | No |
| `media:render_3d` | L1 | `glbAssetPath: string` | Confinamiento B1 en `storage/assets/`, tamaño GLB | No |
| `media:synthesize_voice`| L0 | `text: string, voiceId: string`| Límite de longitud de texto (5.000 caracteres) | No |
| `os:desktop_intent`| L3 | `intent: string, params: dict` | Whitelist `MOBILE_ALLOWED_APPS` / HMAC | Sí (según B1) |

---

## 4. Vinculación Criptográfica y Protocolo de Autorización (Integración B1-B2)

Para prevenir ataques de sustitución de parámetros o ataques TOCTOU (*Time-of-Check to Time-of-Use*), el Broker utiliza el protocolo criptográfico probado en B1:

1. **Serialización Canónica del Payload:**
   Los parámetros de la solicitud se ordenan de forma recursiva y determinista (`canonicalizeValue`).
2. **Generación del Hash de Operación (`payloadHash`):**
   $$\text{payloadHash} = \text{SHA-256}(\text{JSON.stringify}(\text{canonical}(\text{parameters})))$$
3. **Validación del Token HITL con `ActionGatekeeperService`:**
   En operaciones de Nivel 3 (`LEVEL_3_RESTRICTED`) o misiones sensibles:
   ```typescript
   this.actionGatekeeper.verifyAndConsumeChallenge(
     request.hitlAuthorizationToken,
     request.capabilityId,
     request.resourceScope.workspaceId,
     request.parameters,
     request.caller.actorId,
   );
   ```
4. **Garantía Fail-Closed de Consumo Único:**
   El nonce asociado al token es destruido en memoria al primer intento de uso. Cualquier repetición de la misma solicitud con el mismo token es rechazada inmediatamente con `403 Forbidden`.

---

## 5. Cuotas y Límites de Recursos por Solicitud

El Broker impone límites por defecto que no pueden ser ampliados por el LLM ni por peticiones de usuario estándar:

| Recurso | Límite por Defecto | Límite Máximo Permitido | Acción ante Infracción |
| :--- | :---: | :---: | :--- |
| **Tiempo de Ejecución (Wall Clock)** | 5.000 ms | 30.000 ms (solo en 3D) | Aborto y terminación de proceso (`SIGKILL`) |
| **Memoria de Proceso (RAM)** | 256 MB | 512 MB | Terminación por OOM en Job Object |
| **Cuota de Procesador (CPU)** | 50% de un core | 100% de un core | Throttling vía CPU Rate Control de Windows |
| **Subprocesos Concurrentes** | 1 | 5 procesos en el árbol | Error `RESOURCE_EXCEEDED` en creación |
| **Tamaño de Salida (`stdout`/`stderr`)** | 64 KB | 256 KB | Truncamiento automático con advertencia |
| **Espacio de Disco Temporal** | 50 MB | 100 MB | Rechazo de escritura (`ENOSPC`) |

---

## 6. Cancelación, Timeout y Terminación Atómica de Procesos Hijos

En entornos Windows, invocar `child.kill()` muchas veces deja procesos huérfanos o procesos zombi que continúan consumiendo recursos.

### Mecanismo de Terminación del Execution Broker:
1. **Asignación Obligatoria a Windows Job Object:**
   Al crear el subproceso en el adaptador de ejecución, este se asocia inmediatamente a un Job Object nativo de Windows configurado con `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
2. **Cierre Atómico en Cascada:**
   Al expirar el timeout o solicitarse la cancelación:
   - Se cierra el handle del Job Object (`CloseHandle(hJob)`).
   - El kernel de Windows termina instantánea y atómicamente todos los procesos que pertenecen al Job, independientemente de cuántos subprocesos hayan creado (`taskkill /F /T` nativo).

---

## 7. Registro de Auditoría Inmutable (Immutable Audit Ledger)

El Execution Broker registra cada ciclo de vida de ejecución en un libro mayor específico en disco (`storage/security/execution-audit/`):

1. **Estructura de Entrada de Auditoría:**
   - Timestamp de solicitud (`ISO-8601 UTC`).
   - `requestId`, `actorId`, `capabilityId`.
   - `payloadHash` de los parámetros.
   - Decisión del Broker (`APPROVED` / `REJECTED`).
   - Estado final (`SUCCESS`, `TIMEOUT`, `ERROR`).
   - Telemetría de recursos consumidos.
   - `previousEntryHash`: Hash SHA-256 de la entrada anterior (Hash Chaining).
2. **Inmutabilidad desde la Perspectiva del Agente:**
   - La carpeta de auditoría de ejecución está excluida de cualquier montaje en el sandbox.
   - El agente no dispone de ninguna capacidad en el `CapabilityRegistry` que apunte al directorio `storage/security/`.
   - Escrituras protegidas con `fs.fsyncSync` y permisos de sistema de archivos restringidos.

---

## 8. Conclusión de Diseño

El Execution Broker diseñado no delega confianza en el modelo ni en el planificador. Opera como una aduana matemática y determinista:
- Si la solicitud no coincide con el catálogo de capacidades: **RECHAZO INMEDIATO**.
- Si los parámetros intentan salir del workspace canónico: **RECHAZO INMEDIATO**.
- Si la operación es sensible y el token HITL no coincide criptográficamente con el payload: **RECHAZO INMEDIATO**.
- Si el proceso excede su cuota de memoria o tiempo: **TERMINACIÓN ATÓMICA**.

