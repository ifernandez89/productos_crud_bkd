# JarBees — Arquitectura del Sistema
**Última revisión:** 21 de Julio 2026 (Actualizado post git pull: EvidenceService, Control de Alucinaciones, Sanitización PDF y Model Rankings)  
**Stack real del repo:** NestJS + Prisma + PostgreSQL + Ollama/OpenRouter + Playwright + TypeScript  
**Ruta base real:** /api/jarbees/* (el prefijo global /api se define en src/main.ts)

---

## 1. Filosofía de diseño

JarBees no es un chatbot. Es un **Sistema Operativo Personal** construido sobre capas de memoria, conocimiento, ejecución y observabilidad:

```
Usuario
  ↓
JarvisController (/api/jarbees)
  ↓
JarvisService (orquestador principal)
  ↓
IntentRouter + Planner + ExecutionEngine
  ↓
Tools Layer (AssistantTools · Google Workspace · Browser · Astrology · Sports · Tasks)
  ↓
Knowledge Layer (RAG local · embeddings · documentos · fuentes web)
  ↓
Memory Layer (memorias · resumen de sesión · knowledge evolution)
  ↓
LLM Provider (Ollama / OpenRouter)
  ↓
Respuesta
```

El LLM es un **componente reemplazable**. La inteligencia real está en las capas anteriores, especialmente en el router, la memoria y la biblioteca de conocimiento.

---

## 2. Módulos NestJS activos

| Módulo | Ruta | Responsabilidad |
|--------|------|-----------------|
| `AppModule` | `src/app.module.ts` | Raíz, imports globales |
| `LoggerModule` | `src/logger/` | Winston global, rotación diaria |
| `PrismaModule` | `src/prisma/` | Acceso a PostgreSQL |
| `AuthModule` | `src/auth/` | JWT (30d) + Passport + `@Public()` decorator |
| `GoogleModule` | `src/google/` | OAuth2 para Calendar y Tasks |
| `AichatModule` | `src/aichat/` | Chatbot legacy con Model Router dual |
| `UploadModule` | `src/upload/` | `POST /upload/image` → Base64 |
| **`JarvisModule`** | `src/jarvis/` | **Agente principal — todo lo nuevo va aquí** |
| **`BalanceModule`** | `src/modules/balance/` | **Balance Energético turn-by-turn adaptativo y basado en ciclos** |
| `JobsModule` | `src/jobs/` | Crons diarios (Morning Briefing, Nightly Processing) |
| `HRM` | `src/hrm/` | Python ML standalone (invocado por spawn) |

---

## 3. Base de datos — modelos principales del esquema actual

El esquema de Prisma está orientado a PostgreSQL y contiene los modelos que el runtime de Jarvis usa en la práctica. No todos forman parte de la misma capa, pero todos son relevantes para el sistema real.

### Compatibilidad legacy
| Modelo | Propósito |
|--------|-----------|
| `Product` | CRUD de productos original |
| `Pregunta` | Historial legacy del chatbot |

### Memoria y conversaciones
| Modelo | Propósito |
|--------|-----------|
| `UserProfile` | Perfil adaptativo: timezone, país, idioma y preferencias JSON |
| `UserCredential` | Tokens OAuth para Google Calendar, Gmail, Drive, etc. |
| `Memory` | Hechos persistentes en lenguaje natural |
| `MemoryChunk` | Fragmentos de memoria con soporte de embeddings |
| `ConversationMessage` | Historial multi-sesión por `sessionId` |
| `SessionSummary` | Resumen progresivo para evitar contexto gigante |

### Conocimiento y RAG
| Modelo | Propósito |
|--------|-----------|
| `KnowledgeSource` | Fuentes tipadas: `pdf`, `markdown`, `web`, `rss`, `github`, `api` |
| `Document` | Documentos ingestados con título, contenido, categoría y status (`not_indexed`, `indexing`, `ready`, `quarantined`). Rastrea progreso de indexado (`progressIndex`, `progressEmbed`, `progressSummary`) y almacena la Ficha de Conocimiento en `summary`. |
| `Chapter` | Capítulos estructurados del documento para la ingesta jerárquica con embeddings macro. |
| `Section` | Secciones jerárquicas vinculando fragmentos de texto (chunks) para búsquedas en dos capas. |
| `Chunk` | Fragmentos embeddables de texto con vinculación opcional a secciones y soporte nativo pgvector (`vector(1024)`). |
| `Collection` + `CollectionDocument` | Agrupación temática de documentos |

### Balance Energético (JarBees v2.1)
| Modelo | Propósito |
|--------|-----------|
| `BalanceSession` | Sesiones de balance de energía con contexto astrológico y resultados de autoevaluación. |
| `BalanceAnswer` | Respuestas de la entrevista adaptativa turn-by-turn. |
| `BalanceReport` | Análisis y recomendaciones estructuradas en 7 dimensiones. |

### Planner, herramientas y observabilidad
| Modelo | Propósito |
|--------|-----------|
| `Task` + `TaskStep` | Planner: objetivo → pasos ejecutables con status |
| `Feedback` | Score y comentarios por respuesta |
| `Tool` | Registro dinámico de herramientas habilitadas |
| `AgentRun` | Observabilidad: latencia, modelo, herramientas, éxito/fallo |

### Web acquisition y cache
| Modelo | Propósito |
|--------|-----------|
| `Source` | Fuentes web registradas con TTL y prioridad |
| `ScrapedPage` + `ScrapedContent` | Caché de páginas con expiración |
| `Query` | Analytics de consultas y cache hits |

---

## 4. Intent Router — el clasificador central

Cada mensaje pasa por `IntentRouterService` **antes** de cualquier acción:

```
Mensaje del usuario
      ↓
 fastClassify()     ← reglas regex — instantáneo, sin LLM
      ↓
 confidence high/medium → ejecutar
 confidence low         → llmClassify() via Ollama (temperature=0, 1 token)
```

**Intenciones disponibles:**

| Intent | Ejemplo | Destino |
|--------|---------|---------|
| `LOCAL` | "¿Qué es pgvector?" | Memoria + RAG + LLM |
| `WEB` | "Noticias de hoy" | DomainRouter → ContentCache → Browser |
| `URL` | "https://..." | BrowserTool → LLM |
| `TOOL` | "¿Cuánto es 25²?" | AssistantToolsService directo |
| `SPORTS` | "¿Ganó Argentina?" | SportsTool → fallback WEB |
| `ASTROLOGY` | "Energía lunar hoy" | AstrologyTool calculado localmente |
| `CALENDAR` | "¿Qué tengo hoy?" | GoogleCalendarService |
| `TASKS` | "Mis tareas pendientes" | GoogleTasksService |
| `SITE_SEARCH` | "Noticias en elonce" | BrowserTool con site: |
| `REPEAT` | "Repetí eso" | ConversationRepository.getLastAssistantMessage() |

### 4.1 Ampliación reciente del router (julio 2026)

El router ya no solo clasifica comandos simples: ahora funciona como un orquestador híbrido para múltiples superficies de interacción. El flujo actual combina:

- clasificación rápida por reglas y keywords,
- routing a servicios especializados como Google Calendar, Gmail, Drive y YouTube,
- activación de skills cognitivas cuando la consulta requiere razonamiento modular,
- selección de modo de búsqueda persistente: `OFFLINE`, `LOCAL_FIRST`, `HYBRID` o `WEB_FIRST`.

**Intents añadidos recientemente:**

| Intent | Ejemplo | Destino |
|--------|---------|---------|
| `GMAIL` | "mis emails", "busca en mi correo" | `GoogleGmailService` |
| `DRIVE` | "mis archivos de Drive", "sincronizá Drive" | `GoogleDriveService` |
| `YOUTUBE` | "busca un video de NestJS" | `YouTubeService` |

Esta evolución permite que Jarvis responda tanto desde memoria y RAG local como desde servicios externos, respetando el contexto del usuario y el modo de ejecución elegido.

---

## 5. Execution Engine *(nuevo)*

El `ExecutionEngine` es el puente entre el Planner y las herramientas reales. Transforma un plan de pasos en acciones ejecutables secuenciales.

**Flujo completo:**

```
POST /jarbees/planner/execute  { objective: "Investigá los últimos avances en baterías" }
      ↓
PlannerService.createAndExecute()
      ↓
LLM genera plan JSON → [search, scrape, summarize, save, respond]
      ↓
ExecutionEngine.execute(plan)
      ├── step 1: search("avances baterías estado sólido") → BrowserTool.search()
      ├── step 2: scrape(url) → BrowserTool.fetch()
      ├── step 3: summarize(context) → LLM
      ├── step 4: save → DocumentIngestService
      └── step 5: respond → LLM genera respuesta final
      ↓
Respuesta + savedToKnowledge: true
```

**Tipos de pasos:**

| Tipo | Acción |
|------|--------|
| `search` | Búsqueda web via Playwright/Google |
| `scrape` | Scrapear URL específica |
| `read_memory` | Consultar memorias relevantes |
| `read_docs` | Consultar documentos RAG |
| `summarize` | Resumir contexto acumulado con LLM |
| `deduplicate` | Eliminar oraciones repetidas (similitud Jaccard) |
| `save` | Guardar resultado en Knowledge Library |
| `respond` | Generar respuesta final al usuario |

El engine acumula el output de cada paso como contexto para el siguiente. Si un paso falla, continúa con el siguiente siempre que haya contexto acumulado.

### 5.1 Refactor reciente del pipeline (julio 2026)

El pipeline de prompt y ejecución fue reorganizado para reducir fricción entre el planner, la selección de contexto y la respuesta final. Los cambios más importantes son:

- centralización de la construcción del contexto de Jarvis,
- mejor separación entre planificación, ejecución y generación de respuesta,
- soporte para contexto pre-cargado desde RAG y conocimiento local,
- manejo más robusto de pasos fallidos y continuidad del flujo.

### 5.2 Compuerta de Seguridad (ActionExecutionGate)

Para evitar que el agente ejecute acciones destructivas o no autorizadas de manera autónoma (o mediante inyección de prompts indirecta), se implementó `ActionExecutionGateService` en el motor de ejecución:
- **Intercepción y Validación**: Todo paso de ejecución del planner pasa por la compuerta antes de activar la herramienta correspondiente.
- **Validación de Parámetros**: Se validan los argumentos de las herramientas contra un esquema seguro y lista blanca.
- **Human-in-the-Loop (HITL)**: Requiere explícitamente confirmación del usuario para acciones que modifican o destruyen el estado del sistema (como `drop` o `delete`).
- **Auditoría Estricta**: Cada acción crítica rechazada, pendiente o aprobada se registra cronológicamente en `logs/security_audit.log`.

---

## 6. Knowledge Evolution *(nuevo)*

El diferencial real de JarBees frente a cualquier chatbot genérico.

**Pregunta que solo JarBees puede responder:**
> "¿Cómo cambió mi opinión sobre Qwen en los últimos 6 meses?"
> "¿Cómo evolucionó mi arquitectura de backend?"

**Cómo funciona:**

```
Cada conversación significativa
        ↓
KnowledgeEvolutionService.extractAndSave()  ← corre en background, no bloquea
        ↓
LLM extrae: { topic, conclusion, tags }
        ↓
Persiste en TopicSnapshot (topic + fecha + conclusión + tags)
        ↓
GET /jarbees/evolution?topic=Qwen&days=180
        ↓
getEvolution() → ordena snapshots por fecha → genera narración con LLM
        ↓
{
  topic: "Qwen",
  firstMentioned: "01 ene. 2026",
  lastMentioned: "13 jul. 2026",
  totalMentions: 12,
  evolution: [ { date, summary, tags }, ... ],
  narrative: "Hace 6 meses preferías llama3.2:3b por velocidad. En marzo descubriste que qwen3:4b era superior para código. Ahora lo usás como experto técnico con temperature=0.2..."
}
```

Se activa automáticamente en `saveAndObserve()` después de cada respuesta.

---

## 7. Browser — navegación real con Playwright

`BrowserToolService` implementa estrategia dual:

```
fetch(url)
  ├── 1. Playwright (headless Chromium)
  │     ├── bloquea imágenes/fonts/analytics
  │     ├── usa domcontentloaded (10x más rápido que networkidle)
  │     ├── scroll profundo en 3 pasos (300ms entre pasos)
  │     ├── detecta APIs/endpoints JSON interceptando responses
  │     └── extrae: título, descripción, titulares, texto, links, APIs detectadas
  │
  └── 2. axios + cheerio (fallback si Playwright da < 300 palabras)
```

**Método `search()`** — búsqueda en Google via Playwright:
- Navega a `google.com/search?q=...`
- Extrae resultados: título, URL, snippet
- Sin API key, completamente gratuito

**ContentCacheService** — caché inteligente con TTL por categoría:
- `valid` / `expired` / `stale`
- Analytics: cache hits, miss rate, fuentes más usadas
- Limpieza automática de páginas expiradas

---

## 8. Memory — extracción automática

`MemoryExtractorService` analiza cada mensaje del usuario buscando hechos persistentes:

```
"Trabajo con NestJS y PostgreSQL"
    ↓
Detecta pattern: tecnologías
    ↓
Guarda: "El usuario trabaja con NestJS" [skill:7]
         "El usuario trabaja con PostgreSQL" [skill:7]
    ↓
Deduplica por similitud Jaccard (evita guardar dos veces lo mismo)
```

Patrones detectados automáticamente:
- Nombre del usuario
- Profesión / tecnologías / frameworks
- Preferencias de respuesta (corta, con código, etc.)
- Ciudad / país
- Proyectos en desarrollo
- Intereses y pasiones
- Comandos explícitos: "Recordá que..."

---

## 9. LLM Provider Abstraction

```typescript
interface ILLMProvider {
  generate(options: LLMGenerateOptions): Promise<LLMGenerateResponse>
  embed(text: string): Promise<LLMEmbeddingResponse>
  getProviderName(): string
  getDefaultModel(): string
}
```

**Providers implementados:**

| Provider | Modelo | Uso |
|----------|--------|-----|
| `OllamaProvider` | `llama3.2:3b` | Chat general, default |
| `OllamaQwenModelService` | `qwen3:4b` | Técnico (NestJS, SQL, código) |
| `OpenRouterProvider` | `mistral-7b-instruct:free` | Externo, flag `provider: "openrouter"` |

### 9.1 Ranking y Evaluación de Modelos (julio 2026)
- **🥇 Qwen 3 4B (Puntaje: 9.8/10)**: Modelo recomendado para RAG (Recuperación y Contexto), Documentación, Programación y Código, Seguimiento de Instrucciones Estructuradas y Conocimiento Técnico.
- **🥈 Gemma 3 4B (Puntaje: 9.6/10)**: Modelo recomendado para Resúmenes y Síntesis Larga, Escritura y Redacción Creativa, Conversación General y Empatía.

**Model Router** en `/aichat` — elige automáticamente entre modelos:
- 100+ keywords técnicas → `qwen3:4b`
- Conversación general → `llama3.2:3b` / `gemma3:4b`

Mañana podés agregar `OpenAIProvider`, `GeminiProvider`, `ClaudeProvider` sin tocar el resto.

---

## 10. Tools especializadas

### AssistantToolsService (8 tools directas)
Resuelven **sin LLM**, instantáneamente:

| Tool | Trigger | API |
|------|---------|-----|
| 🌤 Clima | clima, temperatura, lluvia... | Open-Meteo + Nominatim |
| 📅 Feriados | feriado, asueto... | Nager.Date (Argentina) |
| 🕐 Hora | qué hora, zona horaria... | WorldTimeAPI |
| 🌍 Países | capital, moneda, idioma... | REST Countries v3.1 |
| 🔭 Astronomía | eclipse, solsticio, amanecer... | astronomy-engine (local) |
| 🗓 Maya | tzolkin, haab, cuenta larga... | Cálculo matemático puro |
| ✡️ Hebreo | fecha hebrea, shabbat... | jewish-date (local) |
| ➕ Matemáticas | calcula, derivada, integral... | mathjs + Newton API |

### AstrologyTool
Calcula en tiempo real sin API externa:
- Posiciones planetarias actuales (Sol, Luna, Mercurio, Venus, Marte, Júpiter, Saturno)
- Fase lunar, iluminación, próximas fases
- Energía del día y clima astrológico
- `getTodaySkyData()` / `getPlanetaryPositions()`

### SportsTool
Cascada de fuentes:
```
API deportiva → DuckDuckGo → scraping Playwright → respuesta LLM
```

### GoogleCalendarService / GoogleTasksService
- OAuth2 con tokens persistidos
- `getUpcomingEvents()` — agenda de los próximos días
- `getPendingTasks()` — tareas pendientes de Google Tasks

### Google Workspace + YouTube (nuevo)
Jarvis amplió su capa de herramientas con integración nativa para Google Workspace y YouTube:

- **Google Calendar**: agenda diaria, eventos por rango, detección de conflictos y creación de reuniones con Meet.
- **Gmail**: correos importantes, correos del día, búsqueda por texto y redacción de borradores.
- **Google Drive**: búsqueda de archivos, listado reciente y sincronización de documentos a la biblioteca RAG.
- **YouTube**: búsqueda de videos, extracción de metadata y soporte para URLs de video.

Los permisos OAuth fueron extendidos para cubrir `gmail.readonly`, `gmail.compose`, `drive.readonly`, `drive.file` y `userinfo.email`.

### Skills cognitivas (nuevo)
El orquestador puede cargar skills de razonamiento modular desde `skills/` para reforzar respuestas complejas. Estas skills no cambian el núcleo, sino que enriquecen el contexto del LLM cuando la consulta lo requiere:

- epistemología
- lógica formal
- teoría de decisiones
- método científico

### SourceRegistry y búsquedas priorizadas
Jarvis usa `SourceRegistry` y `WebHelper` para priorizar fuentes confiables por categoría cuando necesita búsquedas web o scraping dirigido.
- `SourceRegistry` mantiene un catálogo de fuentes tipadas por dominio y categoría.
- `WebHelper` genera URLs de búsqueda especializadas y scrapea páginas con selectores definidos por fuente.
- `JarvisWebSearchService` usa esta capa para enriquecer consultas de noticias, gobierno local, deportes y tecnología.
- Hay un módulo adicional `src/jarvis/library/business-source.module.ts` con `BusinessSourceService` y `SitemapCrawlerService`, pero todavía no está importado como dependencia principal de `JarvisModule`.

---

## 11. Knowledge Library

```
POST /jarbees/library/document      ← texto / markdown
POST /jarbees/library/document/pdf  ← PDF (extracción con pdf-parse)
POST /jarbees/library/document/url  ← scraping de URL
```

**DocumentIngestService** — pipeline completo y asíncrono:
1. **Creación e Inicialización**: Crea el registro `Document` con estado inicial `indexing`.
2. **Extracción y Fragmentación**: Extrae el texto y lo divide en chunks utilizando párrafos o ventanas deslizantes (1200 chars, 150 chars overlap).
3. **Retorno Desacoplado**: Retorna inmediatamente la respuesta de la API al usuario sin esperar la generación de los embeddings vectoriales.
4. **Generación Asíncrona con Concurrencia Controlada (Límite = 3)**: Procesa los chunks en segundo plano a través de una cola de trabajadores con un límite de 3 peticiones en paralelo a `EmbeddingsService` (evitando la saturación y rate limits de Ollama).
5. **Finalización**: Una vez que todos los chunks del documento se guardan en la base de datos y sus embeddings se persisten en `pgvector`, el estado de la indexación pasa a `ready`.
6. **Filtrado RAG**: El motor de recuperación RAG (búsqueda semántica y textual en `DocumentRepository` y `PgvectorService`) filtra las consultas para consultar únicamente chunks de documentos en estado `ready`.

### 11.1 Biblioteca local JSON (nuevo)

Además del pipeline tradicional de documentos, Jarvis puede leer conocimiento local desde archivos JSON ubicados en `src/jarvis/knowledge`. Este modo es útil para bases de conocimiento estáticas que deben responderse de forma directa y estructurada.

**JarvisKnowledgeService**:
- escanea automáticamente archivos JSON locales,
- lista contenido registrado por categoría o tema,
- extrae campos estructurados como descripción, tratamientos, precauciones y acciones,
- permite responder consultas del tipo “qué plantas medicinales tenemos registradas” o “para qué sirve el cedrón”.

### 11.2 Diagnóstico y validación RAG (nuevo)

Se incorporó un módulo especializado para medir y depurar la calidad del conocimiento recuperado:

- **KnowledgeTestService**: ejecuta pruebas automáticas sobre la biblioteca, evaluando recuperación de documentos y calidad de respuesta.
- **Probe de chunks**: permite inspeccionar qué fragmentos específicos recupera el RAG para una consulta.
- **Diagnóstico de biblioteca**: reporta cobertura, top categorías, documentos sin chunks y alertas de calidad.

Esto convierte al sistema en algo mucho más observable y facilita la mejora continua del RAG sin depender solo de prueba manual.

### 11.3 Modos de búsqueda persistentes (nuevo)

Los comportamientos de internet y RAG ahora se almacenan en las preferencias del usuario. Los modos disponibles son:

- `OFFLINE`: desactiva internet y los fallbacks web.
- `LOCAL_FIRST`: prioriza documentos locales y conocimiento del modelo antes de salir a la web.
- `HYBRID`: mezcla local + web según la naturaleza de la consulta.
- `WEB_FIRST`: busca en internet primero para enriquecer la respuesta.

Este mecanismo permite ajustar el comportamiento del asistente de forma consistente entre sesiones.

### 11.4 Resiliencia de embeddings y fallback textual (nuevo)

El pipeline de RAG fue reforzado para que no dependa exclusivamente de un único modelo de embeddings. Cuando Ollama responde con `404` o `400` por falta del modelo solicitado, Jarvis ahora:

- intenta automáticamente modelos alternativos de embeddings,
- conserva el flujo de recuperación aunque el embedding no esté disponible,
- cae de forma segura a la búsqueda textual por contenido cuando la búsqueda semántica no puede ejecutarse.

Este cambio mejora la estabilidad general del sistema y reduce los fallos de respuesta cuando la instalación local de Ollama no incluye el modelo esperado.

### 11.5 Ingesta Jerárquica y Embeddings Perezosos (Lazy Embeddings) (nuevo)

El pipeline de ingesta se profesionalizó para manejar documentos extensos de forma estructurada a través de `HierarchicalParserService`:
- **Estado de Cuarentena (Quarantine)**: Los nuevos documentos ingresan por defecto con estado `quarantined`. Se requiere una llamada explícita a `POST /api/jarbees/library/document/:id/approve` para liberar y comenzar el pipeline de indexación.
- **División Estructural**: Divide documentos extensos en capítulos (`Chapter`) y secciones (`Section`) basados en la sintaxis de encabezados Markdown, aplicando filtros inteligentes para ignorar páginas o bloques repetitivos o ruidosos.
- **Embeddings Diferidos y Amortiguados**: El cálculo de embeddings vectoriales de los chunks de texto se realiza asíncronamente en una cola con control de concurrencia (límite = 3) y delays dinámicos para evitar tasas de fallos y saturación del proveedor.
- **Resúmenes en Cascada (MapReduce)**: Generación recursiva de resúmenes de secciones para construir el resumen macro del capítulo y finalmente el meta-resumen general de la obra.
- **Búsqueda Híbrida en Dos Capas**: En la fase de recuperación RAG, se busca primero qué capítulos son relevantes y luego se busca semánticamente sobre los chunks específicos de esos capítulos. Si se detectan chunks candidatos sin embedding, se generan vectorizaciones "en caliente" (perezosas/on-demand).

### 11.6 Fichas de Conocimiento Epistemológicas (nuevo)

Los resúmenes generales de los documentos evolucionaron hacia un formato estructurado de alto valor RAG denominado **Ficha de Conocimiento (Knowledge Card)**, el cual se persiste en la base de datos (columna `summary` del modelo `Document`):
- **Estructura Estricta**: Contiene bloques estandarizados que facilitan la ingesta de RAG:
  - **Metadatos**: Aporte/valoración y tipo de documento.
  - **Mapa de Conocimiento**: Resumen condensado de la obra.
  - **Conceptos Detectados**: Listado de conceptos clave con su frecuencia real de menciones en el texto.
  - **Preguntas Respondidas**: Bloque de preguntas clave identificadas por el modelo, prefijadas con el check `✔`.
  - **Relaciones y Contexto**: Definición de límites y aplicabilidad.
  - **Grafo de Relaciones**: Un mapa conceptual en formato ASCII de las dependencias lógicas dentro del documento.
- **Acceso Optimizado**: Al solicitar el resumen de un documento, `DocumentSummaryService` comprueba si ya existe la Ficha de Conocimiento almacenada para servirla directamente y extrae de ella los puntos clave de manera resiliente.

### 11.7 Recuperación Enriquecida, Reranking Híbrido y Salvaguardas de RAG (nuevo)

El pipeline de recuperación RAG en `JarvisService` y `JarvisPromptBuilderService` ha sido optimizado con algoritmos de reordenación inteligente y reglas de prompt estrictas para evitar alucinaciones y mejorar la relevancia del contexto:
- **Mayor Cobertura de Chunks**: Se incrementó el límite de recuperación de chunks en la base de datos de 3 a 15, permitiendo un análisis contextual más extenso y robusto.
- **Reranker Híbrido Léxico-Semántico**: Implementación de un algoritmo de reranking (`rerankChunks`) que puntúa los fragmentos recuperados asignando un 40% de peso a la coincidencia léxica (palabras clave normalizadas de la consulta del usuario) y un 60% de peso al orden de relevancia semántica original.
- **Metadatos en Contexto RAG**: Los chunks inyectados en el prompt del LLM son formateados con metadatos estructurados (`DOCUMENTO`, `AUTOR`, `ESCUELA DE PENSAMIENTO`), resueltos dinámicamente mediante `CorpusSelectorService.getAuthorAndSchoolByTitle`. Esto le permite al modelo saber exactamente qué autor y escuela de pensamiento fundamenta cada afirmación.
- **Salvaguardas Contra Alucinaciones (System Prompt)**: Se añadieron reglas estrictas en `JarvisPromptBuilderService` para que el modelo:
  - Dé prioridad absoluta al contexto provisto y explicite si la información no está en los documentos antes de recurrir a su conocimiento general.
  - Tenga prohibición absoluta de inventar libros, autores o capítulos que no existan en la biblioteca.
  - Preserve la integridad de los marcos intelectuales, separando claramente las perspectivas de distintos autores/escuelas sin mezclarlas.
- **Auto-aprobación en Lazy Load**: Durante las búsquedas en caliente y carga diferida en `CorpusSelectorService`, si un documento existente coincide pero está en estado `quarantined` o `not_indexed`, el sistema aprueba e inicia la indexación jerárquica automáticamente para garantizar que su contenido esté disponible.

### 11.8 Verificación de Respaldo y Control de Alucinaciones — EvidenceService (nuevo)

Para garantizar la precisión de las respuestas generadas por el RAG y eliminar alucinaciones de autores o conceptos inexistentes en la biblioteca:
- **Verificación Determinista (`EvidenceService`)**: Contrasta la respuesta generada por el LLM contra los fragmentos (chunks) de contexto RAG efectivamente recuperados y contra el índice de biblioteca (`library-index.json`).
- **Puntaje de Confianza (Confidence Score)**: Computa un valor de confianza (0% a 100%) analizando la proporción de entidades (autores, términos específicos y conceptos clave) que tienen respaldo explícito en el contexto frente a entidades alucinadas.
- **Desglose en Markdown**: Inyecta automáticamente un bloque colapsable `<details>` al final de cada respuesta RAG mostrando la métrica de confianza y el desglose de entidades verificadas vs. no presentes.
- **Frontera Rígida de Conocimiento**: Restricciones de prompt en `JarvisPromptBuilderService` para forzar al modelo a delimitar su conocimiento estrictamente al corpus cargado.

### 11.9 Sanitización Estructural y Seguridad en la Ingesta de PDFs (nuevo)

El servicio `DocumentIngestService` incorpora un motor de inspección y sanitización de archivos PDF previa a la extracción de texto para prevenir vectores de ataque:
- **Remoción de Acciones Adicionales (`/AA`)**: Detecta y remueve automáticamente disparadores de acciones en el catálogo del documento y en cada una de sus páginas.
- **Bloqueo de Ejecución Peligrosa**: Lanza excepción e interrumpe la ingesta ante la presencia de enlaces o acciones de tipo `/Launch`, `/JavaScript` o `/Screen`.
- **Bloqueo de Adjuntos Ocultos**: Rechaza archivos PDF con objetos adjuntos embebidos (`/EmbeddedFiles`).
- **Persistencia Sanitizada**: Si se remueven acciones sospechosas pero no fatales, guarda la versión limpia en disco para asegurar que el almacenamiento sea seguro.

**RssIngestService** — procesa feeds RSS:
- Limpia HTML con Cheerio
- Ingesta artículo por artículo al pipeline

**SitemapCrawlerService** — descubre URLs:
- Lee sitemap.xml
- Prioriza por estrategia: `catalog`, `healthcare`, `education`, `corporate`

---

## 12. Balance Energético (JarBees v2.1) (nuevo)

El módulo de Balance Energético (`BalanceModule`) gestiona el proceso interactivo de autoevaluación energética del usuario a través de una entrevista guiada por IA en 7 dimensiones:
- **Entrevista Adaptativa Turn-by-Turn**: Reemplaza el formulario estático heredado por una interacción dinámica de 10 preguntas. La IA guía la conversación y a partir de la cuarta pregunta genera consultas adaptativas para indagar en profundidad.
- **Rotación por Ciclos Temáticos**: Para mantener la personalidad y el enfoque frescos, el sistema rota automáticamente entre 4 ciclos temáticos cada 15 días según el volumen de sesiones del usuario:
  - **Ciclo 1**: *¿Dónde está yendo tu energía?* (mapa general)
  - **Ciclo 2**: *¿Qué está bloqueando tu energía?* (resistencias y límites)
  - **Ciclo 3**: *¿Qué merece crecer?* (potencial y expansión)
  - **Ciclo 4**: *¿Qué necesita cerrarse?* (cierre de ciclos y manifestación)
- **Preguntas Dinámicas con Personalidad**: Las preguntas dinámicas usan modismo argentino ("vos"), detectan contradicciones basándose en respuestas previas y evitan duplicidad o redundancia mediante directivas del prompt de generación.
- **Análisis de Balance**: El motor `BalanceAnalysisService` procesa las respuestas del ciclo activo y produce un reporte completo detallando fortalezas, puntos ciegos, distribución energética en las 7 dimensiones y recomendaciones personalizadas.
- **Validaciones**: Se requiere un mínimo de 5 respuestas completas en la sesión para posibilitar el cierre del cuestionario y la generación del reporte.

---

## 13. Automation — Jobs diarios

`DailyJobsService` con `@nestjs/schedule`:

| Job | Horario | Acción |
|-----|---------|--------|
| Morning Briefing | 8:00 AM ARG | Resumen de noticias + clima de Paraná |
| Nightly Processing | 3:00 AM ARG | Ingesta de fuentes RSS activas en `KnowledgeSource` |

---

## 14. Observabilidad

Cada respuesta genera un `AgentRun` con:
- `question` / `answer`
- `toolsUsed: string[]` — qué herramientas se activaron
- `modelUsed` / `provider`
- `durationMs` — latencia total
- `tokensUsed`
- `success` / `errorMsg`

**DashboardService** — stats agregadas:
- Total memorias, conversaciones, sesiones, colecciones, documentos
- Runs recientes con breakdown por modelo
- `GET /jarbees/dashboard`

---

## 15. Endpoints REST completos

Todos los endpoints reales del controlador de Jarvis quedan bajo el prefijo global `/api`, por lo que la ruta completa es `/api/jarbees/...`.

### Core
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/jarbees/session` | Obtener o crear `sessionId` persistente |
| GET | `/api/jarbees/history` | Historial de mensajes de una sesión |
| POST | `/api/jarbees/query` | Consulta principal |
| POST | `/api/jarbees/feedback` | Registrar feedback (score 1-5) |

### Planner + Execution Engine
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/jarbees/planner` | Crear plan (sin ejecutar) |
| POST | `/api/jarbees/planner/execute` | Crear plan y ejecutarlo |

### Memoria
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/jarbees/memory` | Guardar hecho permanente |
| GET | `/api/jarbees/memory` | Listar memorias |
| GET | `/api/jarbees/memory/:id` | Recuperar memoria por ID |

### Knowledge Evolution
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/jarbees/evolution?topic=X&days=180` | Evolución de un tema |
| GET | `/api/jarbees/evolution/topics` | Listar temas registrados |

### Biblioteca
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/jarbees/library/document` | Ingestar texto/markdown |
| POST | `/api/jarbees/library/document/pdf` | Subir PDF |
| POST | `/api/jarbees/library/document/url` | Ingestar desde URL |
| GET | `/api/jarbees/library/document` | Listar documentos |
| GET | `/api/jarbees/library/document/search?q=` | Buscar documentos |
| GET | `/api/jarbees/library/document/recent` | Más recientes |
| GET | `/api/jarbees/library/document/:id` | Documento con chunks |
| POST | `/api/jarbees/library/document/:id/approve` | Liberar documento en cuarentena hacia la indexación |
| DELETE | `/api/jarbees/library/document/:id` | Eliminar documento |
| GET | `/api/jarbees/library/stats` | Stats de la biblioteca |
| POST/GET | `/api/jarbees/library/collection` | CRUD de colecciones |
| GET | `/api/jarbees/library/diagnostic` | Diagnóstico del conocimiento |
| POST | `/api/jarbees/library/knowledge-test` | Pruebas automáticas de RAG |
| POST | `/api/jarbees/library/probe` | Inspección detallada de chunks |

### Balance Energético
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/balance/start` | Iniciar cuestionario de balance y calcular tránsitos astrológicos |
| POST | `/api/balance/:id/answer` | Enviar respuesta a pregunta del cuestionario |
| POST | `/api/balance/:id/finish` | Finalizar cuestionario y generar informe con IA |
| GET | `/api/balance/latest` | Obtener el último informe de balance completado |
| GET | `/api/balance/history` | Obtener historial de informes de balance |
| GET | `/api/balance/trends` | Obtener tendencias evolutivas de las 7 dimensiones |

### Browser
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/jarbees/browser/fetch` | Scrapear URL |
| POST | `/api/jarbees/browser/navigate` | Navegar con Playwright |
| POST | `/api/jarbees/browser/search` | Buscar en Google |
| POST | `/api/jarbees/investigate` | Investigar URL e ingestar conocimiento |

### Perfil y Config
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/PATCH | `/api/jarbees/profile` | Perfil del usuario |
| GET | `/api/jarbees/identity` | Identidad de JarBees |
| GET | `/api/jarbees/capabilities` | Capacidades activas |
| GET | `/api/jarbees/skills` | Skills cargadas |
| GET | `/api/jarbees/skills/relevant?q=` | Skills relevantes para query |
| GET | `/api/jarbees/tools` | Tools habilitadas |

### Observabilidad
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/jarbees/dashboard` | Stats globales del sistema |
| GET | `/api/jarbees/observability/stats` | Métricas de `AgentRun` |
| GET | `/api/jarbees/observability/runs` | Runs recientes |

---

## 16. Cobertura actual por módulo del OS Personal

```
Memory           ████████░░  85%  ✅  Extracción automática + Knowledge Evolution
Knowledge        ████████░░  80%  ✅  PDF + URL + RSS + chunking + embeddings + Jerárquico
Browser          ████████░░  80%  ✅  Playwright completo + búsqueda Google
Calendar         █████████░  90%  ✅  Google Calendar + feriados + hora + astronomía
Tasks/Planner    ████████░░  80%  ✅  Planner + Execution Engine funcional + ActionGate
Balance          █████████░  85%  ✅  Entrevista adaptativa turn-by-turn + 4 ciclos de rotación + reportes
Research         ██████░░░░  60%  🟡  RSS + BusinessSources, sin búsqueda web real-time
Programming      ███████░░░  75%  ✅  qwen3:4b + SkillRegistry + ModelRouter
Vision           ████░░░░░░  40%  🟡  Soporte inicial de análisis de imágenes con `VisionService` y OCR vía Qwen2.5-VL
Automation       ██████░░░░  65%  ✅  Crons 8AM + 3AM funcionando
Local Files      █████░░░░░  55%  🟡  PDF + texto, sin watcher de carpeta
GitHub           ░░░░░░░░░░   0%  🔴  Schema preparado, sin implementación
Ollama           █████████░  90%  ✅  Dos modelos + embeddings + Model Router
OpenRouter       ████████░░  80%  ✅  Mistral-7B, intercambiable vía flag
─────────────────────────────────────
Cobertura total  ~79%
```

---

## 17. Limitaciones conocidas

| Limitación | Estado | Alternativa |
|------------|--------|-------------|
| **pgvector** | La base ya está preparada en el schema con `vector(1024)` para `Chunk` y `MemoryChunk` | La búsqueda semántica nativa está preparada, pero la ejecución real depende del soporte del motor PostgreSQL y de los fallbacks textuales cuando el embedding no está disponible |
| **Google OAuth** | Requiere tarjeta en Google Cloud para algunas integraciones | `TaskReminderService` interno en PostgreSQL y otras rutas pueden seguir operando con datos locales |
| **Vision / OCR** | Sin modelo multimodal en producción | `POST /upload/image` devuelve Base64 para consumo externo |
| **GitHub** | Solo tipado en `KnowledgeSource` | Ingesta manual vía texto/PDF/URL |
| **Anti-bot scraping** | Cloudflare/Twitter bloquean | RSS y fuentes priorizadas como alternativa |
| **Embeddings semánticos** | Se generan y se usan en la librería RAG | Si falla la generación o el embedding, el sistema cae a búsqueda textual |

---

## 19. Arquitectura Cognitiva Inspirada en Mecánica Cuántica (QICA) (nuevo)

JarBees implementa un motor cognitivo de frontera desprendido de metáforas físicas ineficientes y traducido a patrones reales de ingeniería cognitiva sobre NestJS + Prisma:

```
                  Pregunta del Usuario
                           ↓
                  Intent Router / Query
                           ↓
           CognitiveOrchestratorService
                           ↓
     ┌─────────────────────┴─────────────────────┐
     ↓                                           ↓
[Consulta Simples / Tools]             [Consulta Compleja]
(0 ms de sobrecosto clásico)                     ↓
                                    CognitiveFieldService
                               (Activa campo asociativo de memoria)
                                                 ↓
                                    HypothesisEngineService
                                (Genera superposición: 3-4 hipótesis)
                                                 ↓
                                   InterferenceEngineService
                             (Interferencia constructiva/destructiva
                                      y colapso de estado)
                                                 ↓
                                          LLM Provider
                                   (Síntesis de estado colapsado)
```

### Componentes de QICA:
- **`CognitiveState` (Modelo Prisma) + `CognitiveFieldService`**: Registro de estados conceptuales en PostgreSQL con niveles de activación (0.0 a 1.0) y decaimiento pasivo temporal.
- **`HypothesisEngineService` (Superposición)**: Genera paralelamente múltiples perspectivas de análisis (*Analítica*, *Pragmática*, *Innovadora*, *Crítica*) para preguntas complejas.
- **`InterferenceEngineService` (Interferencia y Colapso)**: Evalúa cada hipótesis deterministamente mediante solapamiento RAG, coincidencia con el campo cognitivo y validación de [EvidenceService](file:///c:/nest/productos_crud_bkd/src/jarvis/knowledge/evidence.service.ts). Cancela hipótesis inconclusas y fusiona las supervivientes.
- **`CognitiveOrchestratorService` (Desacoplamiento Adaptativo)**: Garantiza latencia cero para consultas simples/herramientas e invoca el motor profundo únicamente ante consultas estratégicas o arquitectónicas.
