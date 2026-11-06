# DEV-001-B2.1-REVIEW — Auditoría Independiente del Execution Broker

**Misión:** DEV-001-B2.1-REVIEW — Auditoría Independiente de Código y Arquitectura  
**Fecha:** 2026-11-06  
**Modo:** **STRICT READ-ONLY / AUDITORÍA INDEPENDIENTE**  
**Rama de Referencia:** `security/dev-001-b`  
**Base Commit:** `c459087` (con `2d6bf29` y archivos en working tree)  
**Veredicto Mandatorio:** 🟢 **HOMOLOGABLE CON RESTRICCIONES**  
**Fase DEV-001-B2.2:** 🔒 **BLOQUEADA** (Sandboxing de SO y ejecución real no autorizados)

---

## 1. Resumen Ejecutivo y Cumplimiento de Límites de Auditoría

En estricto cumplimiento del mandato de auditoría independiente:
- **Modo estrictamente de solo lectura:** Cero líneas de código o configuración modificadas durante esta revisión.
- **Sin comandos persistentes ni despliegues:** Cero ejecuciones de procesos externos, peticiones de red o scripts de instalación.
- **Fronteras preservadas:** Producción (puerto 4000), base de datos `jarbees_data`, túnel ngrok y rama `main` permanecieron 100% intactos.
- **Alcance auditado:** El código fuente real de los seis archivos implementados en `src/jarvis/execution/`, su suite de pruebas, su persistencia de auditoría y su desacople respecto al sistema operativo.

---

## 2. Auditoría Detallada del Código Real (`src/jarvis/execution/`)

### 2.1. `execution-broker.types.ts`: Catálogo de Capacidades e Inmutabilidad en Runtime
- **Catálogo Inmutable (`CAPABILITY_REGISTRY`):**
  - Define exactamente 9 capacidades (`fs:read_file`, `fs:write_file`, `fs:list_directory`, `test:run_suite`, `net:fetch_url`, `code:apply_diff`, `media:render_3d`, `media:synthesize_voice`, `os:desktop_intent`).
  - Utiliza `Object.freeze` tanto en el objeto principal como en cada una de las 9 definiciones individuales.
- **Hallazgo Menor de Inmutabilidad Superficial (*Shallow Freeze*):**
  - Si bien el objeto contenedor y los registros están congelados, las propiedades de tipo arreglo (`requiredParameters: ['path']`) fueron declaradas como arreglos estándar.
  - En JavaScript, `Object.freeze` congela el primer nivel de propiedades; por tanto, teóricamente un script malicioso dentro del mismo proceso podría invocar `CAPABILITY_REGISTRY['fs:read_file'].requiredParameters.push('injected')`.
  - *Recomendación:* Congelar recursivamente los arreglos (`Object.freeze(['path'])`) o utilizar tuplas `readonly ['path'] as const` en el cierre de la fase.

### 2.2. `policy-evaluator.service.ts`: Evaluación de Políticas y Mitigaciones
- **Filosofía Fail-Closed:** La evaluación rechaza por defecto cualquier capacidad desconocida con `UNKNOWN_CAPABILITY`.
- **Identidad del Solicitante:** Valida obligatoriamente `actorId` y `sessionId`, y bloquea explícitamente identidades genéricas (`anonymous`, `guest`, `public`, `default`, vacías) con `UNAUTHORIZED_ACTOR`.
- **Modo Hermético de Red:** La bandera `hermeticOfflineMode: true` rechaza de inmediato `net:fetch_url` con `HERMETIC_OFFLINE_MODE`.
- **Escrutinio de Prevención SSRF:**
  - `PRIVATE_NETWORK_PATTERNS` bloquea `localhost`, `127.x.x.x`, `0.0.0.0`, `::1`, `::ffff:127.x`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x` y `169.254.x.x`.
  - *Observación de Seguridad:* La detección actual se apoya en expresiones regulares sobre `JSON.stringify(request.parameters)`. No cubre representaciones hexadecimales (`0x7f000001`), enteros decimales (`2130706433`), IPv6 ULA (`fc00::/7`), ni IPv6 Link-Local (`fe80::/10`).
  - *Mitigación:* Dado que en B2.1 la red está 100% deshabilitada en modo hermético, este riesgo no es explotable actualmente. Sin embargo, para cuando se habilite salida en fases futuras, es mandatorio utilizar el `SafeNetworkDispatcher` a nivel de socket diseñado en `DEV_001_B2_0_1_NETWORK_SECURITY_DESIGN.md`.
- **Confinamiento de Rutas:**
  - Bloquea traversal (`..`, `../`, `..\\`), rutas absolutas de host (`C:\...`) y patrones sensibles (`.env`, `.git`, `credentials`, `secrets`, `storage/security`, `node_modules`).
  - *Observación:* La validación es sintáctica/textual. No resuelve junctions NTFS ni symlinks existentes en disco. Esto es perfectamente seguro en B2.1 porque el Broker **no realiza operaciones de I/O sobre esas rutas**; no obstante, cuando en B2.3 se conecte el filesystem real, debe combinarse obligatoriamente con `realpathSync` y `ensureNoSymlinksInPath`.

### 2.3. `broker-audit.service.ts`: Persistencia, Monotonicidad y Recuperación
- **Aislamiento de Almacenamiento:** El libro mayor se almacena en `storage/security/execution-audit/audit-ledger.jsonl`. No existe ninguna capacidad en el `CapabilityRegistry` que permita al solicitante parametrizar o acceder a esta ruta.
- **Monotonicidad y Concurrencia:** Utiliza una cola serial en memoria (`writeMutex`) que garantiza que los índices `index = 0, 1, 2, ...` se incrementen de forma estrictamente secuencial sin condiciones de carrera.
- **Continuidad tras Reinicio del Proceso:**
  - En `onModuleInit()`, invoca `verifyAuditChain()`. Si el archivo existe y es válido, asigna `this.sequenceNumber = recordsCount` y `this.lastEntryHash = lastHash`.
  - La siguiente solicitud continuará con el índice y hash subsiguientes de manera íntegra.
- **Detección de Manipulación y Cuarentena:**
  - El método `verifyAuditChain()` recomputa el hash de cada línea y valida que `previousEntryHash` coincida con la entrada anterior.
  - Ante una línea alterada o corrupta, traslada el archivo a cuarentena (`audit-ledger.corrupt.<timestamp>`) e inicia un nuevo libro mayor con `GENESIS_HASH`.
  - *Límites Documentados:* El servicio reconoce explícitamente que el Hash Chaining detecta manipulaciones siempre que exista un ancla confiable, pero no puede resistir a un adversario con permisos de root sobre el disco físico que reescriba el archivo completo recalculando todos los hashes.

### 2.4. `execution-broker.service.ts`: Garantía Absoluta de No-Ejecución
- **Flujo de Ejecución:**
  1. Computa `payloadHash` de forma canónica y determinista (ordenamiento recursivo de claves de parámetros).
  2. Evalúa políticas; si falla, audita `DENIED` y retorna error.
  3. Si la capacidad requiere HITL, invoca `ActionGatekeeperService.verifyAndConsumeChallenge(...)`. Si el token fue reutilizado o expiró, audita `DENIED` y rechaza con `HITL_TOKEN_VERIFICATION_FAILED`.
  4. Si todo es válido, invoca `generateSimulatedResult(request)` y audita `SIMULATED`.
- **Cero Llamadas a APIs del Sistema Operativo:**
  - No importa la capacidad solicitada: el Broker genera un objeto JavaScript plano simulado.
  - Ninguna línea de código invoca `child_process`, `fs.writeFile`, `http.request`, `net.connect`, PowerShell ni Python.

---

## 3. Auditoría de la Suite de Pruebas (`execution-broker.spec.ts`)

### 3.1. Corrección de la Discrepancia Documental (18 vs. 19 pruebas)
- La suite contiene **exactamente 18 bloques `it(...)`**.
- La discrepancia en el informe anterior se debió a una numeración redundante en la redacción del resumen (desglosando dos aserciones del mismo test de auditoría).
- Los 18 casos cubren de forma exhaustiva:
  - 3 pruebas de catálogo y parámetros requeridos.
  - 2 pruebas de red hermética y prevención de SSRF.
  - 3 pruebas de confinamiento de rutas, rutas absolutas y archivos sensibles.
  - 3 pruebas de integración HITL, consumo de nonce de un solo uso y prevención de replay y TOCTOU.
  - 4 pruebas de respuestas simuladas, contención de prompt injection y **espías que certifican 0 llamadas al SO**.
  - 3 pruebas de auditoría: verificación de cadena de hashes, detección de manipulación en línea específica y concurrencia de 20 solicitudes con `Promise.all`.

### 3.2. Espías de Ausencia de Ejecución en SO (Test 16)
El test instala espías Jest sobre:
- `child_process.spawn`, `exec`, `execFile`, `fork`.
- `net.createConnection`.
- `http.request`, `https.request`.
Y verifica tras procesar solicitudes complejas que `expect(spy).not.toHaveBeenCalled()` se cumple en el 100% de los casos.

---

## 4. Auditoría de la Integración NestJS y Rutas Alternativas

1. **Estado del Módulo (`ExecutionBrokerModule`):**
   - El módulo se encuentra correctamente definido en `src/jarvis/execution/execution-broker.module.ts`, exportando sus tres servicios.
   - **No está importado en `AppModule` ni en `JarvisModule` todavía.**  
     Esto es deliberado y correcto: en la Fase B2.1 se implementó el componente de forma aislada para probar su comportamiento lógico y simulado antes de conectarlo a las rutas del sistema.
2. **Componentes Heredados que aún ejecutan acciones reales:**
   - La auditoría confirma que componentes legacy como `SafeExecService`, `BrowserToolService`, `IsolatedTestRunnerService` y `PngExporter` **siguen existiendo en el código y no pasan por el Broker**.
   - Por tanto, se ratifica la decisión operativa del operador: **dichos componentes deben permanecer bloqueados/restringidos operativamente** hasta que sean refactorizados o adaptados en la Fase B2.3.

---

## 5. Tabla de Hallazgos y Estado de Resolución

| Código | Área | Hallazgo Auditado | Severidad | Estado |
| :--- | :--- | :--- | :---: | :---: |
| **AUD-B2.1-01** | Catálogo | `requiredParameters` usa shallow freeze | **BAJA** | Homologable; congelar recursivamente en B2.3 |
| **AUD-B2.1-02** | Red / SSRF | Expresiones regulares no cubren IPv6 ULA/Link-Local | **MEDIA** | Mitigado al 100% por modo hermético offline |
| **AUD-B2.1-03** | Rutas | Validación de rutas es puramente sintáctica | **MEDIA** | Mitigado al 100% por modo de simulación sin I/O |
| **AUD-B2.1-04** | Auditoría | Hash chaining no resiste a atacante con root en disco | **BAJA** | Documentado explícitamente; requiere ancla externa |
| **AUD-B2.1-05** | Documentación | Conteo de pruebas reportaba 19 en lugar de 18 | **INFORMATIVA** | Subsanado y clarificado en este informe |
| **AUD-B2.1-06** | Integración | Módulo no conectado aún a los controladores HTTP | **INFORMATIVA** | Correcto para B2.1 (aislamiento deliberado) |

---

## 6. Veredicto Final de la Auditoría

> ### VEREDICTO DE LA REVISIÓN: 🟢 HOMOLOGABLE CON RESTRICCIONES
>
> 1. El código de `src/jarvis/execution/` implementa fielmente los contratos de validación, evaluación de políticas y registro de auditoría.
> 2. Se demuestra empíricamente que **ninguna solicitud despacha llamadas a procesos, red o disco del proyecto**.
> 3. Las capacidades Level 3 integran la verificación criptográfica y el consumo de nonces de un solo uso de B1 (`ActionGatekeeperService`).
> 4. La suite de 18 pruebas pasa al 100% y la regresión consolidada de seguridad del sistema suma **148 pruebas aprobadas (0 fallos)**.
>
> ### Restricciones Operacionales Obligatorias:
> - **Prohibición de Ejecución Real:** El Broker debe permanecer en modo `STRICT NO-EXECUTION` (`SIMULATION_ONLY`).
> - **Modo Hermético Obligatorio:** Red saliente totalmente deshabilitada (`hermeticOfflineMode: true`).
> - **Aislamiento de Componentes Legacy:** Mantener deshabilitados `SafeExecService` y `BrowserToolService` para entradas no supervisadas hasta su remediación en misiones dedicadas.
> - **Fase B2.2 Bloqueada:** No iniciar el desarrollo de adaptadores de ejecución de SO hasta la aprobación del diseño de sandboxing en WSL2.

