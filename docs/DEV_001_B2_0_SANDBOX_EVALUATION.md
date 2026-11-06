# DEV-001-B2.0 — Evaluación Comparativa de Tecnologías de Aislamiento y Sandboxing

**Misión:** DEV-001-B2.0  
**Fecha:** 2026-11-06  
**Modo:** STRICT READ-ONLY / AUDITORÍA DE ARQUITECTURA  
**Rama de Referencia:** `security/dev-001-b`  
**Commit de Referencia:** `c459087` (con `2d6bf29`)  
**Dependencia:** Homologación DEV-001-B1 bajo restricciones operacionales  
**Estado:** Documento de Diseño Arquitectónico (Sin cambios en código)

---

## 1. Perfil Técnico Empírico del Host de JarBees

Para evitar decisiones basadas en preferencias teóricas, la evaluación se fundamenta en la inspección directa del entorno de ejecución actual:

| Componente | Especificación Verificada en el Host | Implicación para Sandboxing |
| :--- | :--- | :--- |
| **Sistema Operativo** | Windows 10 Pro 64-bit (Build 10.0.19041) | Soporta Hyper-V, Windows Sandbox, WSL2 y Contenedores |
| **Procesador (CPU)** | 12th Gen Intel(R) Core(TM) i7-12700 (12 cores, 20 hilos) | Capacidad de cómputo y aislamiento masivo |
| **Memoria Física (RAM)**| 32 GB DDR4/DDR5 | Suficiente para virtualización ligera sin degradar Node.js |
| **Acelerador Gráfico** | NVIDIA GeForce RTX 5070 (12 GB VRAM, Driver 617.42) | Cómputo neuronal y 3D prioritario; requiere passthrough |
| **Virtualización BIOS** | `VirtualizationFirmwareEnabled: True`, `SLAT: True` | Hypervisor hardware (VT-x/EPT) activo y listo en placa base |
| **Estado de Servicios** | `vmcompute`, `vmms`, `docker`, `wsl` inactivos | **Ningún subsistema de contenedores/VM está preinstalado** |
| **Herramientas Actuales**| `wsl.exe` presente pero sin distros; `WindowsSandbox.exe` ausente | Requeriría instalación/habilitación con elevación Admin |

---

## 2. Diferenciación Crítica: Barreras de Seguridad Reales vs. Controles de Conveniencia

Uno de los principales errores en el diseño de agentes IA es confundir controles de conveniencia con límites de seguridad del sistema operativo:

> [!CAUTION]
> **Controles de Conveniencia (Falsas Fronteras de Seguridad):**
> - **Monkey-Patching de módulos en memoria:** Redefinir `net.connect = () => { throw ... }` o `fs.readFileSync` dentro de Node.js. Es eludible mediante `delete require.cache`, llamadas nativas `process.dlopen`, o invocación de binarios del sistema.
> - **Comprobaciones simples de cadenas (`startsWith`):** Validar rutas sin resolver enlaces simbólicos (`fs.realpathSync`) ni inspeccionar junctions NTFS intermedios.
> - **Variables de entorno "ocultas":** Pasar `process.env` esperando que el script no lea claves ajenas.
> - **Subproceso Node sin privilegios restringidos:** Un simple `child_process.spawn('node', ...)` hereda los permisos completos del usuario del host.

> [!IMPORTANT]
> **Barreras de Seguridad Reales (Garantizadas por el Kernel/Hardware):**
> - **Límites de Hypervisor (VT-x / EPT):** Aislamiento de memoria por hardware donde el código invitado no puede acceder a las páginas físicas del anfitrión (Hyper-V / MicroVMs).
> - **Espacios de Nombres y Cgroups de Linux (Namespaces / Cgroups v2):** Aislamiento de PID, red, montajes y recursos gestionados por el kernel de Linux (WSL2 / Docker Linux).
> - **Windows Job Objects y Restricted Tokens:** Restricción atómica de cuotas de CPU/RAM, límite de procesos hijos, terminación garantizada en cascada y stripping de tokens administrativos a nivel de kernel NT.

---

## 3. Matriz Comparativa de Tecnologías de Aislamiento en el Host

Se analizaron 5 opciones de sandboxing evaluadas específicamente contra el entorno real de JarBees:

| Criterio de Evaluación | 1. Windows Sandbox | 2. Hyper-V / MicroVM | 3. WSL2 (Linux VM) | 4. Docker Desktop | 5. Windows Job Objects + Restricted Tokens |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Tipo de Frontera** | Hypervisor descartable | Hypervisor completo | Hypervisor + Kernel Linux | Contenedor en VM Linux | Kernel NT (Job Objects + Tokens) |
| **Aislamiento de Procesos** | Total (VM dedicada) | Total (VM dedicada) | Total (VM Linux) | Alto (Namespaces) | Muy Alto (Restricted Token + Job) |
| **Aislamiento de Filesystem**| Total (Copia COW limpia) | Total (VHDX aislado) | Muy Alto (VHDX ext4) | Muy Alto (OverlayFS) | Alto (Ruta canónica + permisos NTFS)|
| **Aislamiento de Red (SSRF)**| Aislable por `.wsb` | Conmutable / VSwitch | Iptables / Network NS | Network Bridge aislado | Proxy local / IP Loopback |
| **Acceso a GPU (RTX 5070)** | Limitado (DirectX) | Completo (DDA) | Completo (CUDA WSL) | Completo (NVIDIA Toolkit) | **Nativo Directo (DirectX/CUDA)** |
| **Latencia de Arranque** | ~8 a 15 segundos | ~10 a 25 segundos | ~1 a 2 segundos | ~2 a 4 segundos | **< 10 milisegundos (Instantáneo)** |
| **Consumo de Memoria Base** | ~1.5 GB por sesión | ~2 GB por VM | ~1 GB (Vmmem) | ~2.5 GB (Docker engine) | **< 10 MB (Sobrecarga nula)** |
| **Disponibilidad en Host** | Inactivo (Requiere DISM)| Inactivo (Requiere DISM)| Instalado (Requiere distro)| No instalado en PATH | **100% Nativo en Windows 10 Pro** |
| **Elevación Requerida** | Admin para habilitar | Admin para crear | Admin para distro | Admin para instalar | **Ninguna (Opera como usuario normal)**|
| **Complejidad de Integración**| Alta (GUI / Scripts) | Muy Alta | Media (CLI `wsl.exe`)| Alta (Daemon Docker) | **Baja/Media (APIs de Win32)** |

---

## 4. Análisis Detallado de Cada Alternativa

### Opción 1: Windows Sandbox (`WindowsSandbox.exe`)
- **Ventajas:** Entorno 100% limpio y descartable en cada sesión. Si se infecta o colapsa, no queda rastro en el host.
- **Desventajas:** Diseñado principalmente como aplicación interactiva con GUI de usuario. Su automatización desatendida mediante CLI es frágil (depende de archivos `.wsb` y scripts de logon). Tiempo de inicio alto (10-15s), no apto para pruebas unitarias de 500 ms.
- **Veredicto para B2:** Inviable para el bucle de ejecución ágil de pruebas y herramientas de backend.

### Opción 2: Hyper-V / Máquina Virtual Dedicada
- **Ventajas:** Máxima seguridad y aislamiento por hardware. Posibilidad de snapshots inmutables.
- **Desventajas:** Alto costo operacional de mantenimiento de imágenes de SO, consumo permanente de RAM (mínimo 2-4 GB) y latencia prohibitiva de arranque por operación.
- **Veredicto para B2:** Sobrecarga excesiva para ejecuciones de corta duración.

### Opción 3: WSL2 con Entorno Desechable
- **Ventajas:** Aislamiento basado en hypervisor ligero; kernel Linux real con cgroups y namespaces; compatibilidad nativa con CUDA sobre la RTX 5070; arranque relativamente rápido (~1.5s).
- **Desventajas:** Actualmente el host no tiene ninguna distribución instalada (`wsl -l -v` devolvió 0 distros). Requiere instalación de imagen Linux (Ubuntu/Debian) y mantenimiento de dependencias duales (Windows y Linux).
- **Veredicto para B2:** **Excelente alternativa secundaria** para etapas avanzadas donde se requiera aislamiento estricto de red y herramientas nativas de Linux.

### Opción 4: Docker Desktop
- **Ventajas:** Estándar de la industria para contenedores efímeros; control de recursos y red mediante CLI.
- **Desventajas:** No está instalado en el sistema (`Get-Command docker` devolvió False). Introduce una capa pesada adicional en Windows (máquina virtual WSL2 subyacente para Docker Desktop).
- **Veredicto para B2:** Descartado para la fase inicial por requerir instalación externa masiva y permisos de Administrador.

### Opción 5: Aislamiento Nativo en Windows (Job Objects + Tokens Restringidos + AppContainers)
- **Ventajas:**
  - **Disponibilidad inmediata:** 100% nativo en el host actual sin instalar ningún componente externo, sin DISM y sin elevación de privilegios de Administrador.
  - **Latencia cero:** Creación de procesos en menos de 10 ms (ideal para suites de pruebas y verificación de código).
  - **Garantías de terminación:** `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` elimina al 100% los procesos huérfanos y fork bombs a nivel de kernel NT.
  - **Cuotas deterministas:** Límite de memoria estricto (`JOB_OBJECT_LIMIT_JOB_MEMORY`), cuota de CPU (`JOB_OBJECT_CPU_RATE_CONTROL_ENABLE`) y límite de procesos concurrentes.
  - **Acceso directo a la GPU:** Sin capas de virtualización adicionales para procesamiento audiovisual y 3D en la RTX 5070.
- **Desventajas:** El aislamiento de sistema de archivos no es un contenedor virtual; requiere que el Execution Broker aplique validación canónica estricta (`realpathSync`, anti-symlinks) sobre los workspaces.
- **Veredicto para B2:** **Opción recomendada y prioritaria para la Fase B2.1 / B2.2.**

---

## 5. Estrategia de Aislamiento Arquitectónico en 2 Capas

Para obtener el máximo equilibrio entre **seguridad real**, **cero fricción en el host** y **rendimiento extremo**, se propone una arquitectura de sandboxing escalonada:

```
┌────────────────────────────────────────────────────────────────────────┐
│             NIVEL 1: SANDBOX NATIVO WINDOWS (B2.1 - B2.3)             │
│  - Windows Job Objects (Límites de CPU, RAM, terminación atómica)      │
│  - Restricted Tokens (Stripping de privilegios, Low Integrity Level)   │
│  - Workspaces efímeros en carpetas temporales únicas (UUID)            │
│  - Cortafuegos de red en el Broker (Loopback/Private IP Block)         │
│  - Uso: Tests unitarios, scripts, generación de assets, renders 3D      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (Para escenarios de alta hostilidad)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             NIVEL 2: SANDBOX VIRTUALIZADO WSL2 (B2.4+)                 │
│  - Máquina virtual ligera WSL2 con red desacoplada                     │
│  - Namespaces de Linux (PID, Mount, Network, IPC)                      │
│  - Uso: Navegación web no supervisada, análisis de malware externo     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Veredicto y Recomendación para la Implementación

1. **Descartar Docker y Windows Sandbox:** Por requerir instalaciones invasivas, privilegios de administrador del sistema operativo y latencias operativas incompatibles con las tareas del asistente.
2. **Adoptar Windows Job Objects + Restricted Tokens como Sandbox Principal (B2.2):** Proporciona barreras de kernel robustas contra DoS, saturación de RAM, fuga de procesos y escalada de privilegios, sin tocar la configuración del sistema operativo.
3. **Mantener WSL2 como opción futura para aislamiento estricto de navegación (B2.3):** Evaluando su habilitación cuando el operador decida incorporar navegación web autónoma de alta hostilidad.

