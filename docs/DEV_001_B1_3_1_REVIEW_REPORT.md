# DEV-001-B1.3.1-REVIEW — Auditoría Independiente del Lock de Instancia y Cierre de B1

> **Misión:** DEV-001-B1.3.1-REVIEW — Auditoría Independiente del Lock de Instancia y Cierre de B1  
> **Modo:** STRICT READ-ONLY / ZERO CODE MODIFICATIONS  
> **Rama Auditada:** `security/dev-001-b`  
> **Commit Base Remoto:** `71dae1d29e27c18c4d44d4dd392f63dd4b5bc93c`  
> **Working Tree:** Modificaciones B1.3 y B1.3.1 aplicadas localmente (sin commit ni push)  
> **Fecha:** 2026-11-06  
> **Veredicto Técnico:** ⚖️ **HOMOLOGABLE CON RESTRICCIONES OPERACIONALES FORMALES**  
> **Estado de Homologación:** ⚠️ **PENDIENTE DE AUTORIZACIÓN DEL OPERADOR (CERO COMMIT / CERO PUSH)**  
> **Estado de Fase B2:** 🛑 **ESTRICTAMENTE BLOQUEADA HASTA LA HOMOLOGACIÓN FORMAL**

---

## 1. Integridad y Estado del Repositorio

En estricta observancia de las restricciones absolutas de la misión (Modo *Strict Read-Only*):
- **HEAD verificado inicial y final:** `71dae1d29e27c18c4d44d4dd392f63dd4b5bc93c` (coincidencia binaria exacta con el commit publicado en remoto).
- **Rama activa:** `security/dev-001-b`.
- **Working Tree:** 17 archivos modificados, 2 archivos de servicio/helper nuevos, 1 archivo de especificación nuevo y los informes en `docs/`.
- **Mutaciones ejecutadas durante la auditoría:** **CERO (0)**. Ningún archivo de código fuente, script, prueba o configuración fue modificado, formateado o alterado.
- **Servicios productivos:** Ningún puerto (4000), base de datos de producción (`jarbees_data`), ngrok ni credenciales reales fueron accedidos.

---

## 2. Resumen Ejecutivo de la Auditoría

La auditoría independiente **DEV-001-B1.3.1-REVIEW** examinó las remediaciones implementadas en el working tree de **DEV-001-B1.3.1** para determinar si el backend de JarBees resiste de forma verificable los escenarios de concurrencia inter-proceso, caídas abruptas de energía, manipulación de rutas e integridad de la memoria.

### Conclusiones Principales:
1. **Exclusión Mutua Atómica a Nivel de SO (`F-B1-02-02`):** La adopción de la *Alternativa A (Single-Instance Enforcement)* mediante [`SingleInstanceLockService`](file:///c:/Projects/productos_crud_bkd/src/auth/single-instance-lock.service.ts) vinculando de forma exclusiva el socket loopback TCP `127.0.0.1:40199` resuelve de raíz la anomalía *Lost Update*. Dos procesos no pueden iniciar simultáneamente en el mismo host.
2. **Cero Bloqueo Permanente (Crash-Proof):** La prueba adversarial inter-proceso con `child_process.fork` demostró que la terminación abrupta con `SIGKILL` libera instantáneamente el socket a nivel de kernel de Windows/POSIX, permitiendo que una nueva instancia arranque de inmediato sin deadlocks por archivos obsoletos.
3. **Idempotencia Criptográfica (`A1-03`):** Se erradicó la propiedad de cadena plana `request.__securityKernelVerified`, sustituyéndola por un `WeakSet<object>` privado en [`SecurityKernelAuthGuard`](file:///c:/Projects/productos_crud_bkd/src/jarvis/security/security-kernel-auth.guard.ts). Es invulnerable a inyecciones HTTP o contaminación de prototipos.
4. **Validación de `rawUrl` Esclarecida:** Se confirmó que `rawUrl` es una constante local del guard derivada de `req.originalUrl ?? req.url`, ambas propiedades nativas y estándar de Express y Node.js. No existe riesgo de falsos positivos en producción; las cuatro excepciones públicas autorizadas operan correctamente.
5. **Tratamiento de Temporales:** La purga de archivos `.tmp` mayores a 5000 ms previene la acumulación de archivos abandonados. En el modelo de instancia única, la sincronía del bucle de eventos de Node.js garantiza que la purga periódica jamás interrumpa una escritura activa sincrónica.

---

## 3. Auditoría Detallada de `SingleInstanceLockService`

### 3.1. Adquisición y Exclusión Mutua
- **Mecanismo:** `net.createServer().listen({ host: '127.0.0.1', port: 40199, exclusive: true })`.
- **Comportamiento en Windows/NTFS:** El flag `exclusive: true` establece la opción de socket `SO_EXCLUSIVEADDRUSE` en la API Winsock2. Esto impide que cualquier otro proceso en el sistema operativo (incluso con privilegios de Administrador) pueda realizar un bind sobre el mismo puerto o una interfaz superpuesta.
- **Detección de Colisión:** Cuando un segundo proceso intenta iniciar, la llamada `bind()` es rechazada atómicamente por el kernel con `WSAEADDRINUSE` (mapeado a `EADDRINUSE` por libuv).
- **Manejo de Errores:** En la línea 82 de [`single-instance-lock.service.ts`](file:///c:/Projects/productos_crud_bkd/src/auth/single-instance-lock.service.ts), `err.code === 'EADDRINUSE'` es capturado e interpretado para leer `jarbees-instance.lock` y emitir un `SingleInstanceLockException` que detiene el proceso antes de habilitar el servicio.
- **Fail-Closed:** Si ocurre cualquier otro error en el socket (ej. falta de descriptores), el servicio falla cerrado rechazando la promesa de adquisición.

### 3.2. Ciclo de Vida e Integración con NestJS
- **Arranque:** `AuthService.onModuleInit()` invoca `await this.acquireInstanceLock()`. Si el lock no es adquirido, NestJS aborta el arranque (`bootstrap error`) y el servidor HTTP en el puerto 4000 jamás inicia.
- **Validación en Runtime:** En `AuthService.login()`, la instrucción `this.assertInstanceLock()` verifica que el lock permanezca activo antes de evaluar credenciales o contadores de fuerza bruta.
- **Apagado Ordenado:** `onModuleDestroy()` cierra el listener TCP y elimina el archivo `jarbees-instance.lock` únicamente si el UUID coincide con la instancia propietaria.
- **Recuperación tras SIGKILL:** Validado empíricamente en la prueba unitaria inter-proceso `Paso 3 & 4`: el SO recupera los recursos de inmediato; una nueva instancia adquiere el lock sin necesidad de borrar archivos a mano.

### 3.3. Límites y Riesgos del Listener Loopback
1. **Riesgo de Denegación de Servicio por Ocupación Previa:** Si un proceso local ajeno a JarBees ocupa el puerto `40199` antes del inicio, JarBees interpretará que ya existe una instancia y se negará a arrancar. **Mitigación:** El puerto es configurable mediante `JARBEES_INSTANCE_MUTEX_PORT`.
2. **Conexiones al Listener Mutex:** El servidor TCP en `40199` es un mutex de reserva; no procesa tráfico de aplicación. **Observación menor:** Si un proceso local abre conexiones al puerto `40199`, permanecen en el backlog del kernel. Se recomienda para B2 agregar `srv.on('connection', (sock) => sock.destroy())` para rechazar conexiones de inmediato.
3. **Límite de Aislamiento por Namespaces:** El listener loopback garantiza exclusión mutua por namespace de red. Si se ejecutan dos contenedores Docker con namespaces de red independientes compartiendo el mismo volumen en disco, el lock TCP no detectará al otro contenedor. **Conclusión:** La garantía es válida para el host físico del SO o contenedores con `network_mode: host`.

---

## 4. Auditoría de `AuthService` y Persistencia del Lockout

Se verificó el flujo completo de autenticación y persistencia:
1. **Sincronización Previa en `recordFailedLogin()`:**  
   En la línea 727 de [`src/auth/auth.service.ts`](file:///c:/Projects/productos_crud_bkd/src/auth/auth.service.ts):
   ```typescript
   bucket = this.syncBucketFromDisk(key, bucket, now);
   bucket.consecutiveFailures += 1;
   ```
   Se corrigió la omisión de B1.3. Ahora `recordFailedLogin()` recarga el estado del bucket desde disco antes de incrementar, garantizando que los fallos acumulados en reinicios o persistencia se contabilicen de forma estricta.
2. **Operación Condicionada al Lock:**  
   `login()` ejecuta `this.assertInstanceLock()` en el paso 0. Si la instancia no adquirió el socket mutex, arroja `SingleInstanceLockException` y no procesa solicitudes.
3. **Escritura Atómica Segura:**  
   `persistLockoutBucket()` escribe en `.tmp.${uuid}`, ejecuta `fs.fsyncSync(fd)`, cierra descriptor y renombra atómicamente con `fs.renameSync`.
4. **Cuarentena Fail-Closed:**  
   Archivos de 0 bytes o con JSON corrupto no se borran en arranque; se añaden a `corruptedLockoutKeys`, bloqueando al operador afectado hasta intervención manual.

---

## 5. Auditoría Específica de Archivos Temporales

Se evaluó en detalle el método `pruneOrphanedTempFiles()` en [`src/auth/auth.service.ts`](file:///c:/Projects/productos_crud_bkd/src/auth/auth.service.ts#L187):

```typescript
private pruneOrphanedTempFiles(): void {
  const now = Date.now();
  const ORPHAN_THRESHOLD_MS = 5000; // >5s considerado abandonado
  ...
}
```

### Análisis Adversarial de Concurrencia en Temporales:
- **¿Puede la purga borrar un temporal en escritura activa?**
  1. En `AuthService`, las funciones `persistLockoutBucket()` y `pruneOrphanedTempFiles()` son **estrictamente sincrónicas** (`openSync`, `writeFileSync`, `fsyncSync`, `renameSync`, `readdirSync`, `unlinkSync`).
  2. En Node.js, el bucle de eventos (*event loop*) es de un solo hilo. Un temporizador como `cleanupInterval` (60s) solo puede ejecutarse cuando la pila de llamadas sincrónica está vacía.
  3. Por ende, es **físicamente imposible** que `pruneOrphanedTempFiles()` se ejecute mientras `persistLockoutBucket()` está escribiendo en el temporal.
  4. La escritura sincrónica toma <1 ms en SSD/NVMe. Para cuando la función termina, el archivo temporal ya ha sido renombrado al archivo definitivo `.json` o eliminado en el bloque `catch`.
  5. Durante el arranque (`initLockoutStore`), el lock de instancia ya fue adquirido, por lo que ningún otro proceso de JarBees está escribiendo. Cualquier archivo `.tmp` encontrado en disco pertenece obligatoriamente a una instancia previa que crasheó.
- **Limitación Teórica Identificada:**  
  El umbral fijo de 5 segundos es una heurística empírica. Si un antivirus del SO interceptara el descriptor de archivo por más de 5 segundos y el proceso cediera el control, el temporal podría ser evaluado. No obstante, al correr en proceso único sincrónico, el riesgo de colisión destructiva es nulo.
- **Preservación de Estado Definitivo:**  
  La condición `if (!file.includes('.tmp')) continue;` asegura que los archivos definitivos `.json` jamás sean tocados por la purga.

---

## 6. Auditoría de `WeakSet` e Idempotencia en `SecurityKernelAuthGuard` (`A1-03`)

### 6.1. Blindaje con `WeakSet`
En [`src/jarvis/security/security-kernel-auth.guard.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/security/security-kernel-auth.guard.ts#L117):
- Se eliminó la propiedad plana `request.__securityKernelVerified`.
- Se implementó `private static readonly verifiedRequests = new WeakSet<object>()`.
- **Inmunidad ante Inyecciones:** Al ser un miembro privado y estático del guard, no puede ser alcanzado por deserializadores JSON, middlewares de body-parser ni parámetros de cabecera.
- **Verificación Estricta:** La adición al conjunto débil (`SecurityKernelAuthGuard.verifiedRequests.add(request)`) se ejecuta únicamente tras completar con éxito todas las comprobaciones de autorización (pública por spec o privada por token/RBAC/HITL). Una solicitud rechazada jamás se añade.
- **Idempotencia Re-entrante:** Cuando el guard se ejecuta globalmente (`APP_GUARD`) y a nivel de controlador (`@UseGuards`), la segunda evaluación detecta `verifiedRequests.has(request)` y retorna `true` inmediatamente, evitando la doble verificación o la doble consumición del token HITL de un solo uso.

### 6.2. Inspección Exhaustiva de `rawUrl`
En la línea 149 de [`src/jarvis/security/security-kernel-auth.guard.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/security/security-kernel-auth.guard.ts#L149):
```typescript
const rawUrl = request?.originalUrl ?? request?.url ?? '';
const isTestEnv = process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
if (!rawUrl && !isTestEnv) {
  throw new ForbiddenException(
    'SecurityKernel: ruta HTTP de solicitud requerida para validación de endpoint público (Fail-Closed).',
  );
}
```

#### Hallazgos sobre `rawUrl`:
1. `rawUrl` **no es una propiedad del objeto Request**; es una variable constante local del método `canActivate()`.
2. Se nutre de `request.originalUrl`, que es una **propiedad nativa y estándar de Express** presente en toda solicitud HTTP entrante (conserva el prefijo global `/api`), con fallback a `request.url` (estándar de Node.js `http.IncomingMessage`).
3. En entornos de producción (`NODE_ENV === 'production'`), Express garantiza que `originalUrl` esté poblado (ej. `/api/auth/login`).
4. La comprobación `!rawUrl && !isTestEnv` **no rompe ninguna solicitud legítima en producción**. Solo rechaza peticiones anómalas sin URL o llamadas malformadas a nivel de socket.
5. Las cuatro excepciones públicas autorizadas (`/auth/login`, `/jarbees/inference/status`, `/mobile/v1/health`, `/jarbees/google/callback`) superan la expresión regular de `spec.pathPattern` sin problemas.

---

## 7. Evidencia de Pruebas Multi-Proceso (`TEST-01`)

Se auditó exhaustivamente la nueva suite [`src/jarvis/security/dev-001-b1-process-concurrency.spec.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/security/dev-001-b1-process-concurrency.spec.ts):

| Prueba / Escenario | Primitiva Evaluada | Proceso Involucrado | Resultado | Demostración de Seguridad |
| :--- | :--- | :--- | :---: | :--- |
| **Paso 1 & 2** | `net.createServer` con `exclusive: true` | 2 procesos Node independientes via `child_process.fork` | **PASS** | Proceso 1 adquiere lock en `40399`; Proceso 2 es rechazado con `SingleInstanceLockException` (`EADDRINUSE`). |
| **Paso 3 & 4** | Recuperación ante muerte súbita | `child1.kill('SIGKILL')` y arranque de Proceso 3 | **PASS** | El kernel libera el socket instantáneamente; Proceso 3 adquiere el lock sin deadlocks ni locks residuales. |
| **Paso 5** | Arbitraje de concurrencia simultánea | 2 procesos arrancando en paralelo (`Promise.all`) | **PASS** | El kernel asigna el lock a exactamente un proceso (1 `acquired`, 1 `failed`). |
| **Escenario B** | Integración Fail-Closed de AuthService | Invocación de `login()` sin lock activo | **PASS** | Arroja `SingleInstanceLockException` inmediatamente, impidiendo la autenticación en procesos rogue. |
| **Escenario C1** | Limpieza de temporales huérfanos | Archivos `.tmp` con `mtime` de 10s atrás vs recientes | **PASS** | El temporal huérfano (>5s) es eliminado en arranque; los archivos `.json` vigentes y `.tmp` recientes son preservados. |
| **Escenario C2** | Sincronización en `recordFailedLogin` | 5 intentos consecutivos fallidos | **PASS** | El bucket se sincroniza desde disco y activa el bloqueo progresivo (429) exactamente en el quinto intento. |
| **Escenario D** | Inmunidad de `WeakSet` | Solicitud maliciosa con inyección `__securityKernelVerified` | **PASS** | El guard ignora propiedades en el objeto Request y rechaza con `UnauthorizedException`. |

---

## 8. Matriz Consolidada de Hallazgos B1.3.1

| ID | Hallazgo | Severidad | Estado B1.3.1-REVIEW | Veredicto y Condición de Aprobación |
| :--- | :--- | :---: | :---: | :--- |
| **`A1-01`** | Endpoints públicos legacy fuera de la frontera | **ALTA** | **CLOSED** | 30 endpoints legacy asegurados; frontera global operativa. |
| **`A1-02`** | `SecurityKernelAuthGuard` como `APP_GUARD` | **ALTA** | **CLOSED** | Registrado en orden correcto en `AppModule`. |
| **`A1-03`** | Idempotencia vulnerable a inyección y colisión | **MEDIA** | **CLOSED** | Implementado `WeakSet` privado. Verificado `rawUrl` nativo de Express. |
| **`A2-01`** | Borrado de registros anti-replay de 0 bytes tras crash | **ALTA** | **CLOSED** | Retención obligatoria en disco y cuarentena Fail-Closed. |
| **`A2-02`** | Falta de durabilidad física `fsync` en Mobile Gateway | **ALTA** | **CLOSED** | `fs.fsyncSync(fd)` incorporado antes de cerrar descriptores. |
| **`A2-03`** | Persistencia no apta para clústeres multi-nodo | **ALTA** | **ACCEPTED RISK** | Confinado formalmente a *Single-Host Deployment* con GPU RTX 5070 local. |
| **`A2-04`** | Acumulación indefinida en memoria de `seenRequestIds` | **MEDIA** | **CLOSED** | Purga activa cada 60s con `.unref()`. |
| **`A2-05`** | Permisos Unix `0o600` en Windows NTFS | **BAJA** | **CLOSED** | Aclarado y mitigado mediante permisos NTFS de carpeta. |
| **`F-B1-02-01`** | Pérdida de lockouts corruptos tras caída | **ALTA** | **CLOSED** | Retención en cuarentena Fail-Closed. |
| **`F-B1-02-02`** | Carrera de concurrencia inter-proceso en lockout | **ALTA** | **CLOSED CON RESTRICCIÓN** | Single-Instance Enforcement impuesto por SO mediante `SingleInstanceLockService` + sincronización en `recordFailedLogin()`. |
| **`F-B1-02-03`** | Timer de limpieza sin `.unref()` | **BAJA** | **CLOSED** | Interval desreferenciado y teardown en `onModuleDestroy()`. |
| **`F-B1-02-04`** | Riesgo de DoS por IP compartida y spoofing proxy | **MEDIA** | **ACCEPTED RISK** | Scoping por par operador+IP mitiga DoS colateral; proxy documentado. |
| **`F-B1-10-01`** | TOCTOU en escrituras y reemplazos 3D | **ALTA** | **CLOSED** | Temporal exclusivo + `fsyncSync` + validación de inodo + `renameSync`. |
| **`F-B1-10-02`** | Omisión de `ensureNoSymlinksInPath` en metadata | **ALTA** | **CLOSED** | Validación iterativa de enlaces simbólicos en todo el árbol de ruta. |
| **`F-B1-10-03`** | Lectura sin descriptor fijo en metadata 3D | **MEDIA** | **CLOSED** | Lector `readConfined3DFileBuffer` fija descriptor y compara inodos. |
| **`TEST-01`** | Ausencia de pruebas multi-proceso independientes | **ALTA** | **CLOSED** | Suite inter-proceso con `child_process.fork` aprobada al 100%. |

---

## 9. Reconciliación y Cobertura de Pruebas

- **Compilación TypeScript:** Exit code 0 (`npm run build`).
- **Suites Unitarias y de Procesos (7 suites):** **87 pruebas ejecutadas, 87 exitosas (0 fallidas)** en 24.45 s.
- **Suite e2e de Homologación (1 suite):** **43 pruebas ejecutadas, 43 exitosas (0 fallidas)** en 16.84 s.
- **Gran Total:** **130 pruebas automatizadas de seguridad superadas al 100%.**
- Se verificó que las 7 pruebas nuevas no sustituyen ni debilitan ninguna aserción previa de B1.2 o B1.3.

---

## 10. Riesgos Residuales Operacionales

1. **Restricción Arquitectónica Single-Host (`A2-03` / `F-B1-02-02`):**  
   El backend está arquitectónicamente delimitado a una instalación en un único host físico con GPU NVIDIA RTX 5070. El mecanismo de exclusión mutua por socket loopback previene técnicamente la ejecución concurrente en el mismo host, pero no está diseñado para clústeres distribuidos en múltiples servidores físicos. Si en el futuro se requiriera escalamiento horizontal, se deberá incorporar un backend transaccional distribuido (PostgreSQL / Redis).
2. **Puerto Mutex 40199:**  
   Si una aplicación de terceros ocupara el puerto `40199`, JarBees no arrancará. Esto se mitiga mediante la variable de entorno `JARBEES_INSTANCE_MUTEX_PORT`.
3. **Purga Heurística de Temporales:**  
   El umbral de 5 segundos es seguro bajo la garantía de proceso único sincrónico de Node.js, pero sigue siendo una heurística temporal.

---

## 11. Veredicto Final

### Veredicto Técnico: ⚖️ **HOMOLOGABLE CON RESTRICCIONES OPERACIONALES FORMALES**

> [!IMPORTANT]
> **Dictamen de la Auditoría Independiente:**  
> Tras la incorporación de `SingleInstanceLockService` a nivel de SO, la corrección de `recordFailedLogin()`, la purga de temporales huérfanos, el blindaje con `WeakSet` en `SecurityKernelAuthGuard` y la validación con pruebas inter-proceso reales (`child_process.fork`), **se han subsanado la totalidad de las vulnerabilidades técnicas de código detectadas en B1.2 y B1.3**.  
> El código fuente del working tree actual cumple con los estándares de robustez, fail-closed y defensa en profundidad requeridos para cerrar la Fase B1 bajo la premisa de **Single-Host, Single-Instance**.

### Estado de Puertas de Seguridad:
- **Homologación Formal de Fase B1:** ⚠️ **PENDIENTE DE LA AUTORIZACIÓN DEL OPERADOR.** (La auditoría recomienda proceder con el commit y push de consolidación).
- **Fase DEV-001-B2 (Sandboxing y Autonomía de Agente):** 🛑 **ESTRICTAMENTE BLOQUEADA** hasta que el operador declare formalmente cerrada la Fase B1 tras revisar este informe.

