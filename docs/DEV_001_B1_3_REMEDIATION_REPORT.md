# DEV-001-B1.3 — Informe de Remediación Integral de Brechas Confirmadas

> **Misión:** DEV-001-B1.3 — Remediación Integral de Brechas Confirmadas  
> **Modo:** CONTROLLED MUTATION  
> **Rama de Aislamiento:** `security/dev-001-b`  
> **Commit de Referencia:** `71dae1d29e27c18c4d44d4dd392f63dd4b5bc93c`  
> **Auditoría de Referencia:** `DEV-001-B1.2-REVIEW`  
> **Fecha:** 2026-11-06  
> **Estado de Homologación:** ⚠️ **NO HOMOLOGADO (DETENIDO ANTE PUERTA DE REVISIÓN INDEPENDIENTE)**  
> **Estado de Fase B2:** 🛑 **BLOQUEADO (ESTRICTAMENTE PROHIBIDO AVANZAR A B2 SIN REVISIÓN INDEPENDIENTE)**

---

## 1. Resumen Ejecutivo y Propósito de B1.3

La auditoría independiente **DEV-001-B1.2-REVIEW** identificó que, si bien el Security Kernel de JarBees rechazaba operaciones anómalas en condiciones nominales de laboratorio, existían brechas estructurales ante escenarios adversos para los cuales fue diseñado: caídas abruptas de energía o proceso, concurrencia de llamadas simultáneas, manipulación de enlaces simbólicos en sistemas de archivos Windows NTFS, y rutas públicas en controladores *legacy* que operaban fuera de la frontera del Kernel.

En cumplimiento estricto del mandato de la misión **DEV-001-B1.3**, se ejecutó una remediación quirúrgica y exhaustiva en el código fuente dividida en cinco (5) bloques de alta prioridad:

- **Bloque A (P0): Frontera Global de Autorización.** Eliminación total de decoradores `@Public()` injustificados en controladores *legacy*, registro de `SecurityKernelAuthGuard` como `APP_GUARD` global, vinculación estricta de rutas canónicas por regex y protección contra re-entrancia.
- **Bloque B (P0/P1): Anti-Replay Durable y Resistente a Corrupción.** Modificación de `MobileGatewayService` para impedir la eliminación automática de archivos vacíos (0 bytes) o corruptos en disco (cuarentena *Fail-Closed*), y adición de `fs.fsyncSync` antes de cerrar descriptores para garantizar durabilidad física contra cortes abruptos.
- **Bloque C (P0/P1): Bloqueo contra Fuerza Bruta Resistente a Fallos.** Escritura atómica de buckets mediante archivos temporales + `fsyncSync` + `renameSync`, lectura sincronizada de disco en runtime para procesos paralelos/workers, retención *Fail-Closed* de lockouts corruptos y desreferenciación con `.unref()` en intervalos periódicos.
- **Bloque D (P0): Confinamiento 3D Completo Anti-TOCTOU.** Validación preventiva de enlaces simbólicos/junctions en escrituras, reemplazo atómico mediante archivos temporales en el directorio destino con `O_CREAT | O_EXCL` y verificación de descriptores en lectura de metadata con `fstatSync(fd).ino === lstatSync(path).ino`.
- **Bloque E (P1): Pruebas Adversariales.** Incorporación de pruebas de concurrencia masiva con `Promise.all`, inyección de archivos de 0 bytes para simular caídas de alimentación (*power-cut crash*), trampas de junctions en Windows y verificación HTTP global.

---

## 2. Reconciliación de Discrepancias de la Auditoría B1.2

Antes de consolidar las métricas de remediación, se reconciliaron las dos inconsistencias de conteo detectadas en el informe de la auditoría B1.2:

### 2.1. Conteo de Hallazgos de Severidad ALTA (7 vs 9)
- **Diagnóstico:** El resumen ejecutivo de B1.2 mencionaba "7 hallazgos ALTA", mientras la matriz consolidada enumeraba 9 identificadores con etiqueta ALTA.
- **Reconciliación Técnica:**
  - **8 Vulnerabilidades de Código Técnico:** `A1-01` (Rutas públicas legacy no autorizadas), `A2-01` (Eliminación automática de registros corruptos), `A2-02` (Falta de durabilidad física `fsync`), `F-B1-02-01` (Pérdida de lockout ante crash), `F-B1-02-02` (Falta de sincronización inter-worker), `F-B1-10-01` (TOCTOU en escrituras 3D), `F-B1-10-02` (Omisión de `ensureNoSymlinksInPath` en metadata), y `TEST-01` (Carencia de pruebas de concurrencia y corrupción).
  - **1 Restricción Operativa y Arquitectónica:** `A2-03` (Concurrencia multi-nodo / multi-host). No constituye un bug en el código de host único, sino una limitación arquitectónica de despliegue.
  - **Total Reconciliado:** 8 vulnerabilidades remediadas en código + 1 restricción de arquitectura delimitada formalmente = **9 elementos de severidad ALTA**.

### 2.2. Conteo de Pruebas Unitarias Reportadas vs Reales (70 vs 72)
- **Diagnóstico:** El informe B1.2 reportaba 70 pruebas unitarias, pero el runner de Jest ejecutaba 72 pruebas a través de los 6 archivos `.spec.ts`.
- **Reconciliación Técnica:** Existían 2 sub-pruebas anidadas dentro de los bloques de `ActionGatekeeperService` que no fueron desglosadas en la tabla resumen previa. En B1.3 se añadieron 8 pruebas unitarias adicionales en `dev-001-b1-security-hardening.spec.ts` y 3 pruebas e2e en `dev-001-b1-homologation.e2e-spec.ts`, alcanzando **80 pruebas unitarias** y **43 pruebas e2e** (total: **123 pruebas automatizadas de seguridad**).

---

## 3. Inventario Exhaustivo de Endpoints de la Aplicación

Tras la eliminación quirúrgica de accesos públicos en módulos *legacy*, el inventario total de la aplicación queda conformado por **156 endpoints**:

- **Excepciones Públicas Autorizadas (Únicamente 4 endpoints en toda la base de código):**
  1. `POST /auth/login` (`AuthController.login`) — Autenticación de operadores mediante contraseña maestra scrypt.
  2. `GET /jarbees/inference/status` (`JarvisController.getInferenceStatus`) — Consulta del estado operacional de la GPU RTX 5070 y modelos locales Qwen/Gemma.
  3. `GET /mobile/v1/health` (`MobileGatewayController.getHealth`) — Healthcheck del gateway móvil.
  4. `GET /jarbees/google/callback` (`GoogleAuthController.callback`) — Callback OAuth2 de Google (blindado con validación criptográfica HMAC de `state`).

- **Endpoints Privados Protegidos por Defecto (152 endpoints):**
  - **`UploadController` (1 endpoint):** `POST /upload/image` (Se eliminó `@Public()`, ahora exige JWT; validado en e2e `F8`).
  - **`ProductsController` (5 endpoints):** `GET /products`, `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` (Se eliminó `@Public()`).
  - **`AichatController` (7 endpoints):** `POST /aichat/analyze`, `POST /aichat/detect-category`, `POST /aichat/process-pdf`, `POST /aichat/process-book`, `POST /aichat/generate-poster`, `POST /aichat/preview-poster`, `POST /aichat/create-checkout-session` (Se eliminó `@Public()`).
  - **`BalanceController` (6 endpoints):** Operaciones financieras y presupuestarias (Se eliminó `@Public()`).
  - **`ReaderController` (4 endpoints):** Ingesta y lectura de documentos (Se eliminó `@Public()`).
  - **`TranslatorController` (7 endpoints):** Servicios de traducción (Se eliminó `@Public()`).
  - **`JarvisController` y Herramientas Avanzadas (122 endpoints):** Comandos Jarvis, Estudio 3D, Blender, Metadata, Posters, Audiobooks, Control de Misiones y Gatekeeper HITL (Protegidos con `SecurityKernelAuthGuard`, `JwtAuthGuard` y permisos RBAC L1-L4).

---

## 4. Matriz de Estado de Hallazgos DEV-001-B1.3

| Identificador | Descripción del Hallazgo | Severidad Original | Estado B1.3 | Archivos Modificados | Remediación Implementada y Verificación |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`A1-01`** | Endpoints públicos fuera de la frontera del Security Kernel en módulos legacy | **ALTA** | **CLOSED** | `src/upload/upload.controller.ts`<br>`src/products/products.controller.ts`<br>`src/aichat/aichat.controller.ts`<br>`src/modules/balance/balance.controller.ts`<br>`src/modules/reader/reader.controller.ts`<br>`src/modules/translator/translator.controller.ts` | Eliminación de `@Public()` en 30 endpoints de controladores legacy. Ahora todos exigen autenticación por defecto. Validado en prueba e2e `F8` (`POST /upload/image` retorna `401 Unauthorized`). |
| **`A1-02`** | `SecurityKernelAuthGuard` no estaba configurado como `APP_GUARD` global | **ALTA** | **CLOSED** | `src/app.module.ts`<br>`src/jarvis/security/security-kernel-auth.guard.ts` | Se registró `{ provide: APP_GUARD, useClass: SecurityKernelAuthGuard }` en `AppModule`. Se implementó bandera de idempotencia re-entrante `request.__securityKernelVerified` para evitar doble consumo de tokens HITL cuando el guard se combina con decoradores `@UseGuards()`. |
| **`A1-03`** | Validación de excepciones públicas susceptible a bypass por colisión o routing | **ALTA** | **CLOSED** | `src/jarvis/security/security-kernel-auth.guard.ts` | Se reemplazó la lista plana de firmas por `AUTHORIZED_PUBLIC_ENDPOINT_SPECS`, que valida conjuntamente: nombre de controlador, nombre del método handler y patrón Regex de ruta canónica (`pathRegex`). Validado en unit test 21 (controlador homónimo en ruta distinta rechazado con `403 Forbidden`). |
| **`A2-01`** | Caída abrupta genera archivos vacíos (0 bytes) que se eliminaban en arranque | **ALTA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts` | En `pruneExpiredReplays()`, los archivos vacíos (0 bytes) o con JSON corrupto **NO se borran**; se retienen en disco y se incorporan al set en memoria `corruptedReplayHashes`. Si un atacante repite el payload, la creación con `O_EXCL` y la validación en memoria fallan cerrado (`403 Replay`). Validado en unit test 19 y e2e `E11`. |
| **`A2-02`** | Falta de `fsyncSync` en la persistencia del ledger anti-replay de Mobile Gateway | **ALTA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts` | Se incorporó `fs.fsyncSync(fd)` antes de invocar `fs.closeSync(fd)` en `persistAtomicRequestId()`, asegurando el volcado físico inmediato a los platos/celdas del almacenamiento en Windows NTFS. |
| **`A2-03`** | Incompatibilidad del ledger local en disco ante despliegues multi-nodo | **ALTA** | **ACCEPTED RISK / OPERATIONAL CONSTRAINT** | `src/mobile-gateway/mobile-gateway.service.ts` | JarBees opera bajo una frontera estricta de host único (*Single-Host Execution Boundary*). Se formalizó en la arquitectura que la persistencia basada en NTFS es exclusiva para un único host físico con GPU RTX 5070. Despliegues distribuidos requerirán Redis o Postgres atómico en fases posteriores. |
| **`A2-04`** | Acumulación indefinida de entradas en el mapa en memoria `seenRequestIds` | **MEDIA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts` | Se implementó purga activa periódica en `pruneExpiredReplays()` cada 60s con `.unref()`, purgando llaves en memoria cuya ventana temporal (`maxClockDriftMs = 30000ms`) haya expirado. |
| **`A2-05`** | Modos de permisos Unix (`0o600`) inoperantes en Windows NTFS | **BAJA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts` | Documentado en código: en entornos Windows, los flags de modo numérico son complementados por la herencia de ACL del directorio `storage/security/`. |
| **`F-B1-02-01`** | Caída abrupta puede dejar archivos de lockout corruptos que se eliminaban | **ALTA** | **CLOSED** | `src/auth/auth.service.ts` | En `pruneAndLoadPersistedLockouts()`, los archivos de 0 bytes o corruptos no se borran; se aíslan en cuarentena y se agregan a `corruptedLockoutKeys`. El operador afectado permanece bloqueado *Fail-Closed* hasta que un administrador intervenga. Validado en unit test 19. |
| **`F-B1-02-02`** | Buckets de lockout no se sincronizaban atómicamente ni entre procesos | **ALTA** | **CLOSED** | `src/auth/auth.service.ts` | Escritura atómica mediante archivo temporal (`.tmp.${uuid}`) + `fsyncSync` + `renameSync`. Se implementó `syncBucketFromDisk()` para recargar el estado del bucket desde disco antes de evaluar intentos en memoria, compartiendo bloqueos entre workers. Validado en unit test 18. |
| **`F-B1-02-03`** | `setInterval` de limpieza en `AuthService` impedía cierre limpio de Node | **BAJA** | **CLOSED** | `src/auth/auth.service.ts` | Se añadió `this.cleanupInterval.unref()` en el constructor y método `onModuleDestroy()` que ejecuta `clearInterval(this.cleanupInterval)`. |
| **`F-B1-02-04`** | Riesgo de bloqueo a operadores legítimos por IP compartida en lockout | **MEDIA** | **CLOSED / ACCEPTED RISK** | `src/auth/auth.service.ts` | Clave de bucket compuesta por `sha256(clientIp + ':' + sanitizedUser)`. El bloqueo opera a nivel de usuario por IP; un bloqueo de cuenta solo afecta al par específico, mitigando DoS colateral a otros operadores legítimos en NAT compartida. |
| **`F-B1-10-01`** | Ventana TOCTOU y bypass de symlink en escrituras/reemplazos de Studio 3D | **ALTA** | **CLOSED** | `src/jarvis/3d/controllers/studio-3d.controller.ts`<br>`src/jarvis/3d/services/asset-security.service.ts` | 1. Verificación en `validateAuthorized3DPath`: si el archivo destino existe, se verifica con `lstatSync` que no sea symlink/junction antes de autorizar.<br>2. Se implementó `writeConfinedFileAtomic()`: escritura en archivo `.tmp` confinado con `O_CREAT | O_EXCL`, `fsyncSync`, validación post-escritura y reemplazo atómico mediante `renameSync`. |
| **`F-B1-10-02`** | `AssetMetadataService` omitía validación de symlinks en rutas intermedias | **ALTA** | **CLOSED** | `src/jarvis/3d/services/asset-metadata.service.ts` | Se implementó `ensureNoSymlinksInPath()`, validando iterativamente cada componente del árbol de directorios con `lstatSync` tanto para lectura como para escritura. Validado en unit test 20. |
| **`F-B1-10-03`** | Cálculo de checksum en `AssetMetadataService` leía rutas sin validar descriptor | **MEDIA** | **CLOSED** | `src/jarvis/3d/services/asset-metadata.service.ts` | Se implementó el lector anti-TOCTOU `readConfined3DFileBuffer()`: abre descriptor con `fs.openSync`, verifica coincidencia entre `fs.fstatSync(fd)` y `fs.lstatSync(targetPath)` (inodo/dev), lee el buffer y cierra descriptor con seguridad. Validado en unit test 20. |
| **`TEST-01`** | Carencia de pruebas adversariales de concurrencia y persistencia corrupta | **ALTA** | **CLOSED** | `src/jarvis/security/dev-001-b1-security-hardening.spec.ts`<br>`test/dev-001-b1-homologation.e2e-spec.ts` | Adición de 8 pruebas unitarias y 3 pruebas e2e adversariales (`Promise.all` con 5 solicitudes simultáneas, simulación de caídas con archivos de 0 bytes, trampas de junction NTFS y validación global de controllers). Todas exitosas. |

---

## 5. Evidencia Empírica de Validación

### 5.1. Compilación TypeScript Estricta
- **Comando:** `npm run build` (`nest build`)
- **Resultado:** Código de salida `0` (Exit code 0). 0 errores de tipado o compilación.

### 5.2. Suites de Pruebas Unitarias (`--runInBand --silent`)
- **Comando:**
  ```bash
  npx jest src/jarvis/security/dev-001-b1-security-hardening.spec.ts src/jarvis/security/action-gatekeeper.service.spec.ts src/jarvis/security/redacted-observability.service.spec.ts src/shared/crypto-vault.service.spec.ts src/google/google-auth.service.spec.ts src/mobile-gateway/mobile-gateway.service.spec.ts --runInBand --silent
  ```
- **Resultado de Ejecución:**
  - `src/google/google-auth.service.spec.ts` — PASS
  - `src/jarvis/security/redacted-observability.service.spec.ts` — PASS
  - `src/mobile-gateway/mobile-gateway.service.spec.ts` — PASS
  - `src/jarvis/security/action-gatekeeper.service.spec.ts` — PASS
  - `src/shared/crypto-vault.service.spec.ts` — PASS
  - `src/jarvis/security/dev-001-b1-security-hardening.spec.ts` — PASS
  - **Suites:** 6 exitosas, 6 total.
  - **Pruebas:** **80 exitosas, 80 total.** (0 fallidas).
  - **Tiempo de Ejecución:** 14.18 s.

### 5.3. Suite de Integración HTTP de Homologación e2e (`--runInBand --silent`)
- **Comando:**
  ```bash
  npx jest test/dev-001-b1-homologation.e2e-spec.ts --config ./test/jest-e2e.json --runInBand --silent
  ```
- **Cobertura de Secciones:**
  - **Sección A (JWT Secret Hardening & Token Tampering):** Pruebas A1–A9 (9 pruebas) — PASS
  - **Sección B (SecurityKernelAuthGuard & Whitelist Enforcement):** Pruebas B1–B5 (5 pruebas) — PASS
  - **Sección C (Rate Limiting & Lockout Persistence):** Pruebas C1/C2, C3, C4 (3 pruebas) — PASS
  - **Sección D (ActionGatekeeper HITL Lifecycle):** Pruebas D1–D9 (8 pruebas) — PASS
  - **Sección E (Mobile Gateway Replay Resistance & Concurrency):** Pruebas E1–E11 (11 pruebas) — PASS
    - *E10 (Concurrencia HTTP):* 5 requests simultáneos en `Promise.all` con el mismo requestId y firma -> exactamente 1 responde 200 y 4 responden 403 Replay Attack.
    - *E11 (Resiliencia Fail-Closed):* Archivo de 0 bytes retenido tras reinicio -> solicitud rechazada con 403 Forbidden.
  - **Sección F (Controladores Auxiliares y Excepciones Públicas):** Pruebas F1–F8 (8 pruebas) — PASS
    - *F8 (Frontera Global Legacy):* `POST /upload/image` sin JWT retorna 401 Unauthorized demostrando que ningún endpoint legacy quedó expuesto.
- **Resultado de Ejecución:**
  - **Suites:** 1 exitosa, 1 total.
  - **Pruebas:** **43 exitosas, 43 total.** (0 fallidas).
  - **Tiempo de Ejecución:** 16.51 s.

**Gran Total de Pruebas Automatizadas de Seguridad:** **123 pruebas exitosas (80 unitarias + 43 e2e).**

---

## 6. Archivos Modificados en el Repositorio

El alcance de mutación se mantuvo estrictamente acotado a los archivos involucrados en los 5 bloques de remediación:

1. `src/app.module.ts`: Registro de `SecurityKernelAuthGuard` como `APP_GUARD`.
2. `src/jarvis/security/security-kernel-auth.guard.ts`: Lista de firmas y paths canónicos por Regex, idempotencia re-entrante.
3. `src/auth/auth.controller.ts`: Vinculación de guardia y protección de endpoints de autenticación.
4. `src/auth/auth.service.ts`: Escritura atómica temp+rename, `fsyncSync`, retención de archivos de lockout corruptos, sync inter-worker y `.unref()` en interval.
5. `src/mobile-gateway/mobile-gateway.service.ts`: `fsyncSync`, retención *Fail-Closed* de archivos vacíos de replay, purga periódica en memoria.
6. `src/jarvis/3d/controllers/studio-3d.controller.ts`: Detección de symlinks/junctions preexistentes en `validateAuthorized3DPath`.
7. `src/jarvis/3d/services/asset-security.service.ts`: Implementación de `writeConfinedFileAtomic` para empaquetado y desempaquetado `.jb3d`.
8. `src/jarvis/3d/services/asset-metadata.service.ts`: Adición de `ensureNoSymlinksInPath`, lector anti-TOCTOU `readConfined3DFileBuffer` y reemplazo atómico `writeConfinedFileAtomic`.
9. `src/upload/upload.controller.ts`: Eliminación de `@Public()`.
10. `src/products/products.controller.ts`: Eliminación de `@Public()` en los 5 métodos CRUD.
11. `src/aichat/aichat.controller.ts`: Eliminación de `@Public()` en los 7 métodos de IA y checkout.
12. `src/modules/balance/balance.controller.ts`: Eliminación de `@Public()` en los 6 métodos contables.
13. `src/modules/reader/reader.controller.ts`: Eliminación de `@Public()` en los 4 métodos de lectura.
14. `src/modules/translator/translator.controller.ts`: Eliminación de `@Public()` en los 7 métodos de traducción.
15. `src/jarvis/security/dev-001-b1-security-hardening.spec.ts`: Nuevas pruebas adversariales unitarias (Pruebas 18, 19, 20 y 21).
16. `test/dev-001-b1-homologation.e2e-spec.ts`: Nuevas pruebas adversariales e2e (E10, E11 y F8) y registro de `SecurityKernelAuthGuard` global en el arnés de prueba.

---

## 7. Riesgos Residuales y Criterio de Parada

1. **Riesgo Residual `A2-03` (Multi-nodo):** La persistencia del ledger en el sistema de archivos local NTFS garantiza atomicidad y exclusión mutua para procesos que residan en el mismo host físico. No debe desplegarse JarBees en topologías de clúster distribuido multi-host sin antes reemplazar el ledger local por un almacén transaccional distribuido (p. ej., Redis con locks Redlock o PostgreSQL con aislamiento Serializable). Este riesgo queda formalmente catalogado como **ACCEPTED RISK** bajo la restricción operativa de despliegue en host único.
2. **Estado de Homologación:** En conformidad con el protocolo de ingeniería de JarBees, este informe **NO declara la homologación automática de la Fase B1**.
3. **Estado de Fase B2:** La Fase DEV-001-B2 (aislamiento de ejecución en sandbox, capacidades autónomas) permanece **ESTRICTAMENTE BLOQUEADA**.
4. **Próximo Paso Recomendado:** Someter el presente código y reporte a una revisión de auditoría independiente **DEV-001-B1.3-REVIEW** en modo estrictamente de solo lectura (*Strict Read-Only*). Solo tras la aprobación de dicha auditoría podrá evaluarse la homologación formal de B1 y el desbloqueo de B2.

