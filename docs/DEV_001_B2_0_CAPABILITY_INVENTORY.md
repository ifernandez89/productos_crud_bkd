# DEV-001-B2.0 — Inventario Exhaustivo de Capacidades de Ejecución

**Misión:** DEV-001-B2.0  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** Homologación DEV-001-B1 bajo restricciones operacionales  
**Estado:** Documento de Diseño Arquitectónico (Sin cambios en código)

---

## 1. Alcance y Metodología de la Auditoría

El presente inventario audita la totalidad de los componentes de JarBees que ejecutan procesos, manipulan el sistema de archivos, acceden a redes internas/externas, gestionan credenciales o interactúan con hardware.

En cumplimiento estricto de las directivas de seguridad:
- **No se infiere seguridad por nombres de clases o métodos:** Se rastrearon las cadenas completas de invocación desde los controladores HTTP y el planificador del LLM hasta las llamadas al sistema operativo (`child_process`, `fs`, `net`, `http`, `prisma`).
- **Verificación cruzada con la frontera B1:** Se documenta el estado de protección que aporta el Security Kernel (B1) y se aíslan los riesgos residuales que competen a la capa de ejecución (B2).

---

## 2. Inventario Detallado de Capacidades por Categoría

### 2.1. Ejecución de Procesos y Comandos de Sistema Operativo

#### CAP-EXEC-01: Ejecución de Scripts Python (`SafeExecService`)
- **Componente:** `SafeExecService` (`src/jarvis/security/safe-exec.service.ts`).
- **Ruta / Invocación:** Invocado internamente por herramientas analíticas, simulaciones científicas y scripts de calibración.
- **Solicitante:** Agente cognitivo / Planificador / Servicios internos.
- **Validaciones Aplicadas:**
  - Comprobación de existencia de script con `fs.existsSync`.
  - Whitelist de ejecutables (`python`, `python3`).
  - `shell: false`.
  - Timeout configurable mediante `AbortController` (por defecto 30.000 ms).
- **Recursos Alcanzables:** Intérprete Python del host, acceso al sistema de archivos local con privilegios del usuario de Windows (`xiphos-pc1`), acceso a la GPU (CUDA) y red abierta.
- **Riesgos Residuales Críticos:**
  - **Fuga total de secretos:** Pasa `{ ...process.env }` directamente al subproceso hijo, exponiendo `JWT_SECRET`, credenciales de bases de datos y claves API.
  - **Sin aislamiento de disco:** El script Python puede leer o sobrescribir cualquier archivo del proyecto o del perfil de usuario.
  - **Sin cuotas de CPU/RAM:** Un script descontrolado puede provocar consumo masivo de memoria o bucles infinitos en múltiples hilos.
- **Controles B1 Existentes:** Protegido indirectamente si la invocación proviene de un controlador bajo `SecurityKernelAuthGuard`.

#### CAP-EXEC-02: Arnés de Ejecución de Pruebas de Código (`IsolatedTestRunnerService`)
- **Componente:** `IsolatedTestRunnerService` (`src/jarvis/verification/isolated-test-runner.service.ts`).
- **Ruta / Invocación:** Invocado por `VerificationHarnessService` y `RepairControllerService` durante misiones de ingeniería autónoma (`/api/jarbees/engineering/missions`).
- **Solicitante:** Agente de auto-reparación (LLM) / Operador autenticado.
- **Validaciones Aplicadas:**
  - Verificación de hash SHA-256 de suites de prueba.
  - Sanitización de entorno (`sanitizedEnv` excluye variables de aplicación directas).
  - Timeout de proceso (por defecto 2.000 ms) y terminación con `taskkill /F /T /PID`.
  - Límite de buffer de salida (64 KB para stdout y stderr).
  - Transpilación TypeScript a CommonJS en directorio temporal aislado (`os.tmpdir()`).
- **Recursos Alcanzables:** Proceso Node.js en el host (`process.execPath`), acceso a `node_modules` del host, sistema de archivos accesible por el usuario.
- **Riesgos Residuales Críticos:**
  - **Control de conveniencia en red:** El bloqueo de red se realiza mediante monkey-patching en memoria de `net.connect`, `http.request`, etc. en el script de arranque. Puede ser eludido mediante `delete require.cache`, llamadas a binarios externos o C++ native addons.
  - **Sin confinamiento de sistema de archivos:** El código bajo prueba tiene acceso pleno a `fs` nativo; puede leer `.env`, código fuente del backend o datos del usuario en Windows.
- **Controles B1 Existentes:** El endpoint de misiones requiere autenticación JWT y token HITL si afecta rutas protegidas (`ENGINEERING_SENSITIVE_MISSION`).

#### CAP-EXEC-03: Renderizado y Procesamiento 3D (`BlenderService`)
- **Componente:** `BlenderService` (`src/jarvis/3d/blender.service.ts`).
- **Ruta / Invocación:** `Studio3DController` (`src/jarvis/3d/controllers/studio-3d.controller.ts`) en rutas `/api/jarbees/3d/inspect` y `/api/jarbees/3d/weathering`.
- **Solicitante:** Operador autenticado vía JWT.
- **Validaciones Aplicadas:**
  - `execFileAsync` con `shell: false`.
  - Scripts predeterminados (`scripts/blender/inspect_glb.py`, `apply_weathering.py`).
  - Timeout de 30.000 a 120.000 ms.
  - Confinamiento canónico B1 en `Studio3DController` (`resolveConfinedAssetPath`, `ensureNoSymlinksInPath`).
- **Recursos Alcanzables:** Binario `blender.exe`, motor de renderizado Cycles/EEVEE, GPU NVIDIA GeForce RTX 5070, directorio `storage/assets/`.
- **Riesgos Residuales Críticos:**
  - Un archivo GLB/glTF malicioso con exploits de buffer overflow o scripts embebidos de Blender podría ejecutar código arbitrario en el contexto de `blender.exe`.
- **Controles B1 Existentes:** Autenticación obligatoria, validación anti-symlinks y verificación estricta de extensiones (`.glb`, `.gltf`, `.jb3d`).

#### CAP-EXEC-04: Gateway Móvil y Automatización de Escritorio (`MobileGatewayService`)
- **Componente:** `MobileGatewayService` (`src/mobile-gateway/mobile-gateway.service.ts`).
- **Ruta / Invocación:** `MobileGatewayController.executeIntent` (`POST /api/mobile-gateway/intent`).
- **Solicitante:** Dispositivo móvil emparejado mediante HMAC-SHA256.
- **Validaciones Aplicadas:**
  - HMAC-SHA256 con timestamp y anti-replay durable (B1).
  - Whitelist de aplicaciones (`MOBILE_ALLOWED_APPS`): Spotify, VS Code, Chrome, Terminal, Calc, Notepad.
  - Whitelist de teclas virtuales (`ALLOWED_VK_CODES`).
  - Whitelist de comandos ADB predefinidos.
  - `shell: false` en `executeOsCommand`.
  - Bloqueo por defecto de `OPEN_URL` (`MOBILE_GATEWAY_ENABLE_OPEN_URL=true` requerido).
- **Recursos Alcanzables:** Lanzamiento de aplicaciones de escritorio en la sesión activa de Windows, simulación de teclado global (`user32.dll`), puente ADB con dispositivos Android conectados por USB.
- **Riesgos Residuales Críticos:**
  - Ejecución de `powershell.exe -EncodedCommand` para eventos de volumen: aunque el script está hardcodeado, cualquier falla de sanitización en parámetros podría permitir inyección.
  - Lanzamiento de procesos en el escritorio que interactúan con ventanas activas del operador.
- **Controles B1 Existentes:** Firma HMAC obligatoria, ledger anti-replay persistente y durable en disco (`fsync`), política Fail-Closed ante archivos corruptos.

#### CAP-EXEC-05: Supervisión de Inferencia LLM y Procesamiento de Voz (`InferenceSupervisorService`, `VoiceService`, `AudiobookIngestService`)
- **Componentes:**
  - `InferenceSupervisorService` (`src/jarvis/llm/inference-supervisor.service.ts`): Lanza `llama-server.exe` con argumentos de GPU (`-ngl 99`).
  - `VoiceService` (`src/jarvis/tools/voice/voice.service.ts`): Lanza `ffmpeg.exe`, `sox.exe` o síntesis Piper.
  - `AudiobookIngestService` (`src/jarvis/library/audiobook-ingest.service.ts`): Lanza `ffmpeg.exe` y Whisper para transcripción.
- **Ruta / Invocación:** Rutas de inferencia de chat, ingesta de audiolibros y streaming de voz.
- **Solicitante:** Operador autenticado / Inferencia local.
- **Validaciones Aplicadas:** `execFile` / `spawn` con rutas validadas, timeouts específicos, argumentos estructurados sin invocación de shell.
- **Recursos Alcanzables:** VRAM de la GPU RTX 5070, binarios multimedia locales, archivos de audio en `storage/`.
- **Riesgos Residuales Críticos:**
  - Procesamiento de archivos de audio corruptos o crafteados que exploten vulnerabilidades de códecs en `ffmpeg`.
- **Controles B1 Existentes:** Endpoints protegidos por `SecurityKernelAuthGuard`.

---

### 2.2. Navegación Web, Scraping y Peticiones de Red Saliente

#### CAP-NET-01: Navegador Automatizado (`BrowserToolService`)
- **Componente:** `BrowserToolService` (`src/jarvis/tools/browser/browser-tool.service.ts`).
- **Ruta / Invocación:** Invocado por `AssistantToolsService`, `ExecutionEngineService`, `InvestigationService` y `JarvisService`.
- **Solicitante:** Agente LLM / Chat conversacional cuando detecta URLs o necesita información externa.
- **Validaciones Aplicadas:**
  - Extracción de URLs con regex `https?://...`.
  - Timeout de navegación (15.000 ms a 20.000 ms).
  - Truncamiento de texto extraído (máximo 10.000 caracteres).
- **Recursos Alcanzables:** Chromium / Microsoft Edge headless (Playwright), pila TCP/IP completa del host, resolución DNS pública y privada.
- **Riesgos Residuales Críticos:**
  - **Vulnerabilidad Crítica de SSRF (Server-Side Request Forgery):** No existe lista blanca de dominios ni validación de rangos IP. Puede navegar a `http://127.0.0.1:4000` (backend productivo), `http://127.0.0.1:40199` (mutex socket), `http://192.168.x.x` (enrutadores y dispositivos LAN) o `http://169.254.169.254` (metadatos).
  - **Indirect Prompt Injection:** El texto, titulares y payloads JSON scrapeados de páginas web se inyectan directamente en el prompt del LLM sin sanitización ni delimitadores semánticos blindados.
  - **Desactivación de Sandbox:** En componentes relacionados (`PngExporter`), se detectó el uso de flags `--no-sandbox` y `--disable-setuid-sandbox`.
- **Controles B1 Existentes:** Endpoints de chat protegidos por autenticación, pero el comportamiento del agente una vez autenticado no restringe destinos de red.

#### CAP-NET-02: Clientes HTTP Auxiliares (`WebHelper`, `SportsScraperHelper`, `SitemapCrawlerService`)
- **Componentes:** Servicios que utilizan `axios` o `fetch` para consultas meteorológicas, resultados deportivos, sitemaps o APIs externas.
- **Riesgos Residuales Críticos:** Falta de bloqueo contra DNS Rebinding y falta de límite de tamaño en respuestas descargadas.

---

### 2.3. Modificación del Sistema de Archivos y Espacio de Trabajo

#### CAP-FS-01: Gestor de Misiones de Ingeniería (`EngineeringMissionManagerService`)
- **Componente:** `EngineeringMissionManagerService` (`src/jarvis/verification/engineering-mission-manager.service.ts`).
- **Ruta / Invocación:** `/api/jarbees/engineering/missions` (`POST`, `resume`, `approve`).
- **Solicitante:** Operador autenticado / Misión de reparación autónoma.
- **Validaciones Aplicadas:**
  - Whitelist de archivos permitidos (`allowedFiles`) con verificación de `..` y rutas absolutas.
  - Validación de confinamiento de `workspaceDir` con `startsWith(projectRoot)` o `startsWith(tmpRoot)`.
  - Verificación de rutas protegidas (`protectedPathPatterns`) que exige token criptográfico HITL (`ENGINEERING_SENSITIVE_MISSION`).
  - Snapshots de checkpoints y diff antes/después.
- **Recursos Alcanzables:** Código fuente del backend en disco, directorio `storage/engineering-missions/`.
- **Riesgos Residuales Críticos:**
  - **Falta de resolución canónica estricta anti-symlinks:** La validación utiliza `path.resolve(workspaceDir).startsWith(projectRoot)`. Si un segmento intermedio de `workspaceDir` o un directorio de trabajo es un enlace simbólico o *junction* NTFS, la comprobación de prefijo es vulnerable a desvíos fuera de la raíz del proyecto.
  - **Sobrescritura directa en workspace:** Cuando se aprueba la integración, escribe archivos directamente sobre el árbol de trabajo del proyecto en el host.
- **Controles B1 Existentes:** Exige `ActionGatekeeperService` con token firmado para misiones que toquen componentes sensibles.

#### CAP-FS-02: Gestores de Assets y Media (`Studio3DController`, `PosterService`, `DocumentIngestService`)
- **Componentes:**
  - `Studio3DController` & `AssetMetadataService`: Persistencia en `storage/assets/`. Confinamiento B1 activo con `realpathSync` y descriptor verification (`fstatSync.ino === lstatSync.ino`).
  - `PosterService`: Escritura de SVGs y PNGs generados en `storage/posters/`.
  - `DocumentIngestService`: Escritura de PDFs subidos en `storage/uploads/` y extracción de chunks.
- **Controles B1 Existentes:** Totalmente confinados en B1 bajo paths validados y mitigación anti-TOCTOU.

---

### 2.4. Acceso a Credenciales, Bases de Datos y Secretos

#### CAP-SEC-01: Bóveda Criptográfica y Proveedor OAuth (`CryptoVaultService`, `GoogleAuthService`)
- **Componentes:**
  - `CryptoVaultService` (`src/shared/crypto-vault.service.ts`): Cifra/descifra secretos con AES-256-GCM.
  - `GoogleAuthService` (`src/google/google-auth.service.ts`): Almacena y rota tokens OAuth de Google.
- **Riesgos Residuales Críticos:**
  - Los servicios corren en el mismo proceso Node.js que el resto de los módulos de JarBees. Si un subproceso o plugin inyectado logra ejecutar código en el proceso principal, puede leer `CREDENTIALS_ENCRYPTION_KEY` o llamar directamente a `decryptSecret()`.
- **Controles B1 Existentes:** Verificación estricta de longitud y entropía de claves (`validateCryptoSecret`), aislamiento de `AssetSecurityService` (clasificado como ofuscación cliente sin privilegios de servidor).

#### CAP-DB-01: Cliente ORM Prisma (`PrismaService`)
- **Componente:** `PrismaService` conectado a PostgreSQL (`jarbees_stage` o `jarbees_data`).
- **Riesgos Residuales Críticos:**
  - Ningún subproceso aislado o agente debería tener conexión directa ni credenciales del pool de PostgreSQL. Si el agente requiere persistir conocimiento, debe solicitarlo a través de un canal controlado por el Execution Broker.
- **Controles B1 Existentes:** Controladores protegidos con JWT y roles de operador.

---

## 3. Matriz Consolidada de Riesgos Residuales

| Identificador | Capacidad | Riesgo Residual Principal | Nivel de Riesgo | Frontera B1 Actual | Acción Requerida en B2 |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **CAP-EXEC-01** | Python Execution | Fuga de `process.env` y acceso irrestricto a host | **CRÍTICO** | Solo auth en controller | Broker + Env Sanitizado + Sandbox |
| **CAP-EXEC-02** | Test Runner | Escape de monkey-patch de red y lectura libre de disco | **ALTO** | Token HITL en sensibles | Sandbox de SO real + Quotas |
| **CAP-EXEC-03** | Blender 3D | Exploits en parsing de modelos 3D | **MEDIO** | Confinamiento 3D B1 | Proceso con bajos privilegios |
| **CAP-EXEC-04** | Mobile Gateway | Invocación de binarios y PowerShell en host | **ALTO** | HMAC + Anti-Replay | Broker con validación estricta |
| **CAP-NET-01** | Playwright Browser | SSRF a localhost/LAN e Indirect Prompt Injection | **CRÍTICO** | Ninguna en destino red | Proxy de salida + DNS Firewall + Aislamiento |
| **CAP-FS-01** | Workspace Writes | Manipulación de código fuente en host | **ALTO** | HITL token en sensibles | Workspace efímero descartable |
| **CAP-SEC-01** | Secretos / DB | Exposición de memoria del proceso | **CRÍTICO** | Cifrado en reposo | Prohibir acceso en entorno B2 |

---

## 4. Conclusiones y Brechas hacia B2

1. **La frontera B1 detiene al atacante externo, pero no confina al agente interno:** Una vez que una petición es autenticada por el Security Kernel, los servicios ejecutan acciones en el host con los permisos completos del usuario Windows `xiphos-pc1`.
2. **Los controles en memoria son insuficientes:** El arnés actual (`IsolatedTestRunnerService`) se apoya en redefiniciones en memoria de módulos (`net`, `http`), lo cual constituye un *control de conveniencia* y no una barrera técnica inmutable.
3. **El navegador carece de cortafuegos de salida:** `BrowserToolService` tiene la capacidad de alcanzar cualquier endpoint de la máquina local o de la intranet, requiriendo un cortafuegos a nivel de broker.
4. **Necesidad de desacople total entre Decisión y Ejecución:** El LLM (Intelligence Plane) debe estructurar únicamente solicitudes de ejecución; el `Execution Broker` debe validarlas contra políticas inmutables y delegarlas a un sandbox verdaderamente aislado.

