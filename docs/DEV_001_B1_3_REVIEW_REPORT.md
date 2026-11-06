# DEV-001-B1.3-REVIEW — Auditoría Independiente de Remediaciones y Frontera Global de Seguridad

> **Misión:** DEV-001-B1.3-REVIEW — Auditoría Independiente de Seguridad y Frontera Global  
> **Modo:** STRICT READ-ONLY / ZERO CODE MODIFICATIONS  
> **Rama Auditada:** `security/dev-001-b`  
> **Commit Base Remoto:** `71dae1d29e27c18c4d44d4dd392f63dd4b5bc93c`  
> **Working Tree:** Modificaciones B1.3 aplicadas sobre el working tree local (sin commit ni push)  
> **Fecha:** 2026-11-06  
> **Veredicto Final:** ❌ **NO HOMOLOGADO (REQUIERE REMEDIACIÓN QUIRÚRGICA B1.3.1 ANTES DE COMMIT/PUSH)**  
> **Estado de Fase B2:** 🛑 **ESTRICTAMENTE BLOQUEADA**

---

## 1. Integridad y Estado del Repositorio

En cumplimiento estricto del mandato de la misión (Modo *Strict Read-Only*):
- **HEAD verificado inicial y final:** `71dae1d29e27c18c4d44d4dd392f63dd4b5bc93c` (exactamente igual al commit publicado en remoto).
- **Rama activa:** `security/dev-001-b`.
- **Working Tree:** 16 archivos modificados correspondientes a la implementación B1.3, 1 archivo previo de remediación (`docs/DEV_001_B1_3_REMEDIATION_REPORT.md`) y el presente informe de auditoría.
- **Mutaciones ejecutadas durante la auditoría:** **CERO (0)**. Ningún archivo de código fuente, script, prueba o configuración fue modificado, formateado o alterado.
- **Servicios productivos:** Ningún puerto (4000), base de datos de producción (`jarbees_data`), ngrok ni credenciales reales fueron accedidos.

---

## 2. Resumen Ejecutivo de la Auditoría

La auditoría independiente **DEV-001-B1.3-REVIEW** evaluó en profundidad las remediaciones introducidas en el working tree de **DEV-001-B1.3**, contrastándolas contra escenarios adversos reales: concurrencia inter-proceso, caídas abruptas de energía (*power-cut crash*), manipulación de rutas en Windows NTFS, e integridad de la frontera global de autorización.

### Conclusiones Principales:
1. **Avance Estructural en la Frontera Global (A1):** Se cerró efectivamente la exposición pública de controladores *legacy*. De los 160 endpoints de la aplicación, **únicamente 4 permanecen públicos** bajo especificaciones estrictas (`AuthController.login`, `JarvisController.getInferenceStatus`, `MobileGatewayController.getHealth`, `GoogleAuthController.callback`).
2. **Durabilidad y Fail-Closed en Anti-Replay (A2):** La retención obligatoria de archivos vacíos (0 bytes) y corruptos en `MobileGatewayService`, junto con el uso de `fsyncSync(fd)` y `openSync(O_CREAT | O_EXCL)`, previene ataques de repetición tras caídas abruptas.
3. **HALLAZGO CRÍTICO CONFIRMADO EN LOCKOUT (F-B1-02-02):** La sincronización entre procesos de `AuthService` mediante `syncBucketFromDisk()` es de **solo lectura**. No existe exclusión mutua atómica durante el ciclo *lectura-modificación-escritura*. Dos workers concurrentes sufren de la anomalía **Lost Update** (actualización perdida), perdiendo incrementos de intentos fallidos. Además, `recordFailedLogin()` omite llamar a `syncBucketFromDisk()`, los archivos temporales huérfanos (`.tmp`) no son purgados en el arranque, y el sistema carece de un mecanismo en tiempo de ejecución (ej. archivo de bloqueo PID) que impida levantar múltiples workers si la arquitectura estuviera delimitada a un único proceso.
4. **Confinamiento 3D (F-B1-10):** Las escrituras atómicas en `.tmp` y lecturas con validación de descriptores (`fstat.ino === lstat.ino`) neutralizan ventanas TOCTOU y enlaces simbólicos a nivel de archivo. Sin embargo, se identificó que la sustitución concurrente del directorio padre durante el renombrado requiere que la identidad del directorio sea validada de manera continua o protegida por permisos NTFS de carpeta.

---

## 3. Reconciliación Formal de Clasificación de Hallazgos

En respuesta a la precisión conceptual requerida, se reclasifican formalmente los 9 elementos de severidad alta de B1.2:

| Categoría Conceptual | Identificadores | Definición y Alcance |
| :--- | :--- | :--- |
| **Vulnerabilidades Técnicas de Código (7)** | `A1-01`, `A2-01`, `A2-02`, `F-B1-02-01`, `F-B1-02-02`, `F-B1-10-01`, `F-B1-10-02` | Defectos o debilidades en la lógica del código fuente que permiten evasiones, carreras o estados inseguros. |
| **Brecha de Aseguramiento y Cobertura (1)** | `TEST-01` | Carencia de pruebas automatizadas que demuestren empíricamente el comportamiento del sistema ante condiciones de estrés, concurrencia o corrupción. |
| **Restricción Operativa y Arquitectónica (1)** | `A2-03` | Limitación inherente al diseño (persistencia en sistema de archivos local NTFS vs almacenamiento distribuido multi-nodo). No es un bug de código en host único, sino una frontera operacional que debe ser restringida y garantizada por el runtime. |

---

## 4. Matriz Consolidada de Auditoría DEV-001-B1.3-REVIEW

| Identificador | Severidad | Estado B1.3-REVIEW | Archivos y Líneas | Evidencia y Hallazgo Técnico | Veredicto / Impacto |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`A1-01`** | **ALTA** | **CLOSED** | `src/upload/upload.controller.ts`<br>`src/products/products.controller.ts`<br>`src/aichat/aichat.controller.ts`<br>`src/modules/balance/balance.controller.ts`<br>`src/modules/reader/reader.controller.ts`<br>`src/modules/translator/translator.controller.ts` | Eliminación de `@Public()` en 30 métodos legacy. Verificado con `Select-String`: solo 4 handlers conservan `@Public()`. Test e2e `F8` confirma rechazo con `401 Unauthorized` ante requests sin JWT en `/upload/image`. | Subsanado completamente. |
| **`A1-02`** | **ALTA** | **CLOSED** | `src/app.module.ts:58-63` | `SecurityKernelAuthGuard` registrado como `APP_GUARD`. Se ejecuta después de `JwtAuthGuard` y antes de `ThrottlerGuard`. Orden de ejecución correcto y consistente. | Subsanado completamente. |
| **`A1-03`** | **MEDIA** | **PARTIAL** | `src/jarvis/security/security-kernel-auth.guard.ts:120, 140` | 1. La bandera de idempotencia `request.__securityKernelVerified` es una propiedad de cadena plana sobre `req`. Aunque no hay middleware vulnerable de inyección en `main.ts`, no es inmune a colisiones de propiedades o potencial contaminación de prototipo. Debe migrar a `Symbol` o `WeakSet`.<br>2. La línea 140 (`if (!rawUrl || spec.pathPattern.test(rawUrl))`) permite bypass de URL si `rawUrl` estuviera vacío. En producción, la URL debe ser obligatoria. | Riesgo residual mitigable en B1.3.1. |
| **`A2-01`** | **ALTA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts:139-147, 163` | Los archivos de 0 bytes o corruptos no se borran; se añaden a `corruptedReplayHashes`. Validado en unit test 19 y e2e `E11`. `openSync(O_CREAT \| O_EXCL)` falla cerrado ante reintentos. | Subsanado completamente. |
| **`A2-02`** | **ALTA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts:195` | `fs.fsyncSync(fd)` se ejecuta antes de `fs.closeSync(fd)`, forzando el volcado físico a disco en Windows NTFS (`FlushFileBuffers`). | Subsanado completamente. |
| **`A2-03`** | **ALTA** | **ACCEPTED RISK (CONDICIONADO)** | `src/mobile-gateway/mobile-gateway.service.ts` | El ledger en disco local NTFS no soporta multi-nodo distribuido. JarBees está delimitado a *Single-Host Deployment* con GPU RTX 5070 local. Para aceptar este riesgo formalmente, el sistema debe impedir en runtime arranques en entornos multi-nodo sin backend transaccional. | Restricción operacional aceptada para host único. |
| **`A2-04`** | **MEDIA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts:72, 124-128` | Purga activa en memoria con intervalo de 60s desreferenciado (`.unref()`). | Subsanado completamente. |
| **`A2-05`** | **BAJA** | **CLOSED** | `src/mobile-gateway/mobile-gateway.service.ts:188` | Permisos numéricos `0o600` documentados. En Windows NTFS la protección recae en los permisos de carpeta del usuario del SO. | Subsanado completamente. |
| **`F-B1-02-01`** | **ALTA** | **CLOSED** | `src/auth/auth.service.ts:189-196, 213-218` | Archivos de lockout corruptos o de 0 bytes se aíslan en `corruptedLockoutKeys`. El operador permanece bloqueado *Fail-Closed*. | Subsanado completamente. |
| **`F-B1-02-02`** | **ALTA** | **OPEN** | `src/auth/auth.service.ts:229-269, 274-299, 641-667` | **FALLO CONCURRENTE INTER-WORKER DETECTADO:**<br>1. `syncBucketFromDisk()` lee el estado, pero la secuencia lectura -> incremento -> renameSync **no es atómica entre procesos**. Dos workers concurrentes sufren *Lost Update*, incrementando 1 vez cuando ocurrieron 2 intentos fallidos.<br>2. `recordFailedLogin()` (línea 645) **NO invoca** `syncBucketFromDisk()`, desincronizando workers.<br>3. Archivos `.tmp.${uuid}` huérfanos tras caídas abruptas no se eliminan en `initLockoutStore()`.<br>4. No existe un candado en runtime (PID lockfile o mutex) que impida levantar múltiples workers si la solución solo soporta una sola instancia. | **REAPERTURA: Requiere remediación B1.3.1.** |
| **`F-B1-02-03`** | **BAJA** | **CLOSED** | `src/auth/auth.service.ts:108, 126` | `this.cleanupInterval.unref()` en constructor y limpieza en `onModuleDestroy()`. | Subsanado completamente. |
| **`F-B1-02-04`** | **MEDIA** | **ACCEPTED RISK** | `src/auth/auth.service.ts:313-324, 349-355` | 1. Mitigación: evaluación de `opKey` vinculada al operador mitiga DoS generalizado, aunque `ipKey` puede bloquear NAT compartida.<br>2. `TRUST_PROXY=true` confía en el primer salto de `X-Forwarded-For`; requiere proxy upstream que sanitice encabezados. | Aceptado como compromiso operativo de seguridad. |
| **`F-B1-10-01`** | **ALTA** | **CLOSED** | `src/jarvis/3d/services/asset-security.service.ts:238-310`<br>`src/jarvis/3d/controllers/studio-3d.controller.ts:140-146` | Escritura en archivo temporal exclusivo (`O_CREAT \| O_EXCL`) en el directorio destino, validación de descriptores (`fstat.ino === lstat.ino`), `fsyncSync` y reemplazo atómico con `renameSync`. | Subsanado completamente. |
| **`F-B1-10-02`** | **ALTA** | **CLOSED** | `src/jarvis/3d/services/asset-metadata.service.ts:305-350` | `ensureNoSymlinksInPath` implementado e invocado en `validateAuthorizedAssetPath`. Inspecciona cada componente intermedio con `lstatSync`. | Subsanado completamente. |
| **`F-B1-10-03`** | **MEDIA** | **CLOSED** | `src/jarvis/3d/services/asset-metadata.service.ts:357-379` | `readConfined3DFileBuffer` fija descriptor (`openSync`), valida `fstat(fd).ino === lstat().ino` y lee directamente del descriptor sin reabrir paths. | Subsanado completamente. |
| **`TEST-01`** | **ALTA** | **PARTIAL** | `src/jarvis/security/dev-001-b1-security-hardening.spec.ts`<br>`test/dev-001-b1-homologation.e2e-spec.ts` | Se incorporaron pruebas de concurrencia in-process (`Promise.all`) y resiliencia ante 0-bytes (80 unitarias + 43 e2e). **Brecha residual:** los tests de concurrencia corren dentro del mismo proceso de Node.js; no existía una prueba con procesos independientes (`child_process.fork`), lo que ocultó la carrera inter-proceso de `AuthService`. | Requiere prueba multi-proceso en B1.3.1. |

---

## 5. Análisis Técnico Detallado por Bloque

### 5.1. Bloque A: Guard Global y Autorización

#### Orden de Ejecución de Guards en NestJS:
En `src/app.module.ts`:
1. `JwtAuthGuard`: Evalúa `@Public()`. Si no es público, exige y valida el JWT.
2. `SecurityKernelAuthGuard`:
   - Si es público: Comprueba contra `AUTHORIZED_PUBLIC_ENDPOINT_SPECS` (Controller + Handler + Regex de Path canónico). Falla cerrado con `403 Forbidden` si no coincide exactamente.
   - Si es privado: Exige operador válido en `req.user`, valida roles y scopes RBAC, y en operaciones Nivel 3 / HITL valida y consume el token de aprobación humana.
3. `ThrottlerGuard`: Aplica cuotas por minuto.

#### Análisis de la Idempotencia (`__securityKernelVerified`):
- **Comportamiento:** Cuando `SecurityKernelAuthGuard` se ejecuta como `APP_GUARD` y el controlador también posee `@UseGuards(SecurityKernelAuthGuard)`, la bandera previene la doble ejecución y el consiguiente fallo por reutilización de token HITL de un solo uso.
- **Riesgo Identificado:** La propiedad es asignada directamente sobre `request.__securityKernelVerified`. Si bien el pipeline de Express y NestJS aísla el cuerpo (`req.body`) y encabezados (`req.headers`), el uso de una propiedad de cadena plana expone el sistema a riesgos teóricos de contaminación de prototipos (`Object.prototype.__securityKernelVerified`).
- **Recomendación B1.3.1:** Reemplazar por un identificador privado `const KERNEL_VERIFIED = Symbol('SECURITY_KERNEL_VERIFIED')` o un `WeakSet<object>()` interno en el guard.

---

### 5.2. Bloque B: Anti-Replay Durable en `MobileGatewayService`

El protocolo implementado en `MobileGatewayService` presenta garantías criptográficas y de sistema de archivos robustas:
1. **Firma HMAC Obligatoria:** `validateCommandSecurity` vincula método, ruta canónica, `requestId`, `timestamp`, `intent` y hash canónico de payload.
2. **Exclusión Mutua Atómica:** `fs.openSync(path, O_CREAT | O_EXCL, 0o600)` aprovecha las primitivas a nivel de kernel del sistema operativo (Win32 `CREATE_NEW`). Si dos llamadas compiten por el mismo `requestId`, el kernel de archivos garantiza que exactamente una obtiene el descriptor y las demás reciben `EEXIST`.
3. **Durabilidad Física:** La incorporación de `fs.fsyncSync(fd)` asegura que los bloques de datos y metadatos se vacían al controlador de disco antes de cerrar el descriptor.
4. **Resiliencia ante Caídas Abruptas:** Si un corte de energía ocurre tras `openSync` pero antes de escribir datos (generando un archivo de 0 bytes), en el arranque posterior `pruneExpiredReplays()` **no lo elimina**, sino que lo agrega a `corruptedReplayHashes`. Cualquier intento futuro de reutilizar ese `requestId` es rechazado con `403 Forbidden`.

---

### 5.3. Bloque C: Lockout de Fuerza Bruta en `AuthService` (Hallazgo F-B1-02-02)

#### Análisis de la Condición de Carrera Inter-Proceso:
Se analizó el escenario obligatorio solicitado por la misión: **Dos o más procesos de Node.js atendiendo solicitudes de login fallidas concurrentes para el mismo operador/IP.**

```
Worker 1 (Proceso A)                        Worker 2 (Proceso B)
--------------------                        --------------------
1. Lee disco: attemptsInWindow = 4           1. Lee disco: attemptsInWindow = 4
2. En memoria: 4 + 1 = 5                     2. En memoria: 4 + 1 = 5
3. Escribe .tmpA y renameSync                |
   -> Disco: attemptsInWindow = 5            3. Escribe .tmpB y renameSync
                                                -> Disco: attemptsInWindow = 5 (SOBRESCRITURA)
```

**Consecuencias Técnicas Demostradas:**
1. **Lost Update Anomaly:** Dos intentos fallidos concurrentes en procesos distintos resultan en un incremento neto de solo 1 en el disco. Un atacante con ráfagas concurrentes en un despliegue multi-worker podría enviar hasta 8-10 intentos en el lapso de un segundo antes de detonar el umbral de 5.
2. **Omisión de Sincronización en `recordFailedLogin`:** En la línea 645 de `src/auth/auth.service.ts`:
   ```typescript
   const bucket = this.bruteForceBuckets.get(key) ?? ...
   ```
   `recordFailedLogin()` lee directamente del `Map` en memoria local sin invocar `syncBucketFromDisk()`. Si el Worker 2 no ejecutó `enforceRateLimitAndLockout` recientemente para esa clave, sus fallos consecutivos locales sobreescribirán los fallos acumulados por el Worker 1.
3. **Archivos Temporales Huérfanos:** `persistLockoutBucket` genera archivos con patrón `${filePath}.${crypto.randomUUID()}.tmp`. Si el proceso es terminado abruptamente (`SIGKILL` o corte eléctrico) entre `closeSync` y `renameSync`, el archivo `.tmp` queda en `storage/security/auth-lockout/`. `initLockoutStore()` solo busca archivos terminados en `.json`, dejando basura permanente en disco.
4. **Ausencia de Bloqueo a Nivel de Sistema Operativo:** No existe un candado a nivel de proceso (ej. `process.pid` lockfile para forzar instancia única) ni un lock de archivo a nivel de SO durante la actualización del bucket.

---

### 5.4. Bloque D: Confinamiento 3D y Mitigación TOCTOU

1. **Lectura Segura:** `readConfined3DFileBuffer` abre el descriptor en modo lectura y compara `fstatSync(fd).ino === lstatSync(safePath).ino` y `fstatSync(fd).dev === lstatSync(safePath).dev`. Si un atacante reemplaza el archivo por un symlink tras la validación de ruta, la discrepancia de inodo detona `ForbiddenException`.
2. **Escritura y Reemplazo Atómico:** `writeConfinedFileAtomic` crea un temporal en el mismo directorio con `O_CREAT | O_EXCL`, ejecuta `fsyncSync`, valida nuevamente que el destino preexistente no sea un symlink, y realiza el reemplazo mediante `renameSync`.
3. **Análisis de Reparse Points y Directorios en Windows NTFS:**
   - La inspección `lstatSync.isSymbolicLink()` en Node.js sobre Windows detecta tanto symlinks como directory junctions (`IO_REPARSE_TAG_MOUNT_POINT`).
   - Sin embargo, `renameSync` opera mediante rutas de cadena. Si un atacante con acceso local modifica el directorio contenedor entre la comprobación y el renombrado, se depende enteramente de que los permisos ACL de NTFS restrinjan la escritura en `storage/assets/` al usuario de servicio de JarBees.

---

## 6. Inventario Completo de Endpoints del Sistema

Se realizó un escaneo exhaustivo de los 13 controladores de la aplicación, contabilizando **160 endpoints totales**:

| Controlador | Prefijo de Ruta | Total Endpoints | Públicos Autorizados | Privados (Kernel Guard) | Nivel RBAC / HITL |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **`AuthController`** | `/auth` | 1 | **1** (`POST /auth/login`) | 0 | Scrypt + Lockout |
| **`JarvisController`** | `/jarbees` | 93 | **1** (`GET /jarbees/inference/status`) | 92 | L1 (Read), L2 (Mutate), L3 (HITL) |
| **`MobileGatewayController`** | `/mobile/v1` | 3 | **1** (`GET /mobile/v1/health`) | 2 | L1 (`capabilities`), L2 + HMAC (`command`) |
| **`GoogleAuthController`** | `/jarbees/google` | 3 | **1** (`GET /jarbees/google/callback`) | 2 | L2 (`login`), L3 + HITL (`configure`) |
| **`Studio3DController`** | `/jarvis/3d/studio` | 14 | 0 | **14** | L1-L2 + Confinamiento estricto |
| **`AssetMetadataController`** | `/jarvis/3d/metadata` | 8 | 0 | **8** | L1-L2 + Anti-TOCTOU |
| **`PosterController`** | `/jarbees/poster` | 7 | 0 | **7** | L1-L2 + Validación de extensiones |
| **`ProductsController`** | `/products` | 5 | 0 | **5** | Privado por defecto (JWT requerido) |
| **`UploadController`** | `/upload` | 1 | 0 | **1** | Privado por defecto (JWT requerido) |
| **`AichatController`** | `/aichat` | 8 | 0 | **8** | Privado por defecto (JWT requerido) |
| **`BalanceController`** | `/balance` | 6 | 0 | **6** | Privado por defecto (JWT requerido) |
| **`ReaderController`** | `/reader` | 4 | 0 | **4** | Privado por defecto (JWT requerido) |
| **`TranslatorController`** | `/translator` | 7 | 0 | **7** | Privado por defecto (JWT requerido) |
| **TOTAL GENERAL** | — | **160** | **4 (2.5%)** | **156 (97.5%)** | **Defensa en Profundidad Global** |

---

## 7. Verificación de Evidencia de Pruebas

Se auditó el código de las pruebas automatizadas para distinguir tests reales de simples assertions:

### Conteo de Pruebas Reconciliado:
- **Suites Unitarias:** 6 archivos `.spec.ts` conteniendo **80 bloques `it()` independientes** (todos en verde, ejecución serial con `--runInBand --silent` en 14.18 s).
- **Suite e2e:** 1 archivo conteniendo **43 bloques `it()` independientes** (todos en verde, ejecución serial con `--runInBand --silent` en 16.51 s).
- **Gran Total:** **123 pruebas de seguridad automatizadas.**

### Calidad de Pruebas Específicas:
1. **Prueba `F8` (e2e):** Verifica efectivamente que `POST /upload/image` retorna `401 Unauthorized` ante una llamada sin token, demostrando que el `APP_GUARD` intercepta controladores que no tienen decoradores explícitos del Kernel.
2. **Prueba `E10` (e2e):** Ejecuta ráfagas concurrentes con `Promise.all` de 5 solicitudes con la misma firma y `requestId`. Exactamente 1 responde 200 y 4 responden `403 Forbidden` (`Ataque de repetición detectado`).
3. **Prueba `E11` (e2e):** Demuestra que un archivo de 0 bytes inyectado en `storage/security/mobile-replay/` sobrevive a un reinicio completo del servidor y bloquea repeticiones en modo *Fail-Closed*.
4. **Limitación de Cobertura Detectada:** No existe ninguna prueba que utilice procesos independientes del sistema operativo (`child_process.fork` o múltiples workers de Node.js). Todas las pruebas de concurrencia se ejecutan dentro del mismo proceso y bucle de eventos, lo que enmascaró la condición de carrera inter-proceso de `AuthService`.

---

## 8. Riesgos Residuales

1. **Riesgo `F-B1-02-02` (Actualizaciones Concurrentes en Lockout):** Dos workers pueden desincronizar el contador de intentos fallidos durante ráfagas simultáneas. Si JarBees opera en modo de proceso único (single worker), este riesgo está dormido en producción nominal, pero se convierte en crítico si se inicia con `--instances max` o clustering.
2. **Riesgo `A2-03` (Multi-nodo):** Restringido explícitamente a host único. Despliegues distribuidos en múltiples servidores requerirán un almacén transaccional distribuido (Redis / PostgreSQL con locks de fila).
3. **Riesgo `A1-03` (Manipulación de propiedad de request):** La bandera `__securityKernelVerified` debe blindarse con `Symbol` para impedir cualquier interferencia por contaminación de prototipo.

---

## 9. Veredicto Final y Hoja de Ruta

### Veredicto: ❌ **NO HOMOLOGADO**

> [!CAUTION]
> **No se autoriza el commit ni el push de B1.3.**  
> Si bien la frontera de autorización global (A1) y el anti-replay (A2) han alcanzado un estándar de producción sobresaliente, el mecanismo de persistencia y sincronización de fuerza bruta en `AuthService` (`F-B1-02-02`) contiene una carrera de concurrencia inter-proceso (*Lost Update*) y omisión de sincronización en `recordFailedLogin` que viola el principio de exclusión mutua estricta.

### Próximo Paso Recomendado: Misión B1.3.1 (Remediación Quirúrgica)
Abrir la micro-misión **`DEV-001-B1.3.1`** para subsanar exclusivamente:
1. **Coordinación de Lockout en `AuthService`:**
   - Incorporar `syncBucketFromDisk()` en `recordFailedLogin()`.
   - Limpiar archivos temporales huérfanos (`*.tmp`) en `initLockoutStore()` y en la purga periódica.
   - Implementar un candado de proceso único estricto (ej. `SingleInstanceLockService` con archivo PID en `storage/security/jarbees.pid` o mutex de SO) que garantice que JarBees no pueda ser iniciado en modo multi-worker sin un gestor de locks transaccional distribuido.
2. **Blindaje de Idempotencia en `SecurityKernelAuthGuard`:**
   - Reemplazar `request.__securityKernelVerified` por un `Symbol('SECURITY_KERNEL_VERIFIED')`.
   - Exigir `rawUrl` no vacío en entornos fuera de testing.
3. **Prueba Adversarial Multi-Proceso:**
   - Agregar una prueba con `child_process.fork` que valide que dos procesos concurrentes no pueden violar la frontera de lockout o anti-replay.

Una vez implementada la B1.3.1 y validada, se procederá a consolidar el commit, push y la homologación formal de la Fase B1. **La Fase B2 permanece estrictamente bloqueada.**

