# JarBees — Arquitectura del Sistema
**Última actualización:** Julio 2026  
**Stack:** NestJS 10 · PostgreSQL · Prisma 6 · Ollama · Playwright · TypeScript

---

## 1. Filosofía de diseño

JarBees no es un chatbot. Es un **Sistema Operativo Personal** construido sobre capas de memoria, conocimiento y ejecución:

```
Usuario
  ↓
Intent Router          ← clasifica la intención antes de cualquier acción
  ↓
Execution Engine       ← ejecuta planes multi-paso
  ↓
Tools Layer            ← Browser · Calendar · Sports · Astrology · Math · Weather · ...
  ↓
Knowledge Layer        ← RAG · Embeddings · Business Sources · RSS
  ↓
Memory Layer           ← Memoria permanente · Extracción automática · Knowledge Evolution
  ↓
LLM Provider           ← Ollama (local) o OpenRouter (externo) — intercambiables
  ↓
Respuesta
```

El LLM es un **componente reemplazable**. La inteligencia real está en las capas anteriores.

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
| `JobsModule` | `src/jobs/` | Crons diarios (Morning Briefing, Nightly Processing) |
| `HRM` | `src/hrm/` | Python ML standalone (invocado por spawn) |

---

## 3. Base de datos — 17 modelos activos

### Legacy (compatibilidad)
| Modelo | Propósito |
|--------|-----------|
| `Product` | CRUD de productos original |
| `Pregunta` | Historial legacy del chatbot |

### Jarvis — Sistema de memoria
| Modelo | Propósito |
|--------|-----------|
| `UserProfile` | Perfil adaptativo: timezone, país, idioma, preferencias JSON |
| `Memory` | Hechos persistentes en lenguaje natural. "Ignacio trabaja con NestJS" |
| `MemoryChunk` | Fragmentos de memoria embeddables (preparado para pgvector) |
| `ConversationMessage` | Historial multi-sesión por `sessionId` UUID |
| `SessionSummary` | Resumen progresivo cada 10 mensajes — evita contexto gigante |
| **`TopicSnapshot`** | **Snapshots de evolución del conocimiento — base de Knowledge Evolution** |

### Jarvis — Conocimiento RAG
| Modelo | Propósito |
|--------|-----------|
| `KnowledgeSource` | Fuentes tipadas: `pdf`, `markdown`, `web`, `rss`, `github`, `api` |
| `Document` | Documentos ingestados con título, contenido, categoría |
| `Chunk` | Fragmentos embeddables con `embeddingId` |
| `Collection` + `CollectionDocument` | Agrupación temática de documentos |

### Jarvis — Ejecución y observabilidad
| Modelo | Propósito |
|--------|-----------|
| `Task` + `TaskStep` | Planner: objetivo → pasos ejecutables con status |
| `Feedback` | Score y comentarios por respuesta |
| `Tool` | Registro dinámico de herramientas habilitadas |
| `AgentRun` | Observabilidad: latencia, modelo, herramientas, éxito/fallo |

### Web cache (ContentCacheService)
| Modelo | Propósito |
|--------|-----------|
| `Source` | Fuentes web registradas con TTL |
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

**Model Router** en `/aichat` — elige automáticamente entre modelos:
- 100+ keywords técnicas → `qwen3:4b`
- Conversación general → `llama3.2:3b`

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

### BusinessSourceService
Catálogo de **30+ fuentes locales de Paraná, Entre Ríos**:
- Farmacias (Farmacity, Villegas, Cuyo, Magna)
- Hospitales (San Martín, La Baxada, La Entrerriana, Mederi, Rawson)
- Supermercados (La Anónima, Carrefour, DIA, VEA)
- Restaurantes, panaderías, electrónica, computación
- Cada fuente con: tags semánticas, TTL, prioridad, trustScore, scrapingStrategy

---

## 11. Knowledge Library

```
POST /jarbees/library/document      ← texto / markdown
POST /jarbees/library/document/pdf  ← PDF (extracción con pdf-parse)
POST /jarbees/library/document/url  ← scraping de URL
```

**DocumentIngestService** — pipeline completo:
1. Extrae texto (texto plano / PDF / web)
2. Divide en chunks: párrafos primero, ventana deslizante para párrafos largos (800 chars, 10% overlap)
3. Genera embeddings via `EmbeddingsService` (nomic-embed-text via Ollama)
4. Guarda chunks con `embeddingId` en PostgreSQL

**RssIngestService** — procesa feeds RSS:
- Limpia HTML con Cheerio
- Ingesta artículo por artículo al pipeline

**SitemapCrawlerService** — descubre URLs:
- Lee sitemap.xml
- Prioriza por estrategia: `catalog`, `healthcare`, `education`, `corporate`

---

## 12. Automation — Jobs diarios

`DailyJobsService` con `@nestjs/schedule`:

| Job | Horario | Acción |
|-----|---------|--------|
| Morning Briefing | 8:00 AM ARG | Resumen de noticias + clima de Paraná |
| Nightly Processing | 3:00 AM ARG | Ingesta de fuentes RSS activas en `KnowledgeSource` |

---

## 13. Observabilidad

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

## 14. Endpoints REST completos (`/api/jarbees/*`)

### Core
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/jarbees/session` | Obtener o crear sessionId persistente |
| GET | `/jarbees/history` | Historial de mensajes de una sesión |
| POST | `/jarbees/query` | Consulta principal |
| POST | `/jarbees/feedback` | Registrar feedback (score 1-5) |

### Planner + Execution Engine
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/jarbees/planner` | Crear plan (sin ejecutar) |
| POST | `/jarbees/planner/execute` | Crear plan Y ejecutarlo — retorna respuesta final |

### Memoria
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/jarbees/memory` | Guardar hecho permanente |
| GET | `/jarbees/memory` | Listar todas las memorias |
| GET | `/jarbees/memory/:id` | Recuperar memoria por ID |

### Knowledge Evolution
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/jarbees/evolution?topic=X&days=180` | Evolución de un tema |
| GET | `/jarbees/evolution/topics` | Listar todos los temas registrados |

### Biblioteca
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/jarbees/library/document` | Ingestar texto/markdown |
| POST | `/jarbees/library/document/pdf` | Subir PDF |
| POST | `/jarbees/library/document/url` | Ingestar desde URL |
| GET | `/jarbees/library/document` | Listar documentos |
| GET | `/jarbees/library/document/search?q=` | Buscar en documentos |
| GET | `/jarbees/library/document/recent` | Más recientes |
| GET | `/jarbees/library/document/:id` | Documento con chunks |
| DELETE | `/jarbees/library/document/:id` | Eliminar documento |
| GET | `/jarbees/library/stats` | Stats de la biblioteca |
| POST/GET | `/jarbees/library/collection` | CRUD de colecciones |

### Browser
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/jarbees/browser/fetch` | Scrapear URL (axios → Playwright) |
| POST | `/jarbees/browser/navigate` | Navegar con Playwright + screenshot |
| POST | `/jarbees/browser/search` | Buscar en Google via Playwright |
| POST | `/jarbees/investigate` | Investigar URL → ingestar a Knowledge |

### Perfil y Config
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/PATCH | `/jarbees/profile` | Perfil del usuario |
| GET | `/jarbees/identity` | Identidad de JarBees |
| GET | `/jarbees/capabilities` | Capacidades activas |
| GET | `/jarbees/skills` | Skills cargadas |
| GET | `/jarbees/skills/relevant?q=` | Skills relevantes para query |
| GET | `/jarbees/tools` | Tools habilitadas |

### Observabilidad
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/jarbees/dashboard` | Stats globales del sistema |
| GET | `/jarbees/observability/stats` | Métricas de AgentRun |
| GET | `/jarbees/observability/runs` | Runs recientes |

---

## 15. Cobertura actual por módulo del OS Personal

```
Memory           ████████░░  85%  ✅  Extracción automática + Knowledge Evolution
Knowledge        ████████░░  80%  ✅  PDF + URL + RSS + chunking + embeddings
Browser          ████████░░  80%  ✅  Playwright completo + búsqueda Google
Calendar         █████████░  90%  ✅  Google Calendar + feriados + hora + astronomía
Tasks/Planner    ████████░░  80%  ✅  Planner + Execution Engine funcional
Research         ██████░░░░  60%  🟡  RSS + BusinessSources, sin búsqueda web real-time
Programming      ███████░░░  75%  ✅  qwen3:4b + SkillRegistry + ModelRouter
Vision           ░░░░░░░░░░   5%  🔴  Solo upload Base64, sin modelo multimodal
Automation       ██████░░░░  65%  ✅  Crons 8AM + 3AM funcionando
Local Files      █████░░░░░  55%  🟡  PDF + texto, sin watcher de carpeta
GitHub           ░░░░░░░░░░   0%  🔴  Schema preparado, sin implementación
Ollama           █████████░  90%  ✅  Dos modelos + embeddings + Model Router
OpenRouter       ████████░░  80%  ✅  Mistral-7B, intercambiable vía flag
─────────────────────────────────────
Cobertura total  ~72%
```

---

## 16. Limitaciones conocidas

| Limitación | Estado | Alternativa |
|------------|--------|-------------|
| **pgvector** | Schema preparado, embeddings guardados como JSON string | Búsqueda LIKE funcional hasta activarlo |
| **Google OAuth** | Requiere tarjeta en Google Cloud | TaskReminderService interno en PostgreSQL |
| **Vision / OCR** | Sin modelo multimodal | `POST /upload/image` retorna Base64 |
| **GitHub** | Solo tipo en KnowledgeSource | Manual via ingesta de texto |
| **Anti-bot scraping** | Cloudflare/Twitter bloquean | RSS como alternativa |
| **Embeddings semánticos** | Generados pero no buscados semánticamente | Búsqueda textual LIKE |

---

## 17. Próximos pasos recomendados

**Alta prioridad:**
1. **pgvector** — activar `embedding vector(768)` en `Chunk` y `MemoryChunk`. Los embeddings ya se generan con `nomic-embed-text`, solo falta el campo y la función de búsqueda por coseno. Desbloquea todo el RAG semántico.
2. **Watcher de carpeta** — monitorear `docs_inbox/` con `fs.watch()` para ingesta automática de PDFs nuevos.
3. **Notificaciones** — Telegram bot para que el Morning Briefing llegue al celular.

**Media prioridad:**
4. **Búsqueda web real-time** — integrar Brave Search API o SerpAPI para Research sin depender de scraping.
5. **Más modelos OpenRouter** — selector dinámico de modelo externo (GPT-4o, Claude, Gemini).

**Baja prioridad:**
6. **Vision** — LLaVA o Moondream via Ollama para análisis de imágenes.
7. **GitHub** — autenticación y indexación de repos.
