# Auditoría Forense de Solo Lectura — `DEV-001`: Agentic Development Foundation

- **Fecha:** 6 de noviembre de 2026
- **Alcance:** Auditoría técnica estrictamente de solo lectura (`READ_ONLY`) sobre `JarvisService`, `CapabilityRegistry`, `CapabilityExecutor`, arnés de verificación (`src/jarvis/verification/`), seguridad/HITL (`src/jarvis/security/`), infraestructura Playwright (`src/jarvis/tools/browser/`), acceso al filesystem, herramientas de ejecución y enrutamiento de modelos (`RTX 5070 12 GB VRAM`).
- **Objetivo:** Determinar con exactitud qué porcentaje del **Entorno de Desarrollo Autónomo Asistido de JarBees (`DEV-001`)** ya está construido en el repositorio, qué piezas están desconectadas del flujo conversacional y qué componentes nuevos debemos construir para las Etapas 1, 2 y 3 (incluyendo el caso demostrador del **Módulo de Georreferenciación de Paraná**).

---

## 1. Hallazgo Ejecutivo Principal

Al igual que ocurrió en `MEM-001` con la memoria autobiográfica, **JarBees ya posee construido y testeado entre el 65% y el 70% del núcleo de ingeniería verificada**, desarrollado durante los hitos de *Verification Harness*, *JCA Fases 1–4* y *Action Gatekeeper*.

Sin embargo, hoy presenta **dos brechas estructurales críticas** que impiden que JarBees actúe como un entorno tipo *Kiro / Antigravity* desde una conversación en lenguaje natural:

1. **Ceguera de Repositorio en Etapa 1 (Falta de `CodebaseIndexer` y capacidades `READ_ONLY` de Filesystem):**
   - El arnés actual (`EngineeringMissionManagerService` y `VerificationHarnessService`) exige que el llamador le entregue manualmente por JSON la lista exacta de archivos (`entryFile` y `allowedFiles`).
   - JarBees **no tiene registradas capacidades de lectura de repositorio** (`list_dir`, `read_file`, `search_code`, `inspect_ast_symbols`, `read_dependencies`) en `CapabilityRegistry`. Por lo tanto, no puede explorar por sí mismo la estructura del proyecto antes de diseñar un plan.
2. **Desconexión entre `JarvisService.query()` y el Arnés de Ingeniería + Falta de `Git Worktrees` en Etapa 2:**
   - Aunque `JarvisController` ya expone 5 endpoints dedicados bajo `/api/jarbees/engineering/mission*` y `TaskEnvelopeService` ya contempla el contrato `CODE_EXECUTION` (`outputContract: 'DIFF_PATCH'`), **`JarvisService.query()` no tiene ninguna rama conectada a ellos**.
   - Cuando el usuario pide una tarea de ingeniería en el chat, `JarvisService` cae en el flujo conversacional estándar (`respondWithLLM`) sin poder inspeccionar el código ni abrir una misión.
   - Además, las mutaciones actuales operan sobre buffers en memoria y checkpoints SHA-256 en `storage/checkpoints/verification`, pero **no existe aún un `WorkspaceManager` basado en `git worktree`** ni un ejecutor de pruebas de proyecto (`npx jest --runInBand`) sobre un árbol Git aislado.

---

## 2. Mapa Forense: Los 9 Componentes de `DEV-001` vs. Estado Real en `src/jarvis/`

| # | Componente Propuesto (`DEV-001`) | Estado Actual | Implementación Existente en `src/jarvis/` | Qué Falta Construir o Conectar |
|---|---|---|---|---|
| **1** | **`DevelopmentOrchestrator`** (Ciclo: *Objective $\rightarrow$ Context $\rightarrow$ Spec $\rightarrow$ Plan $\rightarrow$ Execution $\rightarrow$ Verification $\rightarrow$ Review*) | 🟡 **Parcial (60%) — Desconectado del Chat** | • [`EngineeringMissionManagerService`](../src/jarvis/verification/engineering-mission-manager.service.ts): Gestiona presupuesto de tokens/tiempo/reparaciones (`EngineeringMissionBudget`), estados (`running`, `awaiting_human_approval`, `completed`, `rolled_back`) y endpoints REST en [`JarvisController`](../src/jarvis/jarvis.controller.ts#L267-L396).<br>• [`MissionEngineService`](../src/jarvis/mission/mission-engine.service.ts): Máquina de estados con evidencia SHA-256.<br>• [`TaskEnvelopeService`](../src/jarvis/tools/task-envelope/task-envelope.service.ts#L80-L90): Define `CODE_EXECUTION` con `outputContract: 'DIFF_PATCH'`. | • Crear `DevelopmentOrchestratorService` que una las 7 fases: **1) Exploración `READ_ONLY` del repo**, **2) Generación de Especificación y Diseño (`SpecArtifact`)**, **3) Plan de archivos**, **4) Ejecución en Worktree**, **5) Verificación**, **6) Presentación de Diff + HITL**.<br>• Conectarlo a [`JarvisService.query()`](../src/jarvis/jarvis.service.ts) cuando el intent/modo sea `DEVELOPER` / `CODE_EXECUTION`. |
| **2** | **`WorkspaceManager`** (Aislamiento en ramas `dev/<task-id>` y `git worktree`) | 🔴 **Faltante (15%)** | • [`EngineeringMissionManagerService.validateWorkspaceConfinement()`](../src/jarvis/verification/engineering-mission-manager.service.ts#L317-L364): Valida que ninguna ruta escape de `workspaceRoot` (`path.resolve`) y protege rutas críticas (`.env`, `src/jarvis/security/`, `src/jarvis/verification/`). | • Construir `WorkspaceManagerService` con soporte nativo para **`git worktree add storage/worktrees/<mission-id> -b dev/<mission-id>`**, `git status`, `git diff`, y limpieza segura del worktree tras merge o descarte. |
| **3** | **`CodebaseIndexer` / `WorkspaceExplorer`** (Archivos, AST, dependencias, símbolos, rutas NestJS, Prisma) | 🔴 **Faltante (10%)** | • [`StaticPreValidatorService`](../src/jarvis/verification/static-pre-validator.service.ts): Ya usa el compilador oficial `ts.createSourceFile` para recorrer el AST de archivos individuales.<br>• No existe indexador de proyecto ni herramientas de lectura de archivos para el agente. | • Construir `CodebaseIndexerService` + capacidades `READ_ONLY` en `CapabilityRegistry`:<br>  1. `repo_tree` / `list_files`<br>  2. `read_file_lines` (con números de línea)<br>  3. `search_code` (búsqueda rápida regex/símbolos)<br>  4. `inspect_nestjs_graph` (módulos, controllers, services y `prisma/schema.prisma`). |
| **4** | **`AgentToolRegistry` / `CapabilityRegistry` & `CapabilityExecutor`** (Permisos en 3 niveles) | 🟢 **Construido (85%) — Falta registrar tools de código** | • [`capability.interface.ts`](../src/jarvis/capabilities/capability.interface.ts#L16): **Ya define exactamente los 3 niveles**: `export type CapabilitySafetyLevel = 'READ_ONLY' | 'MUTATING' | 'SENSITIVE'`!<br>• [`CapabilityRegistry`](../src/jarvis/capabilities/capability-registry.service.ts) y [`CapabilityExecutor`](../src/jarvis/capabilities/capability-executor.service.ts): Ejecutan capacidades con `AbortController`, timeout, deduplicación y validación de `ContextPlan`.<br>• **Nota arquitectónica**: Existe un segundo servicio homónimo [`CapabilityRegistryService`](../src/jarvis/config/capability-registry.service.ts) que monitorea salud (`AVAILABLE`/`DEGRADED`/`UNAVAILABLE`) de 9 macro-capacidades. | • En [`JarvisService`](../src/jarvis/jarvis.service.ts#L140-L154) hoy solo se registran `MathCapability` y `WebSearchCapability`.<br>• Debemos registrar las capacidades de `DEV-001` clasificadas por su `safetyLevel` (`READ_ONLY` para exploración/lectura, `MUTATING` para edición en worktree/tests, `SENSITIVE` para merge a rama principal, Prisma migrations o `package.json`). |
| **5** | **`ExecutionSandbox`** (Terminal gobernada, límites de proceso, tiempo, memoria y red) | 🟡 **Parcial (70%)** | • [`IsolatedTestRunnerService`](../src/jarvis/verification/isolated-test-runner.service.ts): Ejecuta subprocesos Node con `--max-old-space-size`, bloquea salidas de red (`net`, `http`, `https`, `fetch`), limpia `process.env` para no filtrar secretos y verifica integridad SHA-256.<br>• [`SafeExecService`](../src/jarvis/security/safe-exec.service.ts): Ejecuta `spawn` con `shell: false` y `AbortController`, pero hoy solo permite binarios `python`/`python3`. | • Ampliar `ExecutionSandbox` con un `WorkspaceCommandRunner` que permita comandos de desarrollo en lista blanca estricta (`tsc --noEmit`, `npx jest --runInBand <file>`, `git status`, `git diff`) dentro del `git worktree` con `--runInBand` obligatorio (Regla Anti-OOM). |
| **6** | **`PatchManager`** (Diffs unificados, checkpoints, rollback atómico y aprobación HITL) | 🟢 **Construido (90%)** | • [`CheckpointManagerService`](../src/jarvis/verification/checkpoint-manager.service.ts): Snapshots inmutables con hash SHA-256 de árbol e integridad en `storage/checkpoints/verification`, detección de corrupción y rollback automático al *Best Checkpoint*.<br>• [`EngineeringMissionManagerService.computeMultiFileDiff()`](../src/jarvis/verification/engineering-mission-manager.service.ts#L455-L530): Calcula diffs unificados línea por línea (`+`/`-`) y retiene los cambios en estado `awaiting_human_approval` hasta recibir confirmación humana o token firmado. | • Conectar `PatchManager` con `git diff` nativo cuando la misión corra sobre un `git worktree`, manteniendo intactos los checkpoints SHA-256 y la compuerta `approveAndIntegrateMission()`. |
| **7** | **`VerificationEngine`** (Validación estática AST, test runner, reparación acotada y Playwright) | 🟢 **Construido (85%)** | • [`VerificationHarnessService`](../src/jarvis/verification/verification-harness.service.ts): Ciclo completo *Static Pre-Validator $\rightarrow$ Isolated Test Runner $\rightarrow$ Repair Controller $\rightarrow$ Best Checkpoint*.<br>• [`StaticPreValidatorService`](../src/jarvis/verification/static-pre-validator.service.ts): Valida sintaxis TS, complejidad ciclomática, exports y bloquea `eval`, `child_process` o path traversal.<br>• [`RepairControllerService`](../src/jarvis/verification/repair-controller.service.ts): Vector jerárquico de 5 niveles.<br>• [`BrowserToolService`](../src/jarvis/tools/browser/browser-tool.service.ts): **Playwright Chromium completo**, incluyendo captura de pantallas e **intercepción en vivo de APIs JSON/GeoJSON/GraphQL (`DetectedApi[]`)**. | • Agregar adaptador en `VerificationEngine` para ejecutar tests de integración NestJS (`npx jest --runInBand <spec>`) cuando el código editado use inyección de dependencias de NestJS (ya que `IsolatedTestRunnerService` hoy transpila archivos TS sueltos sin el contenedor de Nest). |
| **8** | **`DevelopmentMemory`** (Memoria episódica y autobiográfica de decisiones técnicas) | 🟢 **Construido (95%) — `MEM-001..003` Operativo** | • [`KnowledgeEvolutionService`](../src/jarvis/memory/knowledge-evolution.service.ts) + [`MemoryConsolidationService`](../src/jarvis/memory/memory-consolidation.service.ts): Recuperación determinista por ventana temporal SQL (`UTC-03:00`), distinción estricta entre `OBSERVED_FACT`, `HYPOTHESIS` y `DECISION`, verificación de procedencia documental en tabla `Chunk` y abstención honesta (`M1..M5 PASS`). | • Registrar automáticamente cada misión de `DEV-001` completada o rechazada como un episodio técnico (`eventType: 'engineering_mission'`, guardando el `Spec`, los archivos tocados, los tests ejecutados y la decisión arquitectónica tomada). |
| **9** | **`ModelRouter` & Presupuesto VRAM (`RTX 5070 12 GB`)** | 🟢 **Construido (90%)** | • [`ModelSelectionEngineService`](../src/jarvis/orchestration/model-selection-engine.service.ts): Calibrado para los **12,227 MB de VRAM de la RTX 5070**, calculando presupuesto de KV-cache y seleccionando entre `llama-3.2-3b`, `qwen2.5-7b`, `qwen2.5-coder-14b` y `bge-m3`.<br>• [`SpecialistCapabilityRouterService`](../src/jarvis/llm/specialist-capability-router.service.ts): Enruta `CODE_ASSIST` a `qwen2.5-coder:14B` (`llama-server.exe` con `--models-max 1` en puerto `8080`). | • Ajustar la tabla de perfiles de `ModelSelectionEngineService` para reflejar los modelos exactamente instalados hoy en `C:\AI\models` y Ollama (`qwen2.5-coder-14b-instruct-q4_k_m.gguf`, `Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf`, `Qwen3-8B-Q4_K_M.gguf`, `qwen3:4b`, `gemma3:4b`, `llama3.2:3b`). |

---

## 3. Auditoría Detallada de Seguridad y Gobernanza (Los 3 Niveles de Permiso)

La propuesta de dividir las herramientas en **Nivel 1 (Lectura libre)**, **Nivel 2 (Ejecución controlada en entorno aislado)** y **Nivel 3 (Confirmación obligatoria)** encaja de forma nativa con la infraestructura ya presente en `src/jarvis/`:

1. **Tipado Existente (`src/jarvis/capabilities/capability.interface.ts`):**
   - Línea 16: `export type CapabilitySafetyLevel = 'READ_ONLY' | 'MUTATING' | 'SENSITIVE';`
2. **Compuerta Criptográfica HITL (`src/jarvis/security/action-gatekeeper.service.ts`):**
   - `ActionGatekeeperService` ya emite tokens firmados con **HMAC-SHA256 de un solo uso (TTL 60 segundos, nonce anti-replay)** mediante `POST /api/jarbees/security/challenge`.
3. **Protección de Auto-Modificación (`src/jarvis/verification/engineering-mission-manager.service.ts`):**
   - Líneas 75–85 y 347–364: `protectedPathPatterns` ya bloquea cualquier intento de modificar `.env`, `package.json`, `package-lock.json`, `src/jarvis/security/**` o `src/jarvis/verification/**` a menos que el humano adjunte un `x-action-token` válido (`MISSION_MODIFY_PROTECTED_PATH`).
4. **Compuerta de Ejecución del Planner (`src/jarvis/security/action-execution-gate.service.ts`):**
   - Hoy permite `['search', 'scrape', 'read_memory', 'read_docs', 'summarize', 'deduplicate', 'save', 'respond', 'verify_code']`. Para `DEV-001`, agregaremos los pasos de exploración de código (`explore_repo`, `generate_spec`, `apply_worktree_patch`, `run_sandbox_tests`).

---

## 4. Auditoría de Infraestructura Playwright y Descubrimiento Web (Clave para el Caso Paraná)

Revisamos [`BrowserToolService`](../src/jarvis/tools/browser/browser-tool.service.ts) (692 líneas) y [`InvestigationService`](../src/jarvis/tools/web/investigation.service.ts):
- **Lo que ya hace `BrowserToolService`**:
  - Levanta una instancia persistente de Chromium Headless con Playwright (`getBrowser()`).
  - Además de extraer texto limpio y tomar capturas (`storage/screenshots`), **intercepta todas las respuestas de red (`page.on('response')`)** en `navigateWithApiDetection()` (líneas 405–465), capturando automáticamente endpoints `application/json`, `graphql` o `/api/` en la estructura `DetectedApi[]` (con `url`, `method`, `status`, `contentType` y `sampleBody`).
- **Por qué esto es oro puro para el Demostrador de Georreferenciación de Paraná**:
  - Cuando JarBees investigue fuentes abiertas de Paraná (OpenStreetMap Overpass API, Nominatim, portales de datos abiertos o visores GIS municipales/provinciales), `BrowserToolService` ya tiene la capacidad de detectar y capturar los esquemas JSON/GeoJSON reales devueltos por las APIs públicas.

---

## 5. Arquitectura de Implementación Recomendada por Etapas (`DEV-001`)

Para no sobre-construir ni poner en riesgo la estabilidad del sistema (ni los 12 GB de VRAM de la RTX 5070), recomendamos ejecutar `DEV-001` en tres etapas incrementales:

### Etapa 1 — `DEV-001A`: Lectura, Indexación Estructural y Especificación (`READ_ONLY`)
*Objetivo: Que JarBees pueda explorar su propio repositorio, entender la arquitectura real y generar una Especificación Técnica (`Spec` + `Design` + `Task List` al estilo Kiro) sin tocar un solo archivo.*

1. **`CodebaseIndexerService` (`src/jarvis/developer/codebase-indexer.service.ts`)**:
   - Escaneo rápido del árbol de directorios (respetando `.gitignore`, excluyendo `node_modules`, `dist`, `storage`).
   - Mapa estructural de módulos NestJS (`*.module.ts`, `*.controller.ts`, `*.service.ts`), modelos de `prisma/schema.prisma` y scripts de `package.json`.
   - Inspector de símbolos AST con TypeScript Compiler API (`ts.createSourceFile`) para extraer firmas de clases, métodos, DTOs e imports sin cargar archivos enteros en el prompt.
2. **Registro de Capacidades Nivel 1 (`READ_ONLY`) en `CapabilityRegistry`**:
   - `repo_map`: Devuelve el mapa de módulos, endpoints y entidades Prisma relevantes para una consulta.
   - `search_code`: Búsqueda textual/regex acotada sobre `src/` y `prisma/`.
   - `read_file_slice`: Lectura quirúrgica de rangos de líneas (`startLine..endLine`) con numeración.
3. **`SpecGeneratorService` (`src/jarvis/developer/spec-generator.service.ts`)**:
   - Dado un objetivo en lenguaje natural (ej. *"Agregar módulo de georreferenciación de Paraná"*), utiliza `CodebaseIndexerService` + `Qwen3-8B` / `Qwen2.5-Coder-14B` para producir un artefacto estructurado `EngineeringSpec`:
     - `requirements`: Requisitos funcionales y criterios de aceptación.
     - `architectureDesign`: Archivos existentes a reutilizar, archivos nuevos a crear, contratos DTO/REST y esquema de datos.
     - `taskList`: Pasos verificables ordenados.

### Etapa 2 — `DEV-001B`: `WorkspaceManager` (Git Worktrees), Edición y `ExecutionSandbox` (`MUTATING`)
*Objetivo: Que JarBees pueda aplicar un `EngineeringSpec` aprobado sobre un árbol Git aislado, compilar TypeScript y correr Jest con `--runInBand` sin afectar jamás el workspace principal.*

1. **`WorkspaceManagerService` (`src/jarvis/developer/workspace-manager.service.ts`)**:
   - Crea y administra worktrees aislados en `storage/worktrees/<missionId>` sobre ramas dedicadas `dev/<missionId>`.
   - Enlaza `node_modules` (junction/symlink en Windows) para que el worktree compile y ejecute tests instantáneamente sin duplicar gigabytes en disco ni ejecutar `npm install`.
2. **`WorkspaceCommandRunnerService` (`src/jarvis/developer/workspace-command-runner.service.ts`)**:
   - Lista blanca estricta de comandos permitidos dentro del worktree (`shell: false`):
     - `node ./node_modules/typescript/bin/tsc --noEmit`
     - `node ./node_modules/jest/bin/jest.js --runInBand <targetSpec>` (cumpliendo por diseño la regla Anti-OOM de `maxWorkers=1`).
     - `git status --short` / `git diff`
   - Redacción automática de secretos en `process.env` y timeout estricto por comando.
3. **Integración con `EngineeringMissionManagerService` y `VerificationHarnessService`**:
   - El ciclo de edición y reparación (`RepairControllerService` con hasta 3 intentos) ocurre dentro del worktree y genera el diff unificado final en estado `awaiting_human_approval`.

### Etapa 3 — `DEV-001C`: Orquestación Conversacional Completa y Demostrador "Georreferenciación de Paraná"
*Objetivo: Conectar `DevelopmentOrchestratorService` a `JarvisService` y validar el ciclo completo de punta a punta construyendo el módulo `src/geo-parana/`.*

1. **Conexión en `JarvisService` y `JarvisController`**:
   - Endpoints dedicados bajo `/api/jarbees/dev/*` (`POST /api/jarbees/dev/spec`, `POST /api/jarbees/dev/execute`, `POST /api/jarbees/dev/approve`) y detección automática en `JarvisService` cuando se invoca el modo Desarrollador.
   - Registro automático del episodio de ingeniería en la Memoria Autobiográfica (`MEM-001..003`).
2. **Caso Demostrador Real — Módulo `GeoParanaModule` (`src/geo-parana/`)**:
   - JarBees investigará las fuentes (Overpass API / Nominatim OpenStreetMap acotado al bounding box de Paraná, Entre Ríos `[-31.82, -60.58, -31.70, -60.45]` + dataset curado local con fallback offline), diseñará la especificación, implementará el módulo NestJS con sus endpoints (`/api/geo-parana/barrios`, `/calles`, `/espacios-verdes`, `/edificios-publicos`, `/puntos-interes`, `/buscar`), generará la suite `geo-parana.service.spec.ts`, la ejecutará con `--runInBand` y presentará el diff para aprobación humana.

---

## 6. Conclusión de la Auditoría `DEV-001`

No necesitamos construir un sistema de agentes desde cero:
- **Ya tenemos** el validador estático AST ([`StaticPreValidatorService`](../src/jarvis/verification/static-pre-validator.service.ts)), el gestor de checkpoints SHA-256 con rollback ([`CheckpointManagerService`](../src/jarvis/verification/checkpoint-manager.service.ts)), el controlador de reparación jerárquico ([`RepairControllerService`](../src/jarvis/verification/repair-controller.service.ts)), el gestor de presupuestos y diffs con aprobación humana ([`EngineeringMissionManagerService`](../src/jarvis/verification/engineering-mission-manager.service.ts)), la compuerta criptográfica HITL ([`ActionGatekeeperService`](../src/jarvis/security/action-gatekeeper.service.ts)), el navegador Playwright con detector de APIs ([`BrowserToolService`](../src/jarvis/tools/browser/browser-tool.service.ts)), el selector de modelos para la RTX 5070 ([`ModelSelectionEngineService`](../src/jarvis/orchestration/model-selection-engine.service.ts)) y la memoria autobiográfica (`MEM-001..003`).
- **Lo que nos falta es exactamente el "puente de lectura y aislamiento"**:
  1. **`CodebaseIndexerService` + Capacidades `READ_ONLY`** (para que JarBees pueda leer y comprender el repositorio y formular un `Spec` antes de tocar código).
  2. **`WorkspaceManagerService` (`git worktree`) + `WorkspaceCommandRunnerService` (`tsc` / `jest --runInBand`)** (para probar módulos NestJS completos en aislamiento total).
  3. **`DevelopmentOrchestratorService`** (para conectar el flujo conversacional con el arnés de ingeniería y la memoria episódica).

