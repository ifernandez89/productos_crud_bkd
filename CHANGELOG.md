# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project keeps its versioning in `package.json`.

## [Unreleased]

### Changed — Sports Tool v2: detalles de goles via scraping
- **Cascada de 3 pasos** para consultas deportivas:
  1. **TheSportsDB** → resultado, fecha, estadio, estado (`FT`/`NS`) — ~200ms
  2. **DuckDuckGo** → busca `"goles [equipo A] vs [equipo B] minutos goleadores"` en sitios deportivos priorizados (olé, ESPN, TyC, marca, sofascore, flashscore)
  3. **Scraping** de las primeras 2 URLs en paralelo → extrae párrafos con keywords de goles (`gol`, `minuto`, `anotó`, `marcó`, `min.`)
- **`hasGoalDetail: boolean`** en `SportsResult`: indica si el resultado tiene goleadores/minutos o solo score básico. Se registra en `toolsUsed` como `sports_scraping` vs `sports_api`
- **`buildGoalSearchQuery()`**: construye query de búsqueda específica detectando los equipos del mensaje (`argentina vs austria → "goles argentina vs austria partido hoy minutos goleadores"`)
- **15 sitios deportivos conocidos** priorizados en DuckDuckGo: olé, ESPN ar/com, infobae, TyC, marca, as, livescore, flashscore, sofascore

### Fixed — Sports Tool: ID de Argentina corregido + anti-hallucination reforzado
- **ID de Argentina en TheSportsDB corregido**: era `133604` (equipo incorrecto → devolvía Arsenal vs Burnley). Valor correcto: `134509`. Verificado con `searchteams.php?t=Argentina` — retorna Argentina 2-0 Austria del 22/6/2026
- **Mapa de IDs actualizado**: Brasil `134506`, Uruguay `134511`, Colombia `134510`, Real Madrid `133613`, Manchester United `133616`, Manchester City `133615`, Copa América `4499`
- **Formateo de evento mejorado**: incluye estado del partido (`FT`/`NS`), hora local, estadio, liga con emojis
- **Prompt anti-hallucination reforzado** en `respondWithLLM()`: cuando hay `webContext`, la regla 4 del systemPrompt es explícita: "TENÉS datos reales en el contexto. NUNCA digas 'no tengo acceso a información en tiempo real' — eso sería mentira si tenés datos en el contexto". La regla 3 también instruye a usar solo los datos del contexto
- **`userPrompt` con advertencia ⚠️**: cuando hay browserContext, el userPrompt incluye "⚠️ INSTRUCCIÓN: Respondé usando los datos de CONTENIDO WEB EXTRAÍDO. No digas que no tenés información — los datos ya están en este prompt"

### Fixed — Intent Router y Sports Tool: velocidad y detección
- **`classify()` no llama más al LLM si confianza es `medium`**: antes solo saltaba el LLM con `high`. Ahora `medium` también es suficiente. Elimina la llamada a Ollama para clasificar "goles/partido" que tardaba ~30s adicionales
- **Regex de deportes mejorado**: acepta `ganó/perdió/empató/clasificó` con tilde y sin. `"en el partido"` agregado como señal temporal → confianza `high`
- **`SportsTool.search()` paralelo con timeout**: las llamadas a TheSportsDB (team + league + name) ahora se lanzan en paralelo vía `Promise.allSettled` con timeout global de 5s. Antes eran secuenciales (cada una podía tardar 6s)
- **`searchDuckDuckGo()` timeout reducido**: de 8s a 6s
- **Fallback mejorado**: si Ollama no está disponible al clasificar, en lugar de devolver `LOCAL`, devuelve `WEB` — más útil para preguntas factuales
- Imports `axios` y `cheerioLoad` agregados a `jarvis.service.ts`

### Added — Intent Router + Sports Tool (arquitectura de intención)
- **`IntentRouterService`** (`src/jarvis/tools/intent/intent-router.service.ts`): clasifica cada mensaje ANTES de ejecutar cualquier herramienta. Tipos: `LOCAL | WEB | URL | RAG | TOOL | SPORTS | REPEAT`
  - **Fase 1 — Reglas rápidas** (sin LLM, instantáneo): detecta con alta confianza URLs, tools directas, deportes, saludos, comandos de memoria
  - **Fase 2 — Clasificador LLM** (solo para casos ambiguos): mini-prompt a Ollama con `temperature:0, num_predict:5`. Pregunta "WEB o LOCAL o SPORTS etc." — una sola palabra. Timeout 8s. Si Ollama no responde, usa el resultado de fase 1
- **`SportsTool`** (`src/jarvis/tools/sports/sports-tool.service.ts`): cascada deportiva sin API key
  - **TheSportsDB** (gratis, JSON, ~200ms): busca por teamId → leagueId → nombre de equipo. Mapa de equipos/ligas argentinas y europeas pre-cargado
  - Fallback a DuckDuckGo → Google si la API no tiene datos
- **`respondWithLLM()`**: método centralizado en `JarvisService` que encapsula buildJarvisContext + generate + persistir + observabilidad. Elimina código duplicado
- `IntentRouterService` y `SportsTool` registrados en `JarvisModule`

### Changed — Auto-búsqueda: DuckDuckGo + lógica de disparo simplificada
- **DuckDuckGo HTML como motor primario** (`searchDuckDuckGo()`): parsea `html.duckduckgo.com/html/` con axios + cheerio. Sin API key, sin Playwright, ~1-2s. Selectores: `.result__body`, `.result__title a`, `.result__url`, `.result__snippet`
- **Google Playwright como fallback** de `autoWebSearch()`: solo se usa si DuckDuckGo no retorna resultados. Evita los 30+ segundos en el caso común
- **`needsWebSearch()` simplificado**: lógica invertida — busca en internet para todo EXCEPTO: saludos triviales, preguntas sobre el asistente, comandos de memoria (`recorda X`, `mi nombre es`), mensajes <3 palabras. Ya no depende de keywords positivas (que causaban falsos negativos como "de quienes fueron los goles")
- **Instrucción anti-hallucination en el prompt**: cuando hay `auto_search`, el systemPrompt incluye "Nunca digas 'no tengo acceso a información en tiempo real' si tenés resultados de búsqueda disponibles". El userPrompt dice "Respondé usando EXCLUSIVAMENTE los datos de búsqueda"

### Added — Auto-búsqueda web automática (fallback inteligente)
- **`needsWebSearch(message)`** en `JarvisService`: detecta si una pregunta requiere información actual/factual cuando no hay contexto local disponible. Excluye: saludos, preguntas de identidad del asistente, mensajes cortos (<3 palabras). Detecta señales positivas: preguntas directas (qué/quién/cuándo/dónde), temas actuales (noticias, partidos, precios, clima), pedidos de info (contame, explicame, sabes)
- **`autoWebSearch(query)`** en `JarvisService`: hace una búsqueda en Google vía `BrowserToolService.search()` con 4 resultados. Retorna el contexto formateado con título, URL y snippet de cada resultado
- **Flujo automático en `query()`**: entre el paso 2 (construcción de contexto) y el paso 3 (llamada al LLM), si `!hasContext && needsWebSearch()` → busca en Google → inyecta resultados como `### BÚSQUEDA WEB AUTOMÁTICA` en el userPrompt → registra `'auto_search'` en `toolsUsed`
- El LLM recibe instrucción explícita de usar los resultados de búsqueda y citar la fuente

### Fixed — Browser Tool: respuesta siempre procesada por LLM cuando hay pregunta
- **Causa raíz del problema**: `wantsLLMProcessing()` usaba una lista de keywords para decidir si pasar el contenido al LLM. Palabras como "que puedes decirme", "contame", "informame", "qué pasó" no estaban en la lista → el contenido se devolvía crudo al usuario sin pasar por Ollama
- **Solución**: lógica invertida en `getBrowserAnswer()`. La regla ahora es:
  - **URL + cualquier texto** (>5 chars) → **siempre al LLM** para procesar la respuesta
  - **Solo URL sin texto adicional** → muestra el contenido extraído directamente (el usuario solo quiere ver qué hay)
- `extractInstructionFromMessage()`: nuevo método que extrae el texto del mensaje quitando las URLs y puntuación (`; ,`). Si quedan >5 chars, hay una pregunta
- `wantsLLMProcessing()` eliminado — ya no necesario con la nueva lógica
- El log ahora muestra la instrucción detectada: `[browser] pregunta detectada ("que puedes decirme del ultimo partido...") → LLM processing`

### Changed — Browser Tool v3: velocidad y calidad de respuesta
- **`waitUntil: 'networkidle'` → `'domcontentloaded'`**: el cambio más crítico. `networkidle` esperaba que toda la red estuviera quieta (ads, analytics, trackers) causando tiempos de 80-90s. Con `domcontentloaded` el HTML principal se procesa apenas está disponible: **estimado 5-15s en lugar de 80-90s**
- **Bloqueo de analytics/ads en Playwright**: `googletagmanager, doubleclick, facebook, hotjar, intercom` bloqueados además de imágenes/fonts. Reduce requests pendientes que alargaban la espera
- **Scroll optimizado**: 3 pasos × 300ms + 500ms final = **~1.4s** (antes: 4 pasos × 600ms + 1000ms = **~3.4s**)
- **Espera de contenido**: de 5000ms a 3000ms máximo, con selector más amplio (`h2, h3` incluidos)
- **`systemPrompt` adaptativo**: cuando hay `browserContext`, la regla 4 cambia de "máximo 3 oraciones" a "respondé específicamente lo que el usuario preguntó usando el contenido web — no resumás todo"
- **`userPrompt` con instrucción explícita**: cuando hay `browserContext`, se agrega al final: "Usá el contenido web extraído arriba para responder esta pregunta específica. No hagas un resumen genérico."
- `BrowserResult` import no usado eliminado de `jarvis.service.ts`

### Changed — Browser Tool v2 (mejoras de extracción y resumen inteligente)
- **Estrategia de fetch invertida**: ahora Playwright va primero siempre (más confiable para sitios dinámicos), axios+cheerio es el fallback. Se usa el resultado con más palabras si ambos funcionan
- **Scroll profundo** en `deepScroll()`: 4 pasos progresivos sobre la altura total del DOM con 600ms entre pasos, activa todo el lazy-loading de portales de noticias
- **Bloqueo de recursos pesados**: Playwright bloquea `*.png, jpg, gif, webp, woff, mp4, mp3` para acelerar el scraping sin perder texto
- **Espera inteligente de contenido**: después de `domcontentloaded`, espera selector semántico (`article, [class*="news"], main`) antes de scrollear
- **Extractor de titulares** (`headlines[]`): nuevo campo en `BrowserResult`. Busca en `article h2/h3`, `.news-item h2`, `[class*="nota"] h3`, `h2 a`, `h3 a` (patrón común en portales). Devuelve hasta 30 titulares de la página
- **Extractor de cuerpo inteligente**: prueba `article → main → [role="main"] → #content → .content → body` en ese orden, prefiriendo contenido semántico sobre el body completo
- **`buildContext()` mejorado**: titulares aparecen en sección separada "Titulares encontrados" antes del cuerpo, no mezclados. Links internos y anclas filtrados
- **Resumen vía LLM** (`wantsLLMProcessing()`): cuando el usuario pide "resumí", "analizá", "de qué trata", "puntos clave", etc., el contenido web ya no se devuelve crudo. Se cachea en `_lastBrowserContext` y se retorna `null` para que `JarvisService` lo inyecte como `### CONTENIDO WEB EXTRAÍDO EN TIEMPO REAL` en el prompt del LLM
- **`consumeBrowserContext()`**: nuevo método público en `AssistantToolsService` para que `JarvisService` consuma el contexto cacheado y lo inyecte en `buildJarvisContext()`
- **`buildJarvisContext()`**: acepta parámetro `browserContext?: string`, lo inyecta como sección del prompt si está presente. Registra `'browser'` en `toolsUsed`
- **`--disable-blink-features=AutomationControlled`** agregado a los args de Chromium para reducir bloqueos por bot-detection

### Added
- **Playwright integrado (Chromium headless, gratuito)**: `playwright` instalado como dependencia. Chromium descargado localmente. El `BrowserToolService` ahora usa estrategia dual:
  - **Nivel 1 — Estático (axios + cheerio)**: primera tentativa, rápido y liviano
  - **Nivel 1 — Renderizado (Playwright)**: fallback automático si la página tiene <200 palabras (SPAs, React, Angular, lazy-loading)
  - `renderedWithPlaywright: boolean` en cada resultado para trazabilidad
- **Nivel 2 — Navegación autónoma con Playwright**:
  - `BrowserToolService.navigate(url, { screenshot?, waitFor? })`: abre URL con Playwright, scrollea para lazy-loading, extrae texto limpio, links y screenshot opcional (base64)
  - `BrowserToolService.search(query, limit)`: busca en Google y devuelve resultados con título, URL y snippet
  - `BrowserToolService.fetchMultiple(urls[])`: fetching paralelo de múltiples URLs para investigación autónoma
- **Detector `isWebSearchQuery()`** en `AssistantToolsService.resolve()`: cuando el usuario escribe "buscá X en internet", "googlea Y", "novedades sobre Z", etc., JarBees realiza la búsqueda automáticamente sin LLM y devuelve los top 5 resultados
- **Endpoints nuevos** en `POST /jarbees/`:
  - `browser/navigate` — navegación con Playwright + screenshot opcional
  - `browser/search` — búsqueda web con Google vía Playwright
- **Tool `browser_search`** registrada en `ToolRegistryService`

### Changed
- `BrowserToolService` completamente reescrito con estrategia dual estático/renderizado, lifecycle de Playwright (`getBrowser()` lazy + `close()`), y soporte para múltiples URLs simultáneas
- `getBrowserAnswer()` indica visualmente cuando se usó Playwright para renderizar
- `getWebSearchAnswer()` nueva: limpia la intención de búsqueda y retorna resultados formateados

### Added
- **Browser Tool — Detección automática de URLs**: `BrowserToolService` nuevo en `src/jarvis/tools/browser/`. Cuando el usuario incluye una URL en su mensaje, JarBees la detecta, extrae el contenido y construye un resumen estructurado sin guardar nada en BD.
  - `BrowserToolService.fetch(url)` — descarga y parsea HTML con axios + cheerio, extrae título, descripción, texto limpio, links e imágenes (alt-text)
  - `BrowserToolService.extractUrls(message)` — extrae todas las URLs del mensaje con regex
  - `BrowserToolService.buildContext(message)` — construye bloque de contexto listo para inyectar en el prompt del LLM, soporta múltiples URLs simultáneas
  - Límites: texto máximo 8.000 chars, excerpt 2.000 chars, hasta 10 links, timeout 12 s
- **Endpoint `POST /jarbees/browser/fetch`**: fetch directo de una URL desde el frontend, retorna `title`, `description`, `text`, `wordCount`, `links`
- **Detector `hasUrl()` en `AssistantToolsService.resolve()`**: antes de evaluar otros tools, si el mensaje contiene `https?://`, dispara `getBrowserAnswer()` que retorna el contenido como respuesta directa (sin llamar al LLM)
- **Tool registrada** en `ToolRegistryService` como `browser` (categoría `external_api`)

### Changed
- `AssistantToolsService` ahora recibe `BrowserToolService` por inyección de constructor
- `JarvisService` ahora recibe `BrowserToolService` por inyección de constructor, expone `fetchUrl(url)`
- `JarvisModule` y `AichatModule` registran `BrowserToolService` como provider

### Added
- **GitHub Pages Integration**: Scripts y documentación completa para conectar frontend en GitHub Pages con backend local usando ngrok o localtunnel.
  - Scripts NPM: `start:ngrok` (automático), `ngrok` (solo túnel), `tunnel` (localtunnel)
  - Scripts de inicio: `start-with-ngrok.bat` (Windows CMD) y `start-with-ngrok.ps1` (PowerShell)
  - Documentación: `README.md` actualizado, `docs/NGROK_SETUP.md` (guía completa), `CHECKLIST.md` (paso a paso)
- **Contexto dinámico de fecha/hora para el chatbot IA**: el prompt ahora incluye metadatos JSON con `fecha_actual`, `hora` y `ubicacion`, y una instrucción clara para no inventar la fecha actual.
- **Validación de tamaño de mensaje de IA**: `pregunta` ahora tiene un límite de 5000 caracteres para evitar que requests demasiado grandes destruyan el contexto del modelo.
- **Soporte de clima local con geolocalización móvil**: `CreateAichatDto` acepta `latitude` y `longitude` opcionales; cuando el usuario pregunta por el clima y el frontend envía geolocalización, el servicio usa Open-Meteo + Nominatim reverso para calcular la temperatura/clima local.

### Changed
- **CORS Configuration Enhanced**: `main.ts` ahora acepta requests desde múltiples orígenes con configuración específica:
  - `https://ifernandez89.github.io` (GitHub Pages producción)
  - URLs de ngrok (`*.ngrok.io`, `*.ngrok-free.app`)
  - URLs de localtunnel (`*.loca.lt`)
  - `localhost:3000` y `localhost:4000` (desarrollo local)
  - Configurado con `credentials: true` y headers/métodos explícitos

### Added
- **Feedback (Nivel 3)**: Nuevo modelo `Feedback` y endpoint `POST /api/jarbees/feedback` para calificar respuestas del agente con puntuación y comentarios.
- **Web Scraping (Nivel 3)**: `DocumentIngestService` ahora soporta ingestión directa desde URLs usando `cheerio` y `axios`. Endpoint expuesto en `POST /api/jarbees/library/document/url`.
- **Agente Planificador (Nivel 4)**: Creado motor básico para dividir objetivos en tareas estructuradas (`Task` y `TaskStep`). Expuesto mediante endpoint `POST /api/jarbees/planner`.
- **Tools de Economía Argentina (Nivel 4)**: Jarvis intercepta y responde sobre cotización del dólar (oficial, blue, bolsa, CCL) y riesgo país directamente usando `DolarAPI` sin consumir tokens, detectado en tiempo de router (`assistant-tools.service.ts`).
- Changelog tracking for user-facing changes.
- Detailed architecture documentation in [docs/arquitectura-sistema.md](docs/arquitectura-sistema.md).
- Explicit documentation of the local Ollama model used by the AI flow: `qwen3.5:4b`.
- **Logger global con Winston** (`nest-winston` + `winston-daily-rotate-file`): reemplaza el logger nativo de NestJS. Escribe a consola con formato colorizado y a archivos rotativos diarios — `logs/app-YYYY-MM-DD.log` (14 días, 20 MB) y `logs/error-YYYY-MM-DD.log` (30 días, 10 MB). Nivel configurable via `LOG_LEVEL` en `.env`.
- **Knowledge Hub — Colecciones**: nuevo modelo `Collection` con relación N:M a `Document`. Permite agrupar documentos en colecciones temáticas (ej: Programación, Astronomía). Endpoints CRUD completos en `/api/jarbees/library/collection`.
- **Knowledge Hub — PDF Upload**: nuevo endpoint `POST /api/jarbees/library/document/pdf` — acepta `multipart/form-data`, extrae texto con `pdf-parse`, aplica chunking deslizante (800 chars, 80 overlap) y persiste en la biblioteca.
- **Knowledge Hub — Tracking de uso**: `Document` ahora tiene `timesUsed` y `lastUsed`. Cada vez que un chunk es recuperado por RAG, el contador del documento padre se incrementa automáticamente.
- **Dashboard**: nuevo endpoint `GET /api/jarbees/dashboard` — devuelve resumen del sistema: memorias, conversaciones, sesiones, colecciones, documentos, chunks, top documentos más usados, breakdown por categoría y métricas del agente por modelo.
- **Biblioteca — estadísticas**: `GET /api/jarbees/library/stats` con conteos, top usados y agrupación por categoría. `GET /api/jarbees/library/document/recent` para los N documentos más recientes.
- **Chunking mejorado**: `DocumentIngestService` reemplaza el chunking por párrafos simple — usa ventana deslizante dentro de párrafos largos, configurable por `CHUNK_SIZE` y `CHUNK_OVERLAP`.
- Dependencias nuevas: `pdf-parse`, `axios`, `cheerio`.
- **Session message memory**: el servicio de chat ahora guarda `session.lastAssistantMessage` con cada respuesta exitosa. El endpoint `/aichat/preguntar` devuelve `{ respuesta, lastMessage }` en una única llamada HTTP, permitiendo al frontend acceder al último mensaje.
- **Repeat commands**: soporte para comandos de repetición como "Repíteme eso", "Léelo en voz alta", "Repite", "Say that again" (inglés). Cuando el usuario envía un comando reconocido, la IA devuelve automáticamente el `lastAssistantMessage` sin hacer una consulta adicional.
- **Endpoint GET `/aichat/session/ultimo-mensaje`**: acceso directo al último mensaje guardado (alternativa si se necesita de forma aislada).

### Changed
- Keep the latest implementation notes here before each release.
- The README now includes an executive overview, endpoint summary, and environment variable summary.
- Failed AI interactions are now persisted with `estado`, `errorMessage`, and `errorStatus` so error cases are auditable.
- The chatbot can now answer weather, time, holiday, and country-data questions through external tools before falling back to Ollama or OpenRouter.
- The documentation now explains supported intents, routing behavior, persistence rules, and known limitations.
- The request payload now controls the AI route correctly again: `agente=true` uses OpenRouter and `agente=false` or omitted uses Ollama.
- Weather queries now default to `Paraná, Entre Rios, Argentina` when the user does not provide a city.
- Placeholder greeting responses like `HOLA` are no longer persisted as successful AI answers.
- The AI prompt now explicitly rejects greeting-only outputs so Ollama/OpenRouter must return a substantive answer before it is saved.
- **RAG prompt optimization**: product context is now injected only when the query relates to products (keywords: precio, oferta, marca, comprar, etc.), skipping the full catalogue for unrelated questions.
- **Parallel DB calls**: `findAll()` and `findRelevant()` now run concurrently via `Promise.all()` instead of sequentially, reducing prompt-building latency.
- **Compact product format**: each product entry in the prompt was reduced from a multi-field verbose line to a single compact line (`name (marca) $price stock:N [OFERTA] [NUEVO] [DEST]`), lowering token count significantly.
- **Reduced RAG history**: relevant history context trimmed from 5 to 3 entries; each answer is capped at 200 characters to keep the prompt lean.
- **Simplified system prompt**: markdown formatting, numbered instructions, and verbose headers removed from the Ollama prompt to reduce processing overhead.
- **Ollama `numPredict` reduced**: lowered from 512 to 256 tokens — the primary driver of generation time for chat-style responses.
- **Ollama `numCtx` set to 2048**: explicit context window cap prevents the model from allocating unnecessary memory, speeding up inference.
- **Fix ECONNRESET Newton API**: timeout reducido a 5 s con `validateStatus`, catch tipado con `err: unknown`; los errores de red (`ECONNRESET`, timeout, 4xx) caen silenciosamente a `mathjs` local con un `warn` en log en lugar de propagar el error al cliente.
- **Ollama `topP`/`topK` tightened**: `topP` adjusted to 0.85 and `topK` to 15 for faster, more focused sampling.

### Fixed
- Record bug fixes that affect API behavior, validation, or deployment.
- **ENOTFOUND/ECONNRESET en tools externos**: `getWeatherAnswer`, `getHolidayAnswer`, `getCountryAnswer` ahora devuelven `null` (caída a Ollama con contexto) en lugar de lanzar error cuando la API externa falla (DNS, timeout, red). El usuario siempre recibe una respuesta.
- **Falsos positivos en saludo → clima**: detector de saludo (`isGreetingQuery`) agregado con máxima prioridad. Preguntas como "¿cómo estás?" o "hermano, amigo, cómo estás tanto tiempo?" ahora caen a Ollama en lugar de disparar el tool de clima. El pattern valida saludos simples (máx 40 chars) con palabras clave específicas.
### Fixed
- **Persistencia AI chat:** siempre persistir preguntas y respuestas. Se agregó manejo de errores y logging en `persistSuccessfulQuestion` para evitar que fallos de BD bloqueen la respuesta al usuario; `PreguntasRepository.create()` ahora implementa reintentos con backoff y, si todos los reintentos fallan, escribe un fallback en `data/preguntas-fallback.jsonl` para asegurar que ningún registro se pierda. Se añadieron logs informativos para facilitar diagnóstico en producción.

## [Unreleased — Context Expansion]

### Added
- **Astronomía local** (`astronomy-engine`): fase lunar con iluminación y próximas 4 fases, amanecer/atardecer por ciudad (Nominatim + observer), solsticios y equinoccios del año, datos de planetas (magnitud, elongación, iluminación), eclipses lunares y solares.
- **Calendario Maya** (cálculo matemático puro, sin librería): convierte cualquier fecha gregoriana a Cuenta Larga, Tzolk'in (número + nombre del día), Haab' y Señor de la Noche.
- **Calendario Hebreo** (`jewish-date`): convierte fecha gregoriana a fecha hebrea con año, mes, día y representación en caracteres hebreos.
- **Matemáticas** (`mathjs` local + Newton API sin clave): evaluación de expresiones numéricas, derivadas, integrales, simplificación y factorización. Newton API se usa para operaciones simbólicas; mathjs es el fallback local.
- Instaladas dependencias: `astronomy-engine`, `mathjs`, `jewish-date`.

### Changed
- Router de intenciones ampliado con 4 nuevos detectores: `isAstronomyQuery`, `isMayanCalendarQuery`, `isHebrewCalendarQuery`, `isMathQuery`.
- Todas las capacidades nuevas funcionan sin clave de API (stack completamente gratuito).

---

## [0.1.0] - 2026-06-16

### Added — Upload Module
- Nuevo módulo `src/upload/` con endpoint `POST /upload/image`.
- Acepta una imagen via `multipart/form-data` (campo `image`) y retorna su representación Base64 en el formato `data:<mimetype>;base64,<data>`.
- Validación de tipo MIME: rechaza con `400 Bad Request` si el archivo no es una imagen.
- `@types/multer` agregado a devDependencies.
- Documentación Swagger con `@ApiConsumes('multipart/form-data')` y schema de respuesta.

### Fixed — Prisma client desincronizado
- El cliente de Prisma no reflejaba los campos `estado`, `errorMessage` y `errorStatus` del modelo `Pregunta`, causando errores de compilación en `PreguntasRepository` y `AichatService`.
- Resuelto ejecutando `prisma generate` para regenerar el cliente desde el schema actualizado. No requirió cambios en el schema.

### Fixed — Puerto ocupado (EADDRINUSE :4000)
- Proceso anterior del servidor bloqueaba el puerto 4000 al reiniciar en modo watch.
- Identificado con `netstat -ano` y terminado con `taskkill /PID`.

---

## [0.2.0] - 2026-06-16

### Added — Jarvis Architecture v1 (5-layer memory system)

Refactorización del chatbot transaccional a asistente personal inteligente con arquitectura de 5 capas.

#### Base de datos — nuevos modelos (migración `20260616135227_jarvis_architecture`)
- `UserProfile` — perfil adaptativo del usuario (timezone, país, idioma, preferencias JSON). Valores por defecto: `America/Argentina/Buenos_Aires`, `Argentina`, `es-AR`.
- `Memory` — memoria permanente key-value con `category` e `importance` (1–10) para rankeo en recuperación.
- `ConversationMessage` — historial conversacional multi-sesión indexado por `sessionId` UUID. Reemplaza la tabla `Pregunta` como mecanismo de historial.
- `Document` — documentos estructurados para RAG con `title`, `content`, `category` y `source`.
- `Chunk` — fragmentos embeddables de documentos, con `embeddingId` preparado para pgvector. Relación cascade con `Document`.
- `Task` — planner para descomponer objetivos complejos con `status` (`pending` / `in_progress` / `completed` / `failed`).
- `Feedback` — registro de feedback del usuario con `score` y `comment` para aprendizaje continuo.

#### Módulo `src/jarvis/`
- `JarvisService` — orquestador principal de las 5 capas: tools pre-LLM → memoria → RAG → historial → LLM.
- `JarvisController` — endpoints REST: `POST /jarvis/query`, `GET/POST /jarvis/memory`, `POST /jarvis/document/ingest`, `GET /jarvis/document/search`, `GET/PATCH /jarvis/profile`.
- `MemoryRepository` — búsqueda de memorias por términos, ranking por `importance` y `updatedAt`.
- `ConversationRepository` — manejo de sesiones con `getRecentMessages()` y búsqueda cross-session.
- `DocumentRepository` — ingesta de documentos, creación de chunks, búsqueda textual en documentos y chunks.
- `UserProfileRepository` — `getOrCreate()` con valores por defecto argentinos.

#### Prompt reestructurado para Jarvis
- `SystemMessage`: rol + reglas + perfil del usuario (fijo por sesión).
- `HumanMessage`: bloques `### MEMORIA`, `### DOCUMENTOS`, `### HISTORIAL RECIENTE`, `### PREGUNTA ACTUAL` (dinámicos por request).
- Español rioplatense neutro con prioridad de contexto argentino.

### Changed
- Ollama `temperature` bajado de `0.3` → `0.2` para respuestas más deterministas en rol de asistente personal.
- Ollama `numCtx` subido de `2048` → `4096` para soportar contextos largos con memoria + documentos + historial.
- Stop token `'Usuario:'` agregado a la lista de corte del modelo.
- `AppModule` actualizado para importar `JarvisModule`.

---

## [0.3.0] - 2026-06-16

### Added — Jarvis Architecture v2 (full 9.5/10 architecture)

Evolución completa de la arquitectura con provider abstraction, observabilidad, session summaries y tool registry.

#### Base de datos — nuevos modelos (migración `20260616140757_jarvis_v2_full_architecture`)
- `MemoryChunk` — fragmentos de memoria con `embeddingId` preparado para búsqueda vectorial. Relación cascade con `Memory`. Permite vectorizar memorias individuales en el futuro con pgvector.
- `SessionSummary` — resumen progresivo de sesión (único por `sessionId`). Se actualiza automáticamente cada 10 mensajes para evitar enviar el historial completo al LLM.
- `KnowledgeSource` — registro de fuentes de conocimiento tipadas: `pdf`, `markdown`, `web`, `notion`, `github`, `postgres`, `api`. Los `Document` ahora pueden relacionarse con una `KnowledgeSource`.
- `TaskStep` — pasos individuales de ejecución del planner con `stepNumber`, `description`, `result` y `status`. Relación cascade con `Task`. Reemplaza el campo `steps Json?` anterior.
- `Tool` — registro dinámico de herramientas con `name` (único), `description`, `category`, `enabled` y `config Json?`. Sienta la base para activar/desactivar tools en runtime.
- `AgentRun` — observabilidad completa por ejecución: `question`, `answer`, `toolsUsed Json`, `modelUsed`, `provider`, `durationMs`, `tokensUsed`, `success`, `errorMsg`.

#### Base de datos — cambios en modelos existentes
- `Memory`: eliminados `key` (unique) y `value`; reemplazados por `content Text` (semántico natural, e.g. "Ignacio trabaja con NestJS") y `lastAccessed DateTime?` para tracking de uso.
- `Document`: agregado `sourceId` como FK opcional a `KnowledgeSource`.
- `Task`: eliminado `steps Json?`; los pasos ahora viven en la tabla `TaskStep`.

#### LLM Provider Abstraction (`src/jarvis/llm/`)
- `ILLMProvider` — interfaz unificada con `generate(options)` y `embed(text)`. Permite intercambiar el modelo sin tocar lógica de negocio.
- `OllamaProvider` — implementación para Ollama local (`llama3.2:3b`). Convierte `LLMMessage[]` a mensajes LangChain (`SystemMessage`, `HumanMessage`, `AIMessage`). Registra latencia.
- `OpenRouterProvider` — implementación para OpenRouter (`mistralai/mistral-7b-instruct:free`). Lee `OPENROUTER_API_KEY` desde `.env`.

#### Nuevos repositorios
- `AgentRunRepository` — `create()`, `getStats()` (total, éxitos, fallos, tasa de éxito, latencia promedio), `getTopTools()` (conteo manual desde JSON array), `getRecentRuns()`.
- `SessionSummaryRepository` — `upsert()`, `get()`, `delete()` por `sessionId`.

#### Nuevos endpoints
- `GET /jarvis/observability/stats` — estadísticas agregadas: total de runs, tasa de éxito, latencia promedio, top herramientas usadas.
- `GET /jarvis/observability/runs?limit=N` — listado de runs recientes con todos los metadatos.

### Changed
- `JarvisService` reescrito para usar `ILLMProvider` en lugar de `OllamaModelService` directamente. El provider se selecciona por nombre (`'ollama'` | `'openrouter'`) en cada request.
- `buildJarvisContext()` reemplaza `buildJarvisPrompt()`: retorna `systemPrompt` y `userPrompt` como strings separados, más `usedMemory` y `usedDocs` para tracking de herramientas.
- Historial de sesión usa `SessionSummary` cuando existe, evitando enviar mensajes individuales al LLM en sesiones largas.
- Memoria ahora se busca por `content` (campo texto libre) en lugar de `key`/`value`.
- `JarvisModule` actualizado: registra `OllamaProvider` y `OpenRouterProvider` como providers independientes inyectados en `JarvisService`.
- `Memory.content` — endpoint `POST /jarvis/memory` ahora acepta `{ content, category, importance }` en lugar de `{ key, value, category, importance }`.
- `GET /jarvis/memory/:id` — ahora busca por `id` numérico en lugar de `key` string.

### Fixed
- Métodos `getObservabilityStats()` y `getRecentRuns()` estaban fuera del cuerpo de la clase `JarvisService` por un `fs_append` mal ubicado. Reescritura completa del archivo corrigió el problema.
- Tipo de retorno de `DocumentRepository.searchChunks()` corregido a `(Chunk & { document: Document })[]` para que TypeScript reconozca la relación `include`.

---

## [0.4.0] - 2026-06-18

### Added — Model Router + Dual Ollama Support

#### Segundo modelo Ollama (`qwen3:4b`) como experto técnico
- `src/aichat/models/ollamaModel_2.ts` — nueva clase `OllamaQwenModelService` con configuración especializada para tareas técnicas: `temperature: 0.2`, `topK: 5`, `numCtx: 4096`, stop tokens extendidos.
- System prompt dedicado con dominios de expertise: NestJS, PostgreSQL, Drizzle ORM, LangChain, pgvector, Ollama, Alfresco, arquitectura de software.
- Variables `.env`: `OLLAMA_MODEL=llama3.2:3b` (general) y `OLLAMA_MODEL_2=qwen3:4b` (técnico).

#### `ModelRouterService` (`src/aichat/utils/model-router.service.ts`)
- Router inteligente que analiza el prompt y elige el modelo mediante detección de keywords técnicas.
- Más de 100 keywords cubriendo: frameworks, bases de datos, DevOps, debugging, LLM/AI, patrones de diseño, Alfresco.
- Si el prompt contiene keywords técnicas → `qwen3:4b`; caso contrario → `llama3.2:3b`.
- Método `logRouting()` registra la decisión con modelo elegido, razón y keywords detectadas en cada request.

#### Tokens de inyección desacoplados (`src/aichat/aichat.tokens.ts`)
- `LLAMA_MODEL_TOKEN = 'LLAMA_MODEL'` y `QWEN_MODEL_TOKEN = 'QWEN_MODEL'` movidos a archivo independiente.
- Elimina la dependencia circular entre `aichat.service.ts` y `aichat.module.ts`.

### Fixed — Circular dependency (EADDRINUSE → `?` en índice [4])
- `AichatService` importaba `LLAMA_MODEL_TOKEN` y `QWEN_MODEL_TOKEN` directamente desde `aichat.module.ts`.
- `AichatModule` importa `AichatService`, creando un ciclo: módulo → service → módulo.
- En `ts-node` (modo watch), el ciclo hacía que los tokens llegaran como `undefined` al service. NestJS los interpretaba como dependencia no resuelta y lanzaba el error de índice [4].
- Solución: tokens extraídos a `aichat.tokens.ts`; el módulo re-exporta desde ahí para compatibilidad.

### Fixed — Conflicto de nombre de clase en runtime
- Ambas implementaciones de Ollama se llamaban `OllamaModelService`. NestJS usa el nombre de la clase como identificador interno en `useClass`, causando que un provider pisara al otro.
- Solución: segunda clase renombrada a `OllamaQwenModelService`.

### Fixed — `require()` dinámico incompatible con NestJS DI
- El módulo original usaba `require('./models/ollamaModel_2')` dentro de un `try/catch` para registrar el provider condicionalmente.
- Si el `require` fallaba silenciosamente, el token `QWEN_MODEL` nunca se registraba y NestJS no podía inyectarlo.
- Solución: imports estáticos en `aichat.module.ts`; ambos providers siempre registrados.

---

## [0.0.1] - 2026-06-15

### Added
- Initial NestJS backend scaffold.
- Prisma integration and database migrations.
- Products, AI chat, and upload modules.
