# Informe de Laboratorio GPU: `GPUTaskman v0.3.5` en NVIDIA GeForce RTX 5070 (Blackwell 12 GB) y Arquitectura «JarBees GPU Observer»

**Fecha de ejecución:** 2026-11-10  
**Autor / Laboratorio:** JarBees AI Lab — Entorno Windows 11 x64 (WDDM)  
**Hardware auditado:** NVIDIA GeForce RTX 5070 (`PCI\VEN_10DE&DEV_2F04`, Compute Capability `12.0` Blackwell, 12 GB GDDR7)  
**Herramienta evaluada:** [`shanselman/gputaskman`](https://github.com/shanselman/gputaskman) (`v0.3.5`, portable `windows-x64`)

---

## 1. Resumen Ejecutivo

Se incorporó **`GPUTaskman v0.3.5`** al laboratorio de IA como herramienta portable de observación y auditoría profunda de VRAM en Windows (`tools/gputaskman/`, excluida del control de versiones mediante `.gitignore`).

A diferencia de `nvidia-smi` o del Administrador de tareas de Windows, `GPUTaskman` permitió medir por primera vez en la **RTX 5070 (12 GB)** de este equipo:
1. **La separación exacta entre Pesos del modelo (GGUF), Caché KV (`q8_0`) y Buffers de cómputo CUDA** dentro de `llama-server.exe` (`b11935`).
2. **El costo marginal real por token de la Caché KV (`KB/token`)** para cada arquitectura de la flota (`qwen2.5-coder:7b`, `qwen3:8b` y `qwen2.5-coder:14b`).
3. **El comportamiento real del paginador WDDM de Windows 11 (`SPILL` y `PAGED`)** cuando se carga un modelo pesado (`14B`), demostrando cómo Windows comprime y desplaza automáticamente texturas D3D11/D3D12 de `msedge.exe` y `Antigravity IDE.exe` hacia memoria paginada para preservar la VRAM dedicada del LLM.

---

## 2. Verificación Criptográfica e Instalación Portable

Siguiendo las buenas prácticas de seguridad del proyecto (`DEV-001-B1/B2`), antes de ejecutar el binario portable sin firma Authenticode se validó su hash SHA-256 contra el archivo oficial del release `v0.3.5`:

| Parámetro | Valor Verificado |
| :--- | :--- |
| **Release URL** | `https://github.com/shanselman/gputaskman/releases/tag/v0.3.5` |
| **Archivo ZIP** | `tools/gputaskman/gputaskman-0.3.5-windows-x64.zip` (`15,129,090` bytes) |
| **Ejecutable** | `tools/gputaskman/gputaskman-0.3.5-windows-x64/gputaskman.exe` (`7,365,275` bytes) |
| **SHA-256 Oficial** | `490F75DAD045E59B095F41B059655D9214580FB262A2DD7881E9B1133CA13800` |
| **SHA-256 Calculado** | `490F75DAD045E59B095F41B059655D9214580FB262A2DD7881E9B1133CA13800` (**MATCH EXACTO**) |

### Capturas JSON preservadas en el laboratorio
Todas las capturas estructuradas (`--json`) quedaron almacenadas en `tools/gputaskman/captures/`:
* `snapshot_01_current.json` — Línea base del sistema en reposo (sin LLM).
* `snapshot_02_qwen7b.json` — `qwen2.5-coder-7b-q4_k_m.gguf` (`ctx=8192`, `ctk/ctv=q8_0`).
* `snapshot_03_qwen14b.json` — `qwen2.5-coder-14b-q4_k_m.gguf` (`ctx=6144`, `ctk/ctv=q8_0`).
* `snapshot_04_qwen3_8b.json` — `qwen3-8b-q4_k_m.gguf` (`ctx=16384`, `ctk/ctv=q8_0`).

---

## 3. Identidad de Hardware y Telemetría WDDM en la RTX 5070

`GPUTaskman` validó con éxito el soporte completo para la arquitectura **NVIDIA Blackwell (Compute Capability `12.0`)** bajo Windows WDDM:

* **GPU:** `NVIDIA GeForce RTX 5070` (`LUID 0x000000000000f5ac`, `PCI\VEN_10DE&DEV_2F04&SUBSYS_176419DA&REV_A1`)
* **Driver / Runtime:** Driver `617.42` · `CUDA 13.4` · Modelo `WDDM`
* **VRAM Física Total (`mem_total`):** `12,820,938,752` bytes (`12.23 GiB` / `12,288 MiB`)
* **VRAM Reservada por Driver/Hardware (`mem_reserved`):** `298,844,160` bytes (`~285 MiB`)
* **VRAM Dedicada Utilizable WDDM (`dedicated_vram`):** `12,522,094,592` bytes (**`11.94 GB`**)
* **Memoria Compartida de Sistema (`shared_system`):** `17,053,861,888` bytes (**`15.88 GB`** en RAM DDR5 sobre `31.77 GB` totales)

---

## 4. Resultados Experimentales: Los 4 Escenarios Medidos en Vivo

### 4.1. Tabla Comparativa Consolidada (RTX 5070 — `11.94 GB` utilizables)

| Escenario | Modelo GGUF / Contexto | VRAM Placa Total | VRAM Proceso `llama-server` | Pesos (Weights) | KV Cache (`q8_0`) | Buffers + Runtime | Costo KV (`q8_0`) | Spill WDDM | VRAM Libre Restante |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Base (Idle)** | Sin LLM cargado (`P8`, `18 W`) | **0.65 GB** (`665 MB`) | `0 MB` | — | — | — | — | `41 MB` | **11.29 GB** |
| **2. Coder 7B** | `qwen2.5-coder-7b-q4_k_m` (`ctx=8192`) | **5.51 GB** | **4.62 GB** | **4.07 GB** | **238 MB** | **323 MB** | **30 KB/tok** | `102 MB` | **6.43 GB** |
| **3. General 8B** | `qwen3-8b-q4_k_m` (`ctx=16384`) | **7.16 GB** | **6.02 GB** | **4.53 GB** | **1.20 GB** | **297 MB** | **76 KB/tok** | `114 MB` | **4.78 GB** |
| **4. Coder 14B** | `qwen2.5-coder-14b-q4_k_m` (`ctx=6144`) | **9.73 GB** | **8.85 GB** | **7.96 GB** | **612 MB** | **304 MB** | **102 KB/tok** | `112 MB` | **2.21 GB** |

> **Nivel de evidencia alcanzado:** En los tres modelos GGUF, `GPUTaskman` reportó el nivel máximo de certeza:  
> `evidence: confirmed (api+mapped+cmdline)` — cruzando el endpoint `/props` y `/slots` de `llama-server` (`http://127.0.0.1:8089`), los descriptores de archivos mapeados en memoria del proceso y los argumentos de línea de comandos.

---

### 4.2. Análisis Detallado por Escenario

#### Escenario 1: Línea Base del Sistema (Sin modelos IA)
* **Consumo total de VRAM:** `665 MB / 11.94 GB` (`5.4%` de la placa), `45°C`, `18 W / 250 W` (estado de ahorro `P8`).
* **Distribución por procesos Windows:**
  * `Antigravity IDE.exe` (`D3D11`): `115 MB` VRAM (`5 MB` spill, `35 MB` paged).
  * `msedge.exe` (`D3D12+D3D11`): `108 MB` VRAM (`25 MB` spill, `49 MB` paged — texturas web y canvas/WebGL).
  * `dwm.exe` (`compositor`): `73 MB` VRAM (`7 MB` spill, `65 MB` paged — escritorio Windows).
  * `explorer.exe` (`D3D11`): `42 MB` VRAM.
  * `NVIDIA Overlay.exe` (`D3D11` + `CUDA`): `29 MB` + `14 MB` VRAM.

#### Escenario 2: `Qwen 2.5 Coder 7B` (`qwen2.5-coder-7b-q4_k_m.gguf`, `ctx=8192`, `q8_0`)
```text
== llama-server.exe (14824)  VRAM 4.62 GB
   LLM: Qwen2.5-Coder  [qwen2, 7.6B params, Q4_K_M, 28 layers, ctx_train 32768]
   evidence: confirmed (api+mapped+cmdline)
     4.07 GB  weights
      238 MB  KV cache (8,192 ctx, q8_0) est.
      323 MB  compute buffers + runtime
   - KV cost 30 KB/token (q8_0): 4k ctx = 119 MB, 32k ctx = 952 MB.
```
* **Hallazgo clave:** Gracias a que la arquitectura de 28 capas de `Qwen2.5-Coder 7B` utiliza GQA (Grouped-Query Attention) muy compacto, su costo de caché KV en `q8_0` es de apenas **`30 KB/token`**. Incluso llevándolo al máximo de **`32,768` tokens**, la caché KV ocupa solo **`952 MB`**, dejando más de **`5.7 GB` de VRAM libre** para ejecutar simultáneamente `bge-m3` (embeddings), Faster-Whisper o Blender headless.

#### Escenario 3: `Qwen 3 8B` (`qwen3-8b-q4_k_m.gguf`, `ctx=16384`, `q8_0`)
```text
== llama-server.exe (4328)  VRAM 6.02 GB
   LLM: Qwen3  [qwen3, 8.2B params, Q4_K_M, 36 layers, ctx_train 40960]
   evidence: confirmed (api+mapped+cmdline)
     4.53 GB  weights
     1.20 GB  KV cache (16,384 ctx, q8_0) est.
      297 MB  compute buffers + runtime
   - KV cost 76 KB/token (q8_0): 4k ctx = 306 MB, 32k ctx = 2.39 GB.
```
* **Hallazgo clave (Calibración de `ModelLifecycleService`):** En `ModelLifecycleService` (`src/jarvis/llm/model-lifecycle.service.ts`), el perfil estático de `qwen3:8b` estaba estimado en `5,500 MB` (`5.37 GB`). Sin embargo, `GPUTaskman` revela que con el contexto por defecto de `.env` (`LLAMACPP_CTX_SIZE=16384`), `Qwen3 8B` (36 capas) tiene un costo KV de **`76 KB/token`** (2.5 veces mayor por token que el 7B), por lo que su caché KV consume **`1.20 GB`** y el proceso total sube a **`6.02 GB`** (`~6,164 MB`). Aun así, quedan **`4.78 GB` libres** en la RTX 5070.

#### Escenario 4: `Qwen 2.5 Coder 14B` (`qwen2.5-coder-14b-q4_k_m.gguf`, `ctx=6144`, `q8_0`)
```text
== llama-server.exe (13240)  VRAM 8.85 GB
   LLM: Qwen2.5-Coder  [qwen2, 14.8B params, Q4_K_M, 48 layers, ctx_train 32768]
   evidence: confirmed (api+mapped+cmdline)
     7.96 GB  weights
      612 MB  KV cache (6,144 ctx, q8_0) est.
      304 MB  compute buffers + runtime
   - KV cost 102 KB/token (q8_0): 4k ctx = 408 MB, 32k ctx = 3.19 GB.
```
* **Explicación exacta de tus benchmarks previos (~9.85 GB):**
  * El proceso `llama-server.exe` toma **`8.85 GB`** (`7.96 GB` pesos + `612 MB` KV cache + `304 MB` buffers), y sumando el entorno gráfico de Windows (`~880 MB`), el uso total de la placa se clava en **`9.73 GB / 11.94 GB`**.
  * Con un costo KV de **`102 KB/token`**, sabemos con precisión matemática el techo de contexto seguro para `14B` en los 12 GB de la RTX 5070:
    * **`6,144` tokens (actual):** `612 MB` KV → Total placa `9.73 GB` (**Óptimo y seguro**, deja `2.21 GB` de margen para `bge-m3` y picos de escritorio).
    * **`12,288` tokens (máximo recomendado):** `1.22 GB` KV → Total placa `~10.34 GB` (Viable si no hay carga gráfica pesada concurrente).
    * **`32,768` tokens (prohibido en 12 GB):** `3.19 GB` KV → Total proceso `11.45 GB` + `0.88 GB` Windows = `12.33 GB` > `11.94 GB` (**Desborde WDDM garantizado** hacia RAM del sistema y colapso de velocidad).

---

### 4.3. Descubrimiento con `gputaskman diff`: Cómo reacciona Windows WDDM bajo presión

Al ejecutar `gputaskman.exe diff snapshot_01_current.json snapshot_03_qwen14b.json`, se observó cómo el planificador de memoria de video de Windows 11 (`WDDM`) protege la asignación CUDA de `llama-server.exe`:

| Proceso | VRAM Antes (Idle) | VRAM Después (Con 14B) | Cambio en VRAM Dedicada | Acción de WDDM (`PAGED`) |
| :--- | :---: | :---: | :---: | :--- |
| `llama-server.exe` | No listado | **8.85 GB** | **+8.85 GB** | `0 MB` paginados (100% residente en GDDR7) |
| `msedge.exe` (PID 12168) | `109 MB` | **23 MB** | **-86 MB** | Desplazó **347 MB a `PAGED`** para hacer lugar al LLM |
| `Antigravity IDE.exe` | `126 MB` | **49 MB** | **-76 MB** | Desplazó **41 MB a `PAGED`** |
| `csrss.exe` | `15 MB` | **7 MB** | **-8 MB** | Desplazó **54 MB a `PAGED`** |

Además, durante la prueba se detectó automáticamente un proceso OpenGL/D3D11 en segundo plano (`hl.exe`, PID 15900, consumiendo `45 MB` de VRAM y `18 MB` de spill), demostrando la utilidad de `GPUTaskman` para detectar procesos gráficos o juegos abiertos antes o durante la inferencia.

---

## 5. Comparativa: Perfiles Estáticos de JarBees vs. Medición Real `GPUTaskman`

En [`src/jarvis/llm/model-lifecycle.service.ts`](../src/jarvis/llm/model-lifecycle.service.ts), `ModelLifecycleService` define actualmente la tabla `VRAM_PROFILES`. Contrastando esa tabla con las mediciones empíricas:

| Modelo en `VRAM_PROFILES` | Estimación Estática Actual | Medición Real `GPUTaskman` (Proceso) | Medición Real (Placa Total con Windows) | Diagnóstico |
| :--- | :---: | :---: | :---: | :--- |
| `qwen2.5-coder:7b` (`ctx=8192`) | `4,800 MB` | **`4,731 MB`** (`4.62 GB`) | `5,642 MB` (`5.51 GB`) | Estimación actual muy precisa (`-69 MB`). |
| `qwen3:8b` (`ctx=16384`) | `5,500 MB` | **`6,164 MB`** (`6.02 GB`) | `7,331 MB` (`7.16 GB`) | Subestimado en **`664 MB`** cuando corre a `ctx=16384` debido al KV cache de `1.20 GB`. |
| `qwen2.5-coder:14b` (`ctx=6144`) | `10,250 MB` | **`9,062 MB`** (`8.85 GB`) | `9,963 MB` (`9.73 GB`) | El perfil estático (`10,250 MB`) incluye implícitamente el overhead del SO (`~900 MB`). |

---

## 6. Diseño Conceptual: Integración Futura «JarBees GPU Observer»

Siguiendo la estrategia acordada, **`GPUTaskman` permanece por ahora como herramienta aislada de laboratorio**, sin integrarse en el ciclo de ejecución en caliente de JarBees. Cuando se decida avanzar a la **Etapa 2 (`JarBees GPU Observer`)**, el diseño deberá respetar las siguientes directrices arquitectónicas y de seguridad:

### 6.1. Cumplimiento estricto del Security Kernel (`DEV-001-B1 / B2`)
* El validador `scripts/check_security_patterns.js` prohíbe invocar `child_process` (`exec`, `spawn`) fuera del `SafeExecService` / `ExecutionBrokerService`.
* **Patrón de integración recomendado:**
  1. **Modo Telemetría Bajo Demanda / Diagnóstico (`InferenceDiagnosticsService`):**
     * Registrar `gputaskman.exe --json --no-system` como comando permitido de solo lectura en `SafeExecService` (o ejecutarlo desde los scripts de benchmark en `scripts/`), que tarda apenas `~1.2 s` y evita muestrear la CPU/RAM general (`--no-system`).
  2. **Contrato de Datos (`GpuObserverSnapshot`):**
     * Extraer del JSON oficial de `GPUTaskman`:
       * `vram_total`, `vram_used`, `shared_used` (indicador de *WDDM spill* global).
       * Del proceso `llama-server.exe` u `ollama.exe`: `vram_bytes`, `shared_bytes` (*spill*), `paged_out_bytes`, y el desglose `weights`, `kv`, `runtime` + `evidence`.
       * Detección de procesos `kind: "game"` o alto uso de motor `3d` para alimentar el modo hibernación (`enterGamingMode()`) de `InferenceSupervisorService`.
  3. **Alertas Inteligentes de Presión de VRAM:**
     * Si `shared_bytes` (*spill*) o `paged_out_bytes` del proceso `llama-server.exe` superan los `250 MB`, JarBees sabrá que Windows WDDM está paginando capas o caché KV a la RAM DDR5 y podrá recomendar reducir `-c` (contexto) o hacer *downshift* automático de `14B` a `7B/8B`.

---

## 7. Comandos Rápidos de Referencia para el Laboratorio

Desde PowerShell en la raíz del proyecto (`c:\Projects\productos_crud_bkd`):

```powershell
# 1. Vista interactiva TUI en tiempo real (actualiza cada 1s)
.\tools\gputaskman\gputaskman-0.3.5-windows-x64\gputaskman.exe

# 2. Captura puntual en consola (solo GPU, ultra rápida sin muestreo de RAM/CPU de sistema)
.\tools\gputaskman\gputaskman-0.3.5-windows-x64\gputaskman.exe --once --no-system

# 3. Exportar captura estructurada JSON
.\tools\gputaskman\gputaskman-0.3.5-windows-x64\gputaskman.exe --json | Out-File .\tools\gputaskman\captures\mi_captura.json -Encoding utf8

# 4. Comparar dos estados (ej. antes y después de cargar un modelo o abrir Blender)
.\tools\gputaskman\gputaskman-0.3.5-windows-x64\gputaskman.exe diff .\tools\gputaskman\captures\snapshot_01_current.json .\tools\gputaskman\captures\snapshot_03_qwen14b.json
```

