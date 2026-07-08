# JarBees — Reporte de Arquitectura y Cobertura
**Fecha:** 2026-07-08  
**Base:** revisión completa del código fuente actual

---

## 1. Visión propuesta vs realidad actual

La propuesta es construir un **Sistema Operativo Personal** con estas capas:

```
JarBees
│
├── Memory          → Memoria a largo plazo sobre el usuario
├── Knowledge       → Base de conocimiento RAG
├── Browser         → Acceso a la web en tiempo real
├── Calendar        → Fechas, feriados, tiempo
├── Tasks           → Planner con pasos ejecutables
├── Research        → Investigación autónoma de temas
├── Programming     → Asistente técnico especializado
├── Vision          → OCR, análisis de imágenes
├── Automation      → Jobs, crons, alertas
├── Local Files     → Ingesta de PDFs y documentos locales
├── GitHub          → Integración con repositorios
├── Ollama          → LLM local
└── OpenRouter      → LLM externo (fallback/alternativo)
```

---

## 2. Inventario completo de módulos existentes

### 2.1 Módulos NestJS activos (`src/`)

| Módulo | Ruta | Estado |
|--------|------|--------|
| `AppModule` | `src/app.module.ts` | ✅ Activo |
| `LoggerModule` | `src/logger/` | ✅ Winston global |
| `PrismaModule` | `src/prisma/` | ✅ Global |
| `AuthModule` | `src/auth/` | ✅ JWT + Passport |
| `GoogleModule` | `src/google/` | ✅ Google OAuth |
| `ProductsModule` | `src/products/` | ✅ CRUD legacy |
| `AichatModule` | `src/aichat/` | ✅ Chatbot legacy + Model Router |
| `UploadModule` | `src/upload/` | ✅ Image → Base64 |
| `JarvisModule` | `src/jarvis/` | ✅ Agente principal |
| `JobsModule` | `src/jobs/` | ✅ Crons diarios |
| `BusinessSourceModule` | `src/jarvis/library/` | ✅ Biblioteca viva |
| `HRM` | `src/hrm/` | 🐍 Python standalone (spawn) |

---

## 3. Cobertura por capa del OS Personal

---

### 🟢 MEMORY — Cubierto (85%)

**Lo que existe:**

- `Memory` (DB) — contenido semántico natural, `category`, `importance`, `lastAccessed`
- `MemoryChunk` (DB) — fragmentos embeddables con `embeddingId`
- `MemoryRepository` — `create`, `search` (LIKE), `getTopImportant`, `getByCategory`
- `MemoryExtractorService` — **extracción automática** de hechos del mensaje del usuario via regex:
  - nombre, profesión, tecnologías usadas, preferencias de respuesta, ciudad, proyectos, intereses
  - detección de duplicados por similitud Jaccard
  - corre en background (no bloquea respuesta)
- `UserProfile` (DB) — nombre, timezone, país, idioma, preferencias JSON

**Lo que falta:**
- Búsqueda semántica real (pgvector): los `MemoryChunk.embeddingId` están preparados pero la búsqueda sigue siendo LIKE
- `PATCH /jarbees/memory/:id` para editar una memoria existente
- `DELETE /jarbees/memory/:id`

---

### 🟢 KNOWLEDGE (RAG) — Cubierto (80%)

**Lo que existe:**

- `Document` + `Chunk` (DB) — documentos con relación a `KnowledgeSource`
- `KnowledgeSource` (DB) — tipadas: `pdf`, `markdown`, `web`, `notion`, `github`, `postgres`, `api`
- `Collection` + `CollectionDocument` (DB) — agrupación de documentos
- `DocumentRepository` — `createDocument`, `createChunk`, `searchChunks`, `getLibraryStats`, `getMostRecentDocuments`
- `CollectionRepository` — `create`, `findAll`, `findById`, `addDocument`, `removeDocument`
- `DocumentIngestService` — ingesta de **texto, PDF y URL** con:
  - chunking deslizante con overlap (800 chars, 10% overlap)
  - generación de embeddings via `EmbeddingsService` (nomic-embed-text)
  - almacenamiento de embedding como JSON string (fallback antes de pgvector)
- `EmbeddingsService` — `generateEmbedding()` via Ollama API + `cosineSimilarity()` manual
- `RssIngestService` — procesamiento de feeds RSS con limpieza HTML via Cheerio
- `BusinessSourceService` — **catálogo de 30+ fuentes locales** (farmacias, hospitales, restaurantes, supermercados, electrónica, educación) con tags semánticas, TTL, prioridad y score de confianza
- `SitemapCrawlerService` — extrae y prioriza URLs desde sitemaps.xml con estrategias (`catalog`, `healthcare`, `education`, `corporate`)

**Lo que falta:**
- pgvector activo: embeddings están generados pero guardados como string, no como vector
- Reranker semántico para chunks
- Scraping activo de las BusinessSources (el pipeline existe, falta el trigger de ejecución completo)

---

### 🟢 BROWSER — Cubierto parcialmente (50%)

**Lo que existe:**

- `DocumentIngestService.ingestUrl()` — scraping de páginas web con Cheerio + limpieza HTML
- `SitemapCrawlerService` — navegación por sitemap para descubrir URLs
- `AssistantToolsService` — acceso a APIs externas en tiempo real:
  - clima: Open-Meteo + Nominatim
  - países: REST Countries
  - hora: WorldTimeAPI
  - feriados: Nager.Date
- `src/jarvis/tools/browser/` — carpeta existente (vacía, preparada para Playwright)
- `src/jarvis/tools/web/` — carpeta existente (vacía)

**Lo que falta:**
- Playwright para páginas con JS dinámico (SPAs)
- Búsqueda web en tiempo real (DuckDuckGo, SerpAPI, etc.)
- Manejo de autenticación en sitios scrapeados

---

### 🟢 CALENDAR — Cubierto (90%)

**Lo que existe en `AssistantToolsService`:**

- `isHolidayQuery` → feriados nacionales Argentina via Nager.Date API
- `isTimeQuery` → hora actual con timezone (WorldTimeAPI)
- `isAstronomyQuery` → fase lunar, eclipses, solsticios, amanecer/atardecer, planetas (astronomy-engine local)
- `isMayanCalendarQuery` → conversión a calendario Maya (cálculo matemático puro)
- `isHebrewCalendarQuery` → calendario hebreo (jewish-date)
- `isMathQuery` → calculadora (mathjs + Newton API)

**Lo que falta:**
- Integración con Google Calendar (leer/escribir eventos)
- Recordatorios / alertas proactivas por fecha

---

### 🟢 TASKS (Planner) — Cubierto (70%)

**Lo que existe:**

- `Task` + `TaskStep` (DB) — objetivo → pasos con `status`, `priority`, `category`, `project`
- `TaskRepository` — CRUD completo: `createTask`, `createTaskSteps`, `getTaskWithSteps`, `updateTaskStatus`, `updateStepStatus`, `findPendingTasks`, `clearPendingTasks`
- `PlannerService` — descompone un objetivo en pasos usando el LLM:
  - llama a Ollama con `temperature: 0.1` para JSON determinista
  - parsea el JSON de vuelta con fallback
  - guarda task + steps en DB
- `src/jarvis/tools/tasks/` — carpeta existente

**Lo que falta:**
- Endpoints REST expuestos para el Planner (`POST /jarbees/plan`, `GET /jarbees/tasks`)
- Ejecución automática de pasos (cada paso llama a una tool real)
- `PlannerService` no está registrado aún en `JarvisModule`

---

### 🟡 RESEARCH — Cubierto parcialmente (40%)

**Lo que existe:**

- `RssIngestService` — ingesta automática de feeds RSS
- `DailyJobsService` — job matutino que genera resumen de noticias + clima de Paraná (proactivo)
- `SitemapCrawlerService` — exploración de fuentes
- `BusinessSourceService` — catálogo de 30+ fuentes locales con keywords
- `AssistantToolsService` — consultas a APIs de tiempo real

**Lo que falta:**
- Búsqueda web en tiempo real (no hay integración con SerpAPI, DuckDuckGo, Brave Search)
- Síntesis automática de múltiples fuentes sobre un tema
- `src/jarvis/tools/web/` vacío (preparado pero no implementado)

---

### 🟢 PROGRAMMING — Cubierto (75%)

**Lo que existe:**

- `ModelRouterService` — 100+ keywords técnicas → enruta a `qwen3:4b` (experto técnico)
- `OllamaQwenModelService` — `qwen3:4b` con `temperature: 0.2`, `topK: 5`, `numCtx: 4096`, system prompt especializado en: NestJS, PostgreSQL, Drizzle, LangChain, pgvector, Ollama, Alfresco, arquitectura de software
- `SkillRegistryService` — carga skills desde archivos `.md`, las indexa por keywords y las inyecta en el prompt cuando son relevantes
- `AichatService` — responde preguntas técnicas con contexto RAG del historial de preguntas legacy

**Lo que falta:**
- Ejecutor de código (sandbox para TypeScript/Python)
- Integración con LSP para análisis estático
- Acceso a archivos del proyecto local en tiempo real

---

### 🔴 VISION — No implementado (5%)

**Lo que existe:**

- `POST /upload/image` — acepta imagen y retorna Base64
- Infraestructura de ingesta de PDFs (`DocumentIngestService.ingestPdf`)

**Lo que falta:**
- Modelo multimodal (LLaVA, Moondream, etc.) conectado a Ollama
- OCR de imágenes
- Análisis de capturas de pantalla
- Descripción de imágenes en el flujo de chat

---

### 🟢 AUTOMATION — Cubierto (65%)

**Lo que existe:**

- `DailyJobsService` con `@nestjs/schedule` + `@Cron`:
  - **Morning Briefing** (8:00 AM ARG) — resumen de noticias + clima de Paraná, guardado en `ConversationMessage`
  - **Nightly Processing** (3:00 AM ARG) — ingesta automática de fuentes RSS activas desde `KnowledgeSource`
  - Demo job comentado (cada 30 segundos, prueba de comportamiento proactivo)
- `AgentRun` (DB) — registro de cada ejecución con latencia, modelo, herramientas, éxito/fallo
- `DashboardService` — estadísticas agregadas: memorias, conversaciones, colecciones, documentos, runs, breakdown por modelo

**Lo que falta:**
- Webhooks / notificaciones externas (Telegram, Email, Pushover)
- Automatizaciones disparadas por el usuario ("avisame si llueve mañana")
- Playwright para automatización de navegador

---

### 🟡 LOCAL FILES — Cubierto parcialmente (55%)

**Lo que existe:**

- `DocumentIngestService.ingestPdf()` — extrae texto de PDF con `pdf-parse`, chunkea y genera embeddings
- `DocumentIngestService.ingestText()` — ingesta de Markdown y texto plano
- `DocumentIngestService.ingestUrl()` — scraping de páginas web
- `RssIngestService` — ingesta de feeds RSS
- Nightly job que procesa fuentes RSS activas automáticamente

**Lo que falta:**
- Watcher de carpeta local (`docs_inbox`) para ingesta automática de archivos nuevos
- Soporte de DOCX, PPTX, XLSX
- Indexación de archivos de código (`.ts`, `.py`)

---

### 🔴 GITHUB — No implementado (0%)

**Lo que existe:**

- `KnowledgeSource.type = 'github'` — soporte en el schema
- `src/jarvis/tools/` — carpeta preparada

**Lo que falta:**
- Todo: autenticación GitHub API, clone/fetch de repos, indexación de código, PR review

---

### 🟢 OLLAMA — Cubierto (90%)

**Lo que existe:**

- `OllamaProvider` (`ILLMProvider`) — genera texto con LangChain `ChatOllama`, registra latencia
- `OllamaModelService` (`llama3.2:3b`) — chat general
- `OllamaQwenModelService` (`qwen3:4b`) — experto técnico
- `EmbeddingsService` — embeddings via `POST /api/embeddings` de Ollama (`nomic-embed-text`)
- `resolveOllamaModelName()` — lee `OLLAMA_MODEL_NAME` o `OLLAMA_MODEL` del `.env`
- Config en `.env`: `OLLAMA_MODEL=llama3.2:3b`, `OLLAMA_MODEL_2=qwen3:4b`
- `ModelRouterService` — elige el modelo según keywords del prompt

**Lo que falta:**
- Embeddings en `OllamaProvider.embed()` (implementado en `EmbeddingsService` pero no conectado al provider abstracto)
- Soporte de streaming de respuestas

---

### 🟢 OPENROUTER — Cubierto (80%)

**Lo que existe:**

- `OpenRouterProvider` (`ILLMProvider`) — `mistralai/mistral-7b-instruct:free`
- Seleccionable via `provider: "openrouter"` en el request
- Lee `OPENROUTER_API_KEY` del `.env`
- Registra `tokensUsed` desde la respuesta de la API

**Lo que falta:**
- Soporte para más modelos (GPT-4, Claude, Gemini) — solo hay uno hardcodeado
- Selector dinámico de modelo externo

---

## 4. Cobertura por capa — Resumen visual

```
Memory          ████████░░  85%  ✅
Knowledge       ████████░░  80%  ✅
Browser         █████░░░░░  50%  🟡
Calendar        █████████░  90%  ✅
Tasks           ███████░░░  70%  ✅
Research        ████░░░░░░  40%  🟡
Programming     ███████░░░  75%  ✅
Vision          ░░░░░░░░░░   5%  🔴
Automation      ██████░░░░  65%  ✅
Local Files     █████░░░░░  55%  🟡
GitHub          ░░░░░░░░░░   0%  🔴
Ollama          █████████░  90%  ✅
OpenRouter      ████████░░  80%  ✅
─────────────────────────────────
Cobertura total ~65%
```

---

## 5. Base de datos — 15 modelos activos

| Modelo | Propósito | Estado |
|--------|-----------|--------|
| `UserProfile` | Perfil adaptativo del usuario | ✅ Con repo + endpoints |
| `Memory` | Hechos persistentes (extracción automática) | ✅ Con repo + extractor |
| `MemoryChunk` | Embeddings de memorias | 🟡 Schema OK, sin búsqueda semántica real |
| `ConversationMessage` | Historial multi-sesión | ✅ Con repo + endpoints |
| `SessionSummary` | Resúmenes progresivos cada 10 mensajes | ✅ Automático |
| `KnowledgeSource` | Registro de fuentes (RSS, web, PDF, etc.) | ✅ Con catálogo de 30+ fuentes |
| `Document` | Documentos ingestados | ✅ Con ingesta completa |
| `Chunk` | Fragmentos embeddables | ✅ Con embeddings generados |
| `Collection` + `CollectionDocument` | Agrupación de documentos | ✅ Con repo completo |
| `Task` + `TaskStep` | Planner con pasos | ✅ Con repo + PlannerService |
| `Feedback` | Calificación de respuestas | ✅ Con repo, sin endpoint público |
| `Tool` | Registro dinámico de tools | 🟡 Schema OK, sin CRUD expuesto |
| `AgentRun` | Observabilidad completa | ✅ Con stats + endpoint |
| `Product` / `Pregunta` | Legacy | 🟡 Mantener temporalmente |

---

## 6. Endpoints REST expuestos (`/api/jarbees/*`)

| Método | Ruta | Propósito |
|--------|------|-----------|
| POST | `/jarbees/query` | Consulta principal |
| GET/POST | `/jarbees/memory` | CRUD de memorias |
| GET | `/jarbees/memory/:id` | Recuperar memoria |
| POST | `/jarbees/document/ingest` | Ingestar texto |
| GET | `/jarbees/document/search` | Buscar documentos |
| GET/PATCH | `/jarbees/profile` | Perfil de usuario |
| GET | `/jarbees/identity` | Identidad de JarBees |
| GET | `/jarbees/capabilities` | Capacidades activas |
| GET | `/jarbees/skills` | Skills cargadas |
| GET | `/jarbees/skills/relevant` | Skills relevantes para query |
| GET | `/jarbees/tools` | Tools habilitadas |
| GET | `/jarbees/observability/stats` | Métricas agregadas |
| GET | `/jarbees/observability/runs` | Runs recientes |

**Endpoints pendientes de exponer:**
- Planner: `POST /jarbees/plan`, `GET /jarbees/tasks`
- Feedback: `POST /jarbees/feedback`
- Collections: `GET/POST /jarbees/collections`
- PDF ingest: `POST /jarbees/document/pdf`
- URL ingest: `POST /jarbees/document/url`
- RSS: `POST /jarbees/library/rss`

---

## 7. Infraestructura transversal

| Componente | Estado |
|------------|--------|
| **Logger Winston** — rotación diaria, consola colorizada | ✅ |
| **JWT Auth** — 30 días, guard global con `@Public()` decorator | ✅ |
| **Google OAuth** | ✅ |
| **Swagger** — documentación en `/api/docs` | ✅ |
| **ConfigModule** — `.env` global | ✅ |
| **Crons** — `@nestjs/schedule`, Morning Briefing + Nightly Processing | ✅ |
| **Observabilidad** — `AgentRun` con latencia, modelo, tools usadas | ✅ |
| **Dashboard** — stats agregadas de toda la plataforma | ✅ |

---

## 8. Prioridades recomendadas (próximos pasos)

### Alta prioridad (infraestructura crítica)

1. **pgvector** — activar embeddings nativos en PostgreSQL. `EmbeddingsService` ya genera los vectores, solo falta el campo `embedding vector(768)` en `Chunk` y `MemoryChunk` y una función de búsqueda por coseno.

2. **Exponer endpoints del Planner** — `PlannerService` existe y funciona pero no tiene rutas REST. Agregar a `JarvisController`.

3. **Conectar `MemoryExtractorService`** al flujo principal — se llama automáticamente en `JarvisService.query()`, verificar que esté registrado en el módulo.

### Media prioridad (capacidades nuevas)

4. **Browser con Playwright** — `src/jarvis/tools/browser/` está vacío. Agregar `PlaywrightService` para páginas con JS dinámico (SPAs, React, etc.).

5. **Búsqueda web en tiempo real** — integrar SerpAPI, Brave Search o DuckDuckGo para consultas sobre el presente.

6. **Endpoints de ingesta completos** — exponer PDF, URL y RSS en el controller para que el frontend pueda gestionar la biblioteca.

### Baja prioridad (largo plazo)

7. **Vision** — conectar LLaVA o Moondream via Ollama para análisis de imágenes y OCR.

8. **GitHub** — autenticación y indexación de repos para asistente de código con contexto real del proyecto.

9. **Notificaciones** — Telegram bot o email para que los crons matutinos lleguen al usuario.

---

## 9. Hardware actual vs capacidades

Con **32 GB RAM + CPU** (sin GPU dedicada):

| Capacidad | Viabilidad |
|-----------|-----------|
| `llama3.2:3b` en producción | ✅ Fluido |
| `qwen3:4b` para técnico | ✅ Fluido |
| `nomic-embed-text` para embeddings | ✅ Fluido |
| Varios modelos pequeños simultáneos | ✅ Cómodo con 32 GB |
| Base vectorial grande en memoria | ✅ Cómodo |
| Procesamiento de PDFs y documentos | ✅ Sin problemas |
| OCR + Vision (LLaVA) | 🟡 Lento en CPU, usable |
| Playwright mientras backend responde | ✅ Con memoria suficiente |
| Modelos 13B+ | 🔴 Muy lento en CPU |
