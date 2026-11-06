# DEV-001-B2.0.1 — Revisión Técnica Profunda del Aislamiento en Windows y Evaluación de Alternativas

**Misión:** DEV-001-B2.0.1  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** DEV-001-B2.0 (Design Preliminar)  
**Estado:** Documento de Diseño y Validación Técnica (Sin cambios en código)

---

## 1. Desmitificación de Primitivas Nativas de Windows: Capacidades Reales y Limitaciones

Una conclusión fundamental de esta auditoría es que **los Windows Job Objects y los Restricted Tokens NO constituyen por sí mismos un contenedor o sandbox seguro para ejecutar código arbitrario no confiable**. 

A continuación se analizan en detalle las capacidades reales, las condiciones de carrera y las fallas de aislamiento de cada primitiva del subsistema NT.

---

### 1.1. Windows Job Objects (Objetos de Trabajo)

#### Qué resuelven con solidez a nivel de Kernel NT:
- **Límites de Tiempo de Procesador y CPU Rate Control:** `JOB_OBJECT_CPU_RATE_CONTROL_ENABLE` permite fijar un porcentaje máximo de uso de ciclos de CPU (ej: 50% de un core), impidiendo ataques de denegación de servicio por cálculo intensivo.
- **Límites de Memoria de Sistema (Commit Memory):** `JOB_OBJECT_LIMIT_JOB_MEMORY` y `JOB_OBJECT_LIMIT_PROCESS_MEMORY` limitan la cantidad de memoria virtual comprometida (RAM + swap), abortando con excepción `STATUS_COMMITMENT_LIMIT` si un proceso intenta consumir más de 256 MB.
- **Límite de Procesos Activos:** `JOB_OBJECT_LIMIT_ACTIVE_PROCESS` bloquea la creación de más de $N$ procesos simultáneos, mitigando directamente las fork bombs.
- **Terminación Garantizada en Cascada:** Al asignar la bandera `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, cerrar el último handle del Job Object provoca que el kernel NT mate instantáneamente a todos los procesos miembros del grupo.

#### Brechas Críticas y Modos de Falla:
1. **Condición de Carrera en la Creación (TOCTOU de Asignación):**
   Si se lanza un proceso mediante `child_process.spawn()` estándar de Node.js y luego se invoca `AssignProcessToJobObject()`, transcurren varios milisegundos entre `CreateProcess()` y la asignación al Job. Durante esa ventana, el proceso hijo puede invocar `CreateProcess()` y generar subprocesos huérfanos que jamás ingresarán al Job Object.
   - *Mitigación Obligatoria:* El proceso debe crearse obligatoriamente con la bandera `CREATE_SUSPENDED`, asignarse al Job Object, y únicamente después reanudar su hilo principal (`ResumeThread`).
2. **Fuga por Banderas de Breakaway:**
   Si el Job Object permite breakaway (`JOB_OBJECT_LIMIT_BREAKAWAY_OK` o `JOB_OBJECT_LIMIT_SILENT_BREAKAWAY_OK`), cualquier proceso hijo puede llamar a `CreateProcess` con `CREATE_BREAKAWAY_FROM_JOB` y escapar completamente de las restricciones del Job.
   - *Mitigación Obligatoria:* Omitir de forma terminante cualquier bandera de breakaway en los `LimitFlags`.
3. **Cero Aislamiento de Filesystem o Red:**
   Los Job Objects **no tienen concepto de sistema de archivos ni de red**. Un proceso dentro de un Job Object tiene exactamente los mismos accesos de red, sockets TCP y lectura/escritura en disco que cualquier proceso del usuario.

---

### 1.2. Restricted Tokens (Tokens de Seguridad Restringidos)

#### Qué resuelven a nivel de Token NT:
Mediante la API Win32 `CreateRestrictedToken()`, se pueden aplicar tres filtros:
1. **Privilege Stripping:** Deshabilitar privilegios peligrosos (eliminar `SeDebugPrivilege`, `SeImpersonatePrivilege`, `SeAssignPrimaryTokenPrivilege`, `SeBackupPrivilege`, etc.).
2. **Deny-Only SIDs:** Convertir grupos administrativos (como `BUILTIN\Administrators`) en SIDs solo de denegación (`SE_GROUP_USE_FOR_DENY_ONLY`), impidiendo que el proceso use derechos de admin.
3. **Restricted SIDs:** Agregar SIDs restrictivos que exigen doble evaluación de lista de control de acceso (DACL).

#### Por qué NO aíslan el Sistema de Archivos:
- El proceso con token restringido **continúa ejecutándose bajo la identidad del usuario activo (`xiphos-pc1`)**.
- En Windows NT, los archivos, carpetas del proyecto, llaves del registro (`HKCU`) y variables de entorno pertenecen al usuario activo o al grupo `Authenticated Users`.
- Dado que el token restringido sigue conteniendo el SID del usuario activo, **puede leer cualquier archivo que el usuario pueda leer** (incluyendo `.env`, código fuente del backend, claves SSH en `.ssh/` y perfiles de navegador).

---

### 1.3. Mandatory Integrity Control (MIC) — Niveles de Integridad y Low Integrity

Windows asigna niveles de integridad: `System` (Alto), `High` (Admin), `Medium` (Usuario normal), `Low` (Sandbox de Internet Explorer/Edge) y `Untrusted`.

#### Qué protege Low Integrity:
- **No-Write-Up:** Un proceso Low Integrity no puede escribir en ningún archivo, carpeta o clave de registro con nivel Medium o superior. Esto protege archivos de Windows y del proyecto contra modificaciones directas.
- **UIPI (User Interface Privilege Isolation):** No puede enviar mensajes Windows (`WM_KEYDOWN`, `WM_COPYDATA`) a ventanas de nivel Medium (evitando ataques de *shatter attack* o secuestro de ventanas).

#### La Gran Falla de Low Integrity:
- **NO aplica No-Read-Up:** En Windows, el control de integridad **NO bloquea la lectura hacia arriba**. Un proceso Low Integrity **PUEDE LEER archivos de nivel Medium** (como `C:\Projects\productos_crud_bkd\.env` o archivos de configuración) a menos que se hayan configurado listas de control de acceso obligatorias (SACLs) explícitas en cada archivo sensible.
- **Conectividad de Red Habilitada:** Un proceso Low Integrity tiene acceso completo a la pila de red local (sockets TCP salientes y loopback hacia `127.0.0.1`), por lo que puede realizar SSRF o exfiltrar datos libremente.

---

### 1.4. AppContainers (El Modelo de Contenedor Real de Windows)

Introducido en Windows 8 y perfeccionado en Windows 10/11 para UWP, Microsoft Edge y Chromium, **AppContainer es la única frontera real de aislamiento por proceso nativa en Windows**.

#### Arquitectura de AppContainer:
- **Default-Deny en Filesystem:** Un proceso AppContainer tiene un SID de paquete único (`S-1-15-2-...`). El kernel NT deniega el acceso a **todo** archivo o carpeta del sistema, excepto aquellos que cuenten con una ACE explícita para su SID de AppContainer o para `ALL_APPLICATION_PACKAGES`.
- **Default-Deny en Red con WFP (Windows Filtering Platform):** El aislamiento de red no depende de ganchos en userspace, sino de filtros en el kernel de red. Para tener red, debe asignársele capacidades explícitas (`internetClient`, `privateNetworkClientServer`). Sin ellas, el kernel bloquea cualquier llamada a `connect()` o `bind()`.
- **Aislamiento de Objetos del Kernel:** Directorios de objetos de kernel separados (`\Sessions\1\AppContainerNamedObjects\<PackageSID>`), impidiendo el acceso a Named Pipes, eventos o memoria compartida de la sesión del usuario.

#### Desafíos Críticos de AppContainer para JarBees:
- **Incompatibilidad con Runtimes Estándar (Node.js / Python):**  
  Node.js y Python asumen acceso a DLLs del sistema en `System32`, binarios del sistema, y módulos en `node_modules`. Dentro de un AppContainer estricto, `node.exe` falla inmediatamente en el arranque a menos que se use un lanzador nativo que configure ACLs de lectura en las dependencias y en el workspace específico.

---

### 1.5. El Problema del Hardware: Acceso y Cuotas de la GPU NVIDIA GeForce RTX 5070

Uno de los hallazgos más relevantes de esta auditoría involucra el hardware gráfico:

1. **Acceso a Controladores NVIDIA:**
   Para invocar CUDA, PyTorch o TensorRT en la RTX 5070, el proceso debe abrir handles hacia los dispositivos del controlador (`\\.\NvidiaDevice`, `\\.\NvidiaModeset`, `\\.\nvhost*`).  
   - En un proceso estándar o Low Integrity, el acceso a CUDA funciona nativamente.
   - En un AppContainer, estos dispositivos son inaccesibles por defecto, requiriendo capacitar al SID del AppContainer con permisos sobre los device objects del driver.
2. **Falta Total de Límites de Memoria de Video (VRAM) en Job Objects:**
   `JOB_OBJECT_LIMIT_JOB_MEMORY` **únicamente rastrea la memoria del sistema (RAM)**.  
   Las asignaciones de VRAM de la GPU (`cudaMalloc`, buffers de textura en Blender) se gestionan directamente a través del subsistema de memoria de video del driver NVIDIA (WDDM).  
   > [!WARNING]
   > Un código malicioso o defectuoso ejecutado en el sandbox puede asignar los 12.227 MiB de VRAM de la RTX 5070 mediante un bucle de tensores en CUDA. El Job Object de Windows no intervendrá porque el consumo de RAM del sistema podría ser de apenas 50 MB, mientras que la VRAM de la GPU queda saturada, provocando un reinicio del controlador gráfico (TDR) y congelamiento del escritorio del operador.
   - *Mitigación:* Para código que deba utilizar GPU, la única forma de limitar VRAM en Windows sin virtualización completa es mediante el runtime de CUDA (`torch.cuda.set_per_process_memory_fraction(0.25)` o limitación de contexto en el driver) o mediante el paso a un contenedor con soporte NVIDIA Container Toolkit.

---

## 2. Comparativa Exhaustiva de las 4 Alternativas de Sandboxing

| Dimensión Técnica | Alternativa A: Windows Native (Job + AppContainer + ACL) | Alternativa B: WSL2 Linux Sandbox | Alternativa C: MicroVM Dedicada (Hyper-V) | Alternativa D: Docker Desktop (Linux Container) |
| :--- | :--- | :--- | :--- | :--- |
| **Barrera de Kernel Real** | Kernel NT (AppContainer SID + Token + Job Object) | Kernel Linux (Namespaces, Cgroups v2) + Hypervisor | Hypervisor de Hardware (VT-x / SLAT EPT) | Kernel Linux dentro de VM WSL2 |
| **Aislamiento de Filesystem**| Default-Deny por ACL en SID. Workspace montado explícito | Disco virtual ext4 independiente. Mapeo selectivo | VHDX virtual 100% aislado. Sin acceso al host | OverlayFS sobre volumen aislado |
| **Aislamiento de Red** | Bloqueo por WFP a nivel de kernel (sin `internetClient`) | Namespaces de red desacoplados + `iptables` | vSwitch privado sin adaptador de red saliente | Docker bridge sin gateway / `--internal` |
| **Protección contra SSRF** | Absoluta (sin capacidad de red no hay loopback) | Absoluta (`iptables -A OUTPUT -d 127.0.0.1 -j DROP`) | Absoluta (sin tarjeta de red asignada) | Absoluta (red interna sin salida) |
| **Acceso a GPU RTX 5070** | Directo (DirectX/CUDA) con ACL en drivers | Nativo vía `/dev/dxg` (NVIDIA CUDA WSL2) | Completo vía Discrete Device Assignment (DDA)| Nativo con NVIDIA Container Toolkit |
| **Control de Cuota de VRAM**| Parcial (a nivel de runtime de software) | Controlable mediante cgroups/NVIDIA SMI | Aislable mediante particionamiento DDA | Controlable con `--gpus "device=0,capabilities=compute"` |
| **Superficie de Ataque** | Llamadas al kernel NT, drivers Win32k y NVIDIA | Syscalls del kernel Linux (reducibles con seccomp) | Interfaz de hypervisor y dispositivos emulados | Syscalls de Linux + daemon de Docker |
| **Requisitos en el Host** | **Ninguno adicional (Win 10 Pro nativo)** | Instalar distro Linux (`wsl --install -d Ubuntu`) | Habilitar Hyper-V vía DISM + imagen VHDX | Instalar Docker Desktop (requiere elevación) |
| **Latencia de Creación** | **< 15 ms (Medido empíricamente en Win32)** | **~1.2 a 1.8 segundos (Estimado para container)** | **~8 a 15 segundos (Estimado para boot)** | **~2.5 a 4.0 segundos (Estimado)** |
| **Consumo de Memoria Base**| **< 15 MB de RAM** | **~800 MB a 1.2 GB (Instancia Vmmem)** | **~2 GB (RAM reservada por VM)** | **~2.5 GB (Docker engine + WSL2)** |
| **Persistencia y Limpieza**| Limpieza de directorio temporal con UUID | Contenedor descartable (`docker run --rm`) | Snapshot descartable o rollback instantáneo | Contenedor efímero |
| **Riesgos Residuales** | Complejidad de ACLs en Node.js; fuga de VRAM | Mantenimiento de entorno dual (Linux/Windows) | Sobrecarga de CPU/RAM; latencia inaceptable | Dependencia de daemon en background |

---

## 3. Veredicto Técnico y Recomendación Definitiva de Sandboxing

### Veredicto:
1. **Windows Job Objects + Restricted Tokens NO son suficientes por sí solos:** Dejan abierta la lectura de archivos confidenciales del host y la conectividad hacia la red local (SSRF).
2. **AppContainers en Windows son la única primitiva NT capaz de cerrar lectura y red, pero imponen fricción extrema para herramientas CLI:** Configurar Node.js con todas sus dependencias de DLLs dentro de un AppContainer exige un lanzador nativo complejo.
3. **WSL2 representa la barrera de seguridad de kernel más robusta y natural para código no confiable:**
   - Permite aislar completamente el sistema de archivos del host (el código corre en Linux sobre ext4, sin ver el disco `C:\` a menos que se monte explícitamente).
   - El aislamiento de red mediante namespaces de Linux (`unshare -n` o contenedores ligeros) es una barrera 100% probada contra SSRF y DNS rebinding.
   - Soporta aceleración por hardware de la NVIDIA GeForce RTX 5070 mediante `/dev/dxg` y controladores NVIDIA para WSL2.
   - Su latencia de ~1.5 segundos es perfectamente tolerable para suites de verificación y ejecución de código hostil.

### Decisión de Arquitectura Recomendada:
- **Para B2.1 (Sin Ejecución):** Implementar el Execution Broker puramente con contratos de validación, auditoría y simulación (*Fail-Closed*), sin depender todavía de ningún sandbox de SO.
- **Para B2.2 (Ejecución Aislada de Pruebas y Código Hostil):** Adoptar un entorno Linux aislado en **WSL2** como frontera primaria de seguridad, manteniendo Windows Job Objects únicamente como limitador de recursos para tareas de render 3D / multimedia locales del host.

