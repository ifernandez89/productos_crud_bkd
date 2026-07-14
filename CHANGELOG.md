# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project keeps its versioning in `package.json`.

## [Unreleased]

### Optimized — RAG Chunking Strategy (2026-07-14)

- **📦 Parámetros de chunking optimizados**: Actualización de `CHUNK_SIZE` de 800 a **1200 caracteres** y `CHUNK_OVERLAP` de 80 a **150 caracteres** en `DocumentIngestService`.
- **⚡ Beneficios**:
  - ~40% reducción en cantidad de chunks por documento
  - Mejor contexto semántico dentro de cada chunk (bge-m3 maneja sin problema ~2000 caracteres)
  - Embeddings más rápidos (menos vectores a calcular y almacenar)
  - Recuperación RAG más coherente sin sacrificar relevancia
- **🎯 Rationale**: Con **bge-m3** como modelo de embeddings, no es necesario fragmentar el contenido en chunks pequeños. Los chunks más grandes mantienen mejor coherencia semántica y reducen la latencia de ingesta.

### Added — Local JSON Knowledge Base (2026-07-13)

- **📁 Carpeta `src/jarvis/knowledge`**: Soporte para cargar dinámicamente cualquier base de datos en formato JSON de conocimiento local.
- **🧠 `JarvisKnowledgeService`**: Nuevo servicio que escanea y lee de forma dinámica los archivos JSON:
  - Soporta consultas generales para listar el contenido registrado (ej. "qué plantas medicinales tenemos registradas?").
  - Extrae y formatea en tiempo real los datos estructurados (tratamientos, oraciones, descripción, precauciones, acciones) de cualquier elemento mencionado en la consulta del usuario (ej. "para qué sirve el cedrón?", "cómo curar la abichadura?").
- **🔧 Integración en `JarvisService`**: Intercepta comandos de listado de conocimiento al principio del ciclo de query y añade automáticamente la información estructurada preseleccionada y ya resumida en el contexto del LLM (`buildJarvisContext`) para ofrecer respuestas precisas.

### Changed — Refactor de prompt builder, ejecución y esquema de datos (2026-07-13)

- **🧩 Mejoras en el pipeline de prompts de Jarvis**: Se ajustó el flujo de construcción del prompt, la preparación del contexto y la ejecución para mejorar la coherencia de las respuestas y la integración con la base de conocimiento local.
- **⚙️ Optimización del motor de ejecución**: Se refinó el servicio de ejecución del planner para manejar mejor los pasos de respuesta, errores y continuidad del flujo conversacional.
- **📚 Compatibilidad con la biblioteca y pruebas de conocimiento**: Se actualizaron los servicios de ingesta, pruebas RAG y repositorio documental para soportar de manera más robusta la recuperación y validación de documentos.
- **🗄️ Ajustes en Prisma y migraciones**: Se actualizaron el esquema de Prisma y las migraciones asociadas para mantener la compatibilidad con la base de datos y el soporte de pgvector.
- **🛠️ Scripts auxiliares**: Se añadieron utilidades de parche y soporte para el builder de prompts y la integración de conocimiento.

### Fixed — Resiliencia de embeddings en Ollama (2026-07-13)

- **🧠 `EmbeddingsService`**: Se mejoró el manejo de errores al generar embeddings cuando Ollama devuelve `404` o `400` por falta de modelo.
- **🔁 Reintentos automáticos**: El sistema ahora prueba modelos alternativos de embeddings (`mxbai-embed-large`, `all-minilm`, etc.) antes de terminar en error.
- **🛡️ Fallback más robusto**: Si no es posible generar embeddings, el flujo de RAG continúa con búsqueda textual en lugar de romper la experiencia completa.
- **✅ Prueba añadida**: Se incorporó una prueba de regresión para validar el comportamiento de reintento.

### Added — Google Workspace + YouTube Integration (2026-07-12)

**📅 Google Calendar (ampliado):**
- `getDailyAgenda(date?)` — agenda estructurada del día dividida en Mañana/Tarde/Noche.
- `getEventsInRange(start, end)` — eventos en un rango de fechas.
- `detectConflicts(date)` — detecta solapamiento de eventos en un día.
- `createMeetingWithAttendees(summary, attendees[], start, end)` — crea reuniones con participantes y enlace de Google Meet automático.
- Comandos de chat: `agenda del lunes`, `tengo conflictos el martes?`, `agenda una reunión con X`.

**📧 Nuevo `GoogleGmailService`:**
- `getImportantEmails()` — correos no leídos con etiqueta IMPORTANT del inbox.
- `getEmailsFromToday()` — correos recibidos en las últimas 24hs.
- `searchEmails(query)` — búsqueda con sintaxis Gmail (`from:`, `subject:`, `has:attachment`, etc.).
- `draftEmail(to, subject, body)` — crea un borrador (scope `gmail.compose`, no requiere permisos sensibles).
- `summarizeThread(threadId)` — extrae el cuerpo del hilo para pasarlo al LLM.
- Comandos de chat: `mis emails`, `correos de hoy`, `busca en mi correo <tema>`, `redactá un email a X sobre Y`.

**📁 Nuevo `GoogleDriveService`:**
- `searchFiles(query, mimeType?)` — busca por nombre con enlace directo a Drive.
- `listRecentFiles()` — archivos modificados recientemente.
- `syncToKnowledge(fileId)` — descarga un PDF o Google Doc de Drive y lo ingesta en el sistema RAG (Document + Chunks), igual que un PDF subido manualmente. La categoría se detecta automáticamente.
- `uploadTextFile(fileName, content)` — sube texto plano a Drive.
- Comandos de chat: `mis archivos de Drive`, `busca en Drive <nombre>`, `sincronizá <URL de Drive>`.

**🎬 Nuevo `YouTubeService`:**
- `searchVideos(query, maxResults?)` — búsqueda usando YouTube Data API v3 (API Key, no OAuth).
- `getVideoInfo(videoId)` — título, canal, vistas, duración y descripción de un video.
- `getChannelVideos(channelId)` — videos recientes de un canal.
- `extractVideoId(url)` — parsea cualquier formato de URL de YouTube.
- Comandos de chat: `busca videos de NestJS`, `info de https://youtube.com/watch?v=ID`.

**🔐 Scopes OAuth ampliados (`GoogleAuthService`):**
- Agregados: `gmail.readonly`, `gmail.compose`, `drive.readonly`, `drive.file`, `userinfo.email`.
- El usuario debe re-autorizar visitando `/api/jarbees/google/auth` para activar los nuevos permisos.

**🧠 IntentRouter — nuevos intents:**
- `GMAIL` — detecta: `correo`, `email`, `gmail`, `bandeja`, `borrador`, `busca en mi correo`.
- `DRIVE` — detecta: `google drive`, `mi drive`, `busca en drive`, `sincronizar drive`.
- `YOUTUBE` — detecta: `youtube`, `busca un video`, `canal de youtube`, URLs de `youtu.be` / `youtube.com/watch`.

**📖 Ayuda (`h`) actualizada:**
- Secciones nuevas: GMAIL, GOOGLE DRIVE, YOUTUBE.
- Calendario ampliado con `agenda del día` y `conflictos`.

**⚙️ Variables de entorno:**
- `YOUTUBE_API_KEY` — nueva variable requerida para YouTube. Obtener en Google Cloud Console.
- `.env.example` actualizado con instrucciones.

**🔧 Archivos creados/modificados:**
- `src/jarvis/tools/google/google-gmail.service.ts` — nuevo
- `src/jarvis/tools/google/google-drive.service.ts` — nuevo
- `src/jarvis/tools/google/youtube.service.ts` — nuevo
- `src/google/google-auth.service.ts` — scopes ampliados
- `src/jarvis/tools/google/google-calendar.service.ts` — 4 métodos nuevos
- `src/jarvis/jarvis.service.ts` — imports, constructor, 3 handlers nuevos, ayuda actualizada
- `src/jarvis/jarvis.module.ts` — 3 providers nuevos
- `src/jarvis/tools/intent/intent-router.service.ts` — 3 intents nuevos + patrones
- `.env.example` — GOOGLE_* + YOUTUBE_API_KEY

### Added — Biblioteca de Habilidades Cognitivas: Razonamiento Modular (2026-07-12)

**🧠 Concepto:**
Skills de razonamiento especializado que el orquestador activa automáticamente según la naturaleza de la pregunta. No tocan el núcleo — se cargan como archivos desde `skills/` y el `SkillRegistryService` existente los inyecta al contexto del LLM cuando son relevantes.

**📦 Skills Creadas:**

- `skills/epistemologia/` — Marco central de evaluación del conocimiento. Evalúa certeza, origen de afirmaciones y sesgos antes de responder. Define 4 niveles de confianza epistémica (alta certeza / confianza razonable / especulación informada / incertidumbre honesta). Prioridad 8.

- `skills/logica-formal/` — Razonamiento deductivo, inductivo y abductivo. Detecta falacias (ad hominem, pendiente resbaladiza, falsa dicotomía, post hoc, etc.). Evalúa validez estructural de argumentos independientemente de su contenido. Prioridad 7.

- `skills/teoria-decisiones/` — Frameworks para decisiones bajo incertidumbre. Incluye análisis de opciones, maximin/maximax, valor esperado, análisis de reversibilidad y sesgos como aversión a la pérdida y costo hundido. Prioridad 7.

- `skills/metodo-cientifico/` — Evaluación de evidencia empírica. Distingue causalidad de correlación, evalúa calidad de estudios, detecta pseudociencia y aplica el ciclo hipótesis → predicción → verificación → revisión. Prioridad 7.

**⚙️ Integración:**
- Sin cambios al núcleo — el `SkillRegistryService` ya soporta este formato.
- Cada skill tiene `metadata.json` (nombre, descripción, categoría, keywords, prioridad, capacidades) y `skill.md` (contenido completo con identidad, heurísticas, preguntas clave y criterios de activación).
- Se activan automáticamente por relevancia semántica de la query del usuario.
- Pueden activarse en conjunto — una pregunta sobre "¿debería creer este estudio?" puede activar epistemología + método científico + lógica formal simultáneamente.

**🗂️ Estructura:**
```
skills/
├── epistemologia/
│   ├── metadata.json
│   └── skill.md
├── logica-formal/
│   ├── metadata.json
│   └── skill.md
├── teoria-decisiones/
│   ├── metadata.json
│   └── skill.md
└── metodo-cientifico/
    ├── metadata.json
    └── skill.md
```

**🔮 Extensión futura sin tocar el núcleo:**
Agregar nuevos skills es tan simple como crear una carpeta con `metadata.json` + `skill.md`. Candidatos naturales: `pensamiento-lateral/`, `retorica/`, `filosofia-mente/`, `estadistica-bayesiana/`, `etica-aplicada/`.

### Added — Seguridad y configuración de OAuth para Jarvis/BeeS (2026-07-12)

**🔐 Integración de seguridad para Jarbees y OAuth:**
- Añadido el archivo de configuración `oauth.yml` para el soporte de OAuth en el entorno.
- Actualizados los scripts `start-with-ngrok.bat` y `start-with-ngrok.ps1` para mantener la compatibilidad con el nuevo flujo seguro.

---

### Fixed — Corrección de manejo de `maxTokens` en Ollama (2026-07-11)

**🐛 Ajuste de límite de tokens:**
- Corregido el manejo de `maxTokens` en `src/jarvis/llm/ollama.provider.ts` para evitar errores de configuración y mejorar la estabilidad de las llamadas al modelo.

---

### Added — Reporte de arquitectura y diseño Jarvis (2026-07-11)

**📘 Documentación de arquitectura:**
- Añadido `docs/ARCHITECTURE_REPORT_JARVIS.md` con el diseño y arquitectura del sistema Jarvis.

---

### Added — Escaneo Estructural y Mitigación de Vulnerabilidades en PDFs (2026-07-11)

**🛡️ Inmunidad y Validación Estructural de PDFs (Zero-Trust):**
- Implementado el método `ensureNoDangerousCatalogActions()` en `DocumentIngestService` para mitigar ataques y exploits binarios y de JavaScript embebido en archivos PDF cargados.
- Integra la librería `pdf-lib` para auditar estructuralmente el documento y arroja un error `BadRequestException` impidiendo la ingesta si se detecta alguna anomalía:
  1. **AcroForms:** Bloquea formularios interactivos completos para mitigar interactividad oculta.
  2. **OpenAction:** Bloquea eventos de apertura automática de links o scripts.
  3. **Additional Actions (/AA):** Bloquea disparadores automáticos en el catálogo general y en cada página individual.
  4. **Annots peligrosas:** Bloquea anotaciones del tipo `/Screen` o `/Link` con acciones ejecutables `/Launch` o `/JavaScript`.
  5. **EmbeddedFiles:** Bloquea archivos adjuntos ocultos en el árbol `/Names`.

**🔧 Archivos Modificados:**
- `src/jarvis/library/document-ingest.service.ts`: Integrado el flujo de validación estructural con `pdf-lib` en `ingestPdf()`.

---

### Added — Comparación entre Documentos y Vista de Categorías (2026-07-11)

**📊 Comparación Cruzada entre Documentos (`DocumentCompareService`):**
- Nuevo servicio `src/jarvis/library/document-compare.service.ts` para realizar análisis comparativos entre dos documentos (PDFs, textos, etc.).
- Obtiene en paralelo los resúmenes y puntos clave individuales mediante `DocumentSummaryService`.
- Utiliza el LLM para estructurar un análisis de:
  - **Similitudes:** Conceptos o ideas que comparten.
  - **Diferencias:** Discrepancias en enfoque o perspectiva.
  - **Complementariedad:** Qué aporta cada uno.
  - **Conclusión:** Breve síntesis.
- **Nuevos comandos de chat detectados:**
  - `resumen de 'Libro A' relaciona 'Libro B'` / `resumen 'Libro A' relaciona 'Libro B'`
  - `compara 'Libro A' con 'Libro B'`
  - `relaciona 'Libro A' y 'Libro B'`
  - `diferencias entre 'Libro A' y 'Libro B'`

**📁 Comando `mis categorias`:**
- Nuevo comando conversacional para listar las categorías disponibles en la biblioteca y la cantidad de documentos que pertenecen a cada una.
- Sugiere comandos automáticos específicos para cada categoría (ej: `📂 plantas_medicinales — 5 documentos -> resumen sobre plantas_medicinales`).

**🔧 Archivos Modificados:**
- `src/jarvis/library/document-compare.service.ts`: Nuevo servicio de análisis comparativo.
- `src/jarvis/jarvis.service.ts`: Integrados shortcuts de chat para `mis categorias` y comparación de documentos, junto con sus métodos auxiliares `buildCategoriesMessage()`, `extractCompareRequest()` y `buildCompareResponse()`.
- `src/jarvis/jarvis.module.ts`: Registrado `DocumentCompareService` en los proveedores.

---

### Added — Modos de Búsqueda Flexibles e Internet Controlado (2026-07-11)

**🎯 Arquitectura "Local First" y Modos de Búsqueda:**
- Añadidos 4 modos de comportamiento para el RAG e internet, guardados de forma persistente en las preferencias del perfil de usuario:
  - **`OFFLINE`**: Desactiva internet de forma total. Las consultas web y deportivas se ignoran y no se realiza ningún fallback web.
  - **`LOCAL_FIRST` (Por defecto / Recomendado)**: Intenta responder usando la base de datos (RAG) o el LLM primero. Solo busca en internet si la pregunta es de alta confianza sobre temas dinámicos (clima/precio) Y no hay coincidencias locales, o como fallback automático si el LLM da una respuesta evasiva.
  - **`HYBRID`**: Las herramientas y temas dinámicos (clima, deportes, noticias, cotizaciones, autoridades) buscan en internet inmediatamente. Para el resto de consultas, prioriza documentos locales y el conocimiento del modelo antes de usar la web.
  - **`WEB_FIRST`**: Busca en la web inmediatamente para enriquecer cualquier pregunta (excepto saludos y comandos directos).

**💬 Comandos en el Chat para Configurar el Modo:**
- `modo offline` o `configurar modo offline` -> Cambia el comportamiento a OFFLINE de forma persistente.
- `modo local first` -> Cambia al modo por defecto.
- `modo hybrid` / `modo hibrido` -> Cambia al modo híbrido.
- `modo web first` -> Cambia a búsqueda en internet en primera instancia.

**⚡ Optimización con Pre-búsqueda RAG (RAG Pre-search):**
- Antes de tomar cualquier decisión de ir a internet en consultas `WEB` o `SPORTS` (en modos `LOCAL_FIRST` e `HYBRID`), el sistema realiza una pre-búsqueda en la base de datos de documentos.
- Si existen hits de documentos locales (`hasRagHits === true`), **cancela** la búsqueda web inicial y le da prioridad a responder con tus PDFs.
- El contexto recuperado se transfiere a `respondWithLLM()` mediante un parámetro `prefetchedRagContext` para evitar realizar consultas redundantes a la base de datos, mejorando la latencia en ~150ms.

**🔧 Archivos Modificados:**
- `src/jarvis/jarvis.service.ts`: Lógica de pre-búsqueda RAG, decisión de `triggerWebSearch`, comandos de cambio de modo, y ayuda (`h`) actualizada.
- `src/jarvis/repositories/user-profile.repository.ts` / `Prisma`: Mapeo y guardado de preferencias en base de datos.


---

### Added — Sistema de Diagnóstico y Validación de Conocimiento RAG (2026-07-11)

**🔬 Nuevo `KnowledgeTestService`:**
- Creado en `src/jarvis/library/knowledge-test.service.ts` para proveer diagnósticos de biblioteca, pruebas automatizadas de RAG y herramientas de inspección (probing).
- **Diagnóstico de Biblioteca:** Calcula estadísticas de cobertura (docs, chunks indexados, promedio de chunks por documento, categorías, top usados, y alertas de documentos sin chunks).
- **Pruebas de Conocimiento Automatizadas:** Selecciona N documentos, genera preguntas de prueba específicas por LLM a partir de chunks intermedios, simula la consulta RAG del usuario y valida si el documento de origen fue recuperado en el Top 3 (mide Recall@5 y tasa de éxito general).
- **Sonda de Chunks (Probe):** Inspecciona detalladamente qué chunks de qué documentos recupera el RAG para cualquier consulta y muestra un snippet de cada uno.

**💬 Comandos Nuevos en el Chat:**
- `diagnóstico biblioteca` / `estado del conocimiento` -> Muestra el estado del RAG, estadísticas de uso y alertas.
- `test de conocimiento` / `test de conocimiento <N>` -> Ejecuta pruebas automáticas de recuperación RAG (por defecto 3 tests).
- `probe: <pregunta>` -> Muestra un reporte detallado con los chunks exactos recuperados por el RAG para esa pregunta.

**🌐 Nuevos Endpoints REST:**
- `GET /jarbees/library/diagnostic`
- `POST /jarbees/library/knowledge-test` (Body: `{ numTests?: number }`)
- `POST /jarbees/library/probe` (Body: `{ query: string, limit?: number }`)

**🔧 Archivos Modificados:**
- `src/jarvis/library/knowledge-test.service.ts`: nuevo servicio de testeo.
- `src/jarvis/jarvis.service.ts`: atajos conversacionales integrados + ayuda actualizada (`h`).
- `src/jarvis/jarvis.controller.ts`: nuevos endpoints REST expuestos.
- `src/jarvis/jarvis.module.ts`: registro de `KnowledgeTestService` en NestJS.

---

### Fixed — Detección Mejorada de Resumen por Documento (2026-07-11)

**🐛 Problema:** El comando `"Resumen Carta astral Ignacio Gabriel Fernández"` (título del documento sin comillas y sin preposición) era interceptado por el intent ASTROLOGY en lugar de activar el resumen de documento.

**✅ Correcciones en `extractDocumentSummaryRequest()` (`jarvis.service.ts`):**

- **Patrón 4 — `resumen <título>` sin preposición:**
  - Detecta `"Resumen Carta astral Ignacio Gabriel Fernández"` → busca documento con ese título.
  - Excluye mediante negative-lookahead frases genéricas: `"resumen de..."`, `"resumen sobre..."`, `"resumeme..."`, etc.
  - Requiere al menos 2 palabras para evitar falsos positivos con "resumen" solo.

- **Patrón 5 — Mensaje completo == título del documento:**
  - Cuando el usuario escribe exactamente el título de un doc (2–10 palabras, inicia con mayúscula, no es un verbo de comando), se intenta buscarlo directamente en la biblioteca.
  - Lista de exclusión `COMMAND_STARTERS`: evita capturar `"busca en mis docs..."`, `"dame los puntos..."`, etc.
  - Lista `GENERIC_STARTERS`: evita capturar frases como `"sobre plantas medicinales"`, `"las últimas noticias"`, etc.

- **Patrón 3 mejorado:** ahora no requiere que el título empiece con mayúscula (más flexible).

**✅ Fuzzy matching mejorado en `DocumentSummaryService.findDocumentByTitle()`:**
- Normaliza tildes antes de comparar (`"Fernández"` == `"Fernandez"`).
- Quita extensiones de archivo de los títulos al comparar (`.pdf`, `.docx`, etc.).
- Nuevo **overlap score**: cuenta qué % de las palabras buscadas aparecen en el título del candidato — permite encontrar `"Resumen Carta astral Ignacio Gabriel Fernández"` buscando `"Carta astral Ignacio Gabriel Fernández"`.
- Umbral de aceptación: ≥ 50% de palabras en común.
- Búsqueda de respaldo con palabras largas (≥ 5 chars) cuando la búsqueda principal no encuentra nada.
- Logging detallado de cada paso para facilitar debugging.

**🔧 Archivos Modificados:**
- `src/jarvis/jarvis.service.ts`: Patrones 4 y 5 en `extractDocumentSummaryRequest()`; Patrón 3 más flexible
- `src/jarvis/library/document-summary.service.ts`: `findDocumentByTitle()` reescrito con scoring por overlap

---

### Fixed — Sanitización de Extensiones en Títulos de Documentos (2026-07-11)


**🐛 Problema:** Al subir archivos `.docx`, `.doc`, `.txt` u otras extensiones, el título quedaba con la extensión incluida (ej: `"las mareas del inconsciente.docx"`), lo que impedía encontrarlo correctamente al buscar por nombre.

**✅ Correcciones:**
- Nuevo método `DocumentIngestService.sanitizeTitle()` que elimina extensiones de archivo comunes antes de guardar:
  - `.pdf`, `.docx`, `.doc`, `.xlsx`, `.xls`, `.pptx`, `.ppt`, `.txt`, `.md`, `.csv`, `.odt`, `.ods`, `.odp`, `.rtf`, `.html`, `.htm`, `.epub`, `.mobi`
- `JarvisController.ingestPdf()`: ahora usa `sanitizeTitle()` en lugar de solo quitar `.pdf` — cubre uploads de cualquier tipo.
- `DocumentIngestService.ingestText()` e `ingestPdf()`: ambos usan `sanitizeTitle()` para normalizar el título antes de persistir.
- **Corrección de datos existentes:** el documento `"las mareas del inconsciente.docx"` fue renombrado a `"las mareas del inconsciente"` directamente en la base de datos.
- Nuevo método `DocumentRepository.updateDocument()` para poder parchear título/categoría/fuente de documentos existentes.

**🔧 Archivos Modificados:**
- `src/jarvis/library/document-ingest.service.ts`: nuevo `sanitizeTitle()`, aplicado en `ingestText()` e `ingestPdf()`
- `src/jarvis/jarvis.controller.ts`: usa `sanitizeTitle()` al extraer título del archivo subido
- `src/jarvis/repositories/document.repository.ts`: nuevo método `updateDocument()`

---

### Added — Integración Conversacional de Resumen por Documento (2026-07-11)

**📄 Integración en el flujo de chat (`jarvis.service.ts`):**
- Nuevo shortcut de alta prioridad en `query()`: detecta solicitudes de resumen de un documento individual **antes** del Intent Router, por lo que no necesita clasificación LLM.
- Nuevo método privado `extractDocumentSummaryRequest()`: detecta 3 patrones de lenguaje natural:
  1. **Título entre comillas:** `resumen de 'Manual de Plantas'`, `puntos clave de "TypeScript Handbook"`
  2. **Con tipo de archivo explícito:** `resumen del libro Manual de NestJS`, `resumen del pdf Guía Herbal`
  3. **Título en mayúsculas (sin comillas):** `resumen de Manual de Plantas Medicinales`
- Extrae automáticamente el número de puntos si el usuario lo especifica: `dame los 5 items de '...'` → `maxItems=5` (rango: 3–15).
- Nuevo método privado `buildDocumentSummaryResponse()`: formatea la respuesta con título, categoría, stats de palabras/secciones, resumen ejecutivo y lista numerada de puntos clave.
- Manejo de errores amigable: si el documento no existe, sugiere usar comillas y ver `mis documentos`.

**💬 Comandos soportados (nuevos ejemplos confirmados):**
```
resumen de 'Las mareas del inconsciente'
puntos clave de "TypeScript Handbook"
dame los 10 items de 'Guía de NestJS'
resumen del libro Manual de Plantas Medicinales
lo más importante de 'nombre del documento'
```

**📋 Ayuda actualizada (`buildLibraryMessage()`):**
- Los tips al final del listado de documentos ahora muestran los nuevos comandos de resumen individual.

**🔧 Archivos Modificados:**
- `src/jarvis/jarvis.service.ts`: shortcut + `extractDocumentSummaryRequest()` + `buildDocumentSummaryResponse()`

---



**📄 Nuevo `DocumentSummaryService`:**
- Nuevo servicio `src/jarvis/library/document-summary.service.ts` que genera resúmenes ejecutivos y extrae los puntos clave de un documento individual.
- Busca el documento por título con **fuzzy matching** (match exacto → match por palabras → primer candidato).
- Combina todos los chunks del documento para analizar el contenido completo.
- Para libros/PDFs largos (>10.000 chars), procesa inicio (8.000) + final (2.000) para capturar intro y conclusiones.
- Fallback graceful cuando Ollama no está disponible: devuelve extracto básico con el contenido crudo.

**💬 Comandos Nuevos (lenguaje natural):**
- `resumen de 'título del documento'` → resumen ejecutivo + 10 puntos clave
- `resumen del libro 'título'` → ídem
- `puntos clave de 'título'` → top 10 items más relevantes
- `dame 5 puntos de 'título'` → cantidad configurable (1-N)
- `items relevantes del documento 'título'` → variante alternativa

**🔍 Detección Automática en Chat:**
- `JarvisService.detectDocumentSummaryRequest()`: detecta 3 patrones de solicitud de resumen individual.
- Prioridad en el flujo RAG: **documento individual → resumen por categoría → búsqueda normal de chunks**.
- Extrae automáticamente el número de puntos solicitados si el usuario lo especifica (ej: "dame 5 puntos").

**🌐 Nuevo Endpoint REST:**
- `POST /jarbees/library/document-summary`
  - Body: `{ titleOrId: string | number, maxKeyPoints?: number }`
  - Response: `{ documentId, title, category, summary, keyPoints[], wordCount, chunkCount }`

**📖 Ayuda (`h`) Actualizada:**
- Sección **BIBLIOTECA / DOCUMENTOS / PDFs** ampliada con los nuevos comandos:
  - `resumen de '<título>'`
  - `puntos clave de '<título>'`
  - `dame 10 items de '<título>'`

**🔧 Archivos Modificados:**
- `src/jarvis/library/document-summary.service.ts`: nuevo servicio
- `src/jarvis/jarvis.service.ts`: detección + flujo RAG reestructurado + ayuda actualizada
- `src/jarvis/jarvis.controller.ts`: nuevo endpoint + import
- `src/jarvis/jarvis.module.ts`: registro del servicio
- `src/jarvis/tools/intent/intent-router.service.ts`: nuevo patrón RAG para resumen de documento

### Added — Sistema de Detección Automática de Categorías y Resúmenes Inteligentes (2026-07-10)

**🎯 Detección Automática de Categorías:**
- Al subir documentos/PDFs, el sistema detecta automáticamente la categoría del contenido usando una estrategia en cascada de 3 niveles:
  1. **Keywords (rápido)**: Analiza título y contenido con patrones predefinidos para 30+ categorías
  2. **LLM (inteligente)**: Si no hay match de keywords, usa el modelo de IA para clasificar
  3. **Fallback (seguro)**: Extrae categoría del título o usa "general"
- Categorías detectables: medicina, plantas_medicinales, desarrollo, ia, tecnologia, agricultura, biologia, quimica, fisica, matematicas, economia, derecho, historia, arte, literatura, musica, deportes, gastronomia, y más.
- El campo `category` ahora es opcional en todos los endpoints de ingestión (PDF, texto, URL).
- Implementado en `DocumentIngestService.detectCategory()` con métodos auxiliares:
  - `detectCategoryFromKeywords()`: búsqueda por patrones
  - `detectCategoryWithLLM()`: clasificación con IA
  - `fallbackCategoryFromTitle()`: respaldo final

**📚 Resúmenes Inteligentes por Categoría:**
- Nuevo `CategorySummaryService` que genera resúmenes combinados de múltiples documentos de la misma categoría.
- Cuando el usuario pregunta "resumen sobre plantas medicinales" o "tenemos información en documentos sobre tecnología?":
  1. Detecta la categoría solicitada
  2. Recupera chunks de TODOS los documentos con esa categoría (máx. 15 por defecto)
  3. Balancea contenido de diferentes documentos para evitar sesgos
  4. Genera un resumen coherente usando el LLM
  5. Cita las fuentes consultadas (títulos de documentos)
- Soporta queries específicas dentro de la categoría: "resumen de medicina sobre plantas antiinflamatorias"
- Si no hay documentos en la categoría, muestra:
  - Lista de categorías disponibles con conteo de documentos
  - Sugerencia de qué categorías puede consultar
- Nuevos métodos en `DocumentRepository`:
  - `searchChunksByCategory(category, limit)`: busca por categoría
  - `searchChunksByQueryAndCategory(query, category, limit)`: busca con filtro adicional

**🔍 Detección Mejorada de Consultas:**
- `IntentRouter` mejorado con más patrones para detectar consultas sobre documentos:
  - "tenemos/hay información en documentos sobre X"
  - "mis documentos de X"
  - "qué tengo sobre X"
  - "según mis PDFs de X"
- `JarvisService.detectCategorySummaryRequest()` con 7 patrones diferentes:
  - Resumen directo: "resumen sobre X"
  - Documentos: "documentos sobre X", "PDFs de X"
  - Búsqueda: "busca en X"
  - Existencia: "tenemos información sobre X"
  - Posesión: "mis documentos de X"
  - Consulta: "qué tengo sobre X"
  - Referencia: "según mis documentos de X"
- Validación automática de categorías (mínimo 3 caracteres, excluye palabras comunes)
- Log de detección para debugging: muestra categoría detectada y mensaje original

**🛡️ Sanitización de Texto para PostgreSQL:**
- Nuevo método `sanitizeText()` que limpia caracteres problemáticos antes de guardar:
  - Remueve caracteres nulos (`\x00`) que causan error "invalid byte sequence for encoding UTF8"
  - Remueve caracteres de control problemáticos (excepto saltos de línea y tabs)
  - Normaliza múltiples espacios en blanco
- Aplicado en todos los puntos de ingestión: `ingestPdf()`, `ingestText()`, `ingestUrl()`
- Limpia tanto títulos como contenido antes de guardar en BD

**🌐 Endpoints Nuevos/Actualizados:**
- `POST /jarbees/library/ingest/pdf`: campo `category` ahora opcional (se detecta automáticamente)
- `POST /jarbees/library/ingest/text`: campo `category` ahora opcional (se detecta automáticamente)
- `POST /jarbees/library/ingest/url`: campo `category` ahora opcional (se detecta automáticamente)
- `POST /jarbees/library/category-summary`: nuevo endpoint para generar resúmenes por categoría
  - Body: `{ category: string, query?: string, maxChunks?: number }`
  - Response: `{ category, documentsUsed, chunksUsed, summary, documentTitles }`

**💬 Integración en Chat:**
- El flujo conversacional (`POST /jarbees/chat`) detecta automáticamente solicitudes de resumen por categoría
- No requiere endpoints especiales - funciona con lenguaje natural
- Ejemplos que funcionan:
  - "resumen sobre plantas medicinales"
  - "tenemos información en documentos sobre tecnología?"
  - "qué dicen mis PDFs de medicina"
  - "información sobre desarrollo"
  - "hay algo de agricultura en mis archivos?"

**📖 Comandos Actualizados en Ayuda:**
- Guía de ayuda (`h`) actualizada con sección **BIBLIOTECA / DOCUMENTOS / PDFs**:
  - Ver documentos: `mis documentos` / `biblioteca`
  - Resumen por categoría: `resumen sobre <tema>`
  - Ejemplos: `resumen sobre plantas medicinales`, `qué dicen mis PDFs de medicina`
  - Buscar en docs: `busca en mis documentos <tema>`
  - Limpiar duplicados: `eliminar documentos repetidos`
- Nota explicativa sobre detección automática de categorías
- Sugerencia de uso: el usuario puede preguntar por temas específicos y el sistema combina información de múltiples documentos

**📄 Documentación:**
- Nuevo documento completo: `docs/CATEGORY_AUTO_DETECTION.md` con:
  - Explicación detallada del sistema de detección automática
  - Flujos de trabajo (diagramas)
  - Ejemplos de uso (curl, chat)
  - Arquitectura técnica (componentes, métodos)
  - Lista completa de categorías detectables
  - Ejemplos reales de uso
  - Planes de mejoras futuras

**🔧 Archivos Modificados:**
- `src/jarvis/library/document-ingest.service.ts`: detección automática + sanitización
- `src/jarvis/library/category-summary.service.ts`: nuevo servicio de resúmenes
- `src/jarvis/repositories/document.repository.ts`: nuevas queries por categoría
- `src/jarvis/jarvis.service.ts`: integración en flujo conversacional + detección mejorada
- `src/jarvis/jarvis.controller.ts`: nuevo endpoint + import de CategorySummaryService
- `src/jarvis/jarvis.module.ts`: registro de CategorySummaryService
- `src/jarvis/tools/intent/intent-router.service.ts`: patrones mejorados para RAG

### Added — Comando "eliminar documentos repetidos" (2026-07-10)

- Nuevo atajo de chat: `eliminar documentos repetidos`, `borrar duplicados`, `deduplicar`, `limpiar biblioteca` y variantes.
- Detecta grupos de documentos con el mismo título (normalizado), conserva el más reciente y elimina las copias anteriores junto con sus chunks (cascade).
- Muestra un resumen de qué se eliminó y qué se conservó.
- `DocumentRepository` tiene dos nuevos métodos: `findDuplicates()` y `deleteManyDocuments()`.
- Comando agregado a la guía `h`.

### Added — Comando "mis documentos" / "biblioteca" (2026-07-10)

- Nuevo atajo de chat: escribir `mis documentos`, `biblioteca`, `mis libros`, `mis pdfs` o variantes retorna instantáneamente la lista de documentos guardados en BD, agrupados por categoría con conteo de chunks y veces usado.
- Se actualizó la guía `h` para incluir el nuevo comando en la sección **BIBLIOTECA**.

### Added — DocumentEnrichmentService: biblioteca personal inteligente (2026-07-10)

- Nuevo `DocumentEnrichmentService` (`src/jarvis/library/document-enrichment.service.ts`).
- Al ingestar un PDF, se dispara en background un pipeline de enriquecimiento que extrae:
  - **Resumen global** (2-3 párrafos) del documento completo
  - **15-20 conceptos clave** detectados por el LLM
  - **Entidades**: personas, teorías/frameworks, tecnologías
  - **Citas destacadas** (máx. 5)
  - **Tags** para búsqueda semántica
- Todo se guarda como chunks especiales (`type: summary | concepts | entities | quotes`) en la tabla `Chunk` → disponibles automáticamente en RAG.
- Se crean `TopicSnapshot` en Knowledge Evolution: uno por documento y uno por cada uno de los 5 conceptos más importantes → consultables con `GET /api/jarbees/evolution?topic=X`.
- Procesa el texto en secciones de 4000 chars (máx. 8 secciones) para no saturar el modelo en libros largos.
- Corre en background — no bloquea la respuesta al usuario ni el tiempo de ingestión.

### Added — PDF: respuesta automática con LLM tras ingestión (2026-07-10)

- `DocumentIngestService.ingestPdf()` ahora acepta un `question` opcional y genera automáticamente una respuesta con el LLM después de parsear el PDF.
- Si se envía `question` → responde la pregunta usando el contenido del documento.
- Si no se envía `question` → genera un resumen completo estructurado.
- El endpoint `POST /api/jarbees/library/document/pdf` acepta los nuevos campos `question` y `sessionId`. Si se provee `sessionId`, la interacción (PDF + respuesta) se guarda en el historial de conversación.
- La respuesta se retorna en el campo `answer` del response JSON.
- Fallback graceful: si Ollama no está disponible, retorna confirmación de guardado sin romper la ingestión.

### Fixed — pdf-parse v2: API de clase (2026-07-10)

- `pdf-parse@2.x` cambió completamente su API — ya no es una función sino una clase: `new PDFParse({ data: buffer }).getText()`. Corregido el import y el uso en `DocumentIngestService`.

### Added — Atajo de ayuda "h" + Integración multimodal Qwen2.5-VL (2026-07-10)

- Nuevo atajo `h`: escribir exactamente "h" en el chat devuelve de forma instantánea la guía completa de comandos (agenda, búsqueda web, calendario, memoria, OCR, repetir). Bypasea LLM, intent router y tools — respuesta en ~0ms. Se guarda en el historial de conversación.
- `VisionService` (`src/jarvis/tools/vision/vision.service.ts`): servicio de análisis de imágenes vía Ollama + `yemifo/qwen25-vl-3b-q4km`. Soporta modos `general | ocr | error | diagram | document`, detección de lenguaje de código y guardado opcional en historial via `sessionId`.
- Nuevos endpoints en `JarvisController`:
  - `POST /api/jarbees/vision/analyze` — imagen + pregunta + modo + sessionId opcional.
  - `POST /api/jarbees/vision/ocr` — OCR rápido sin pregunta.
- `resolveVisionModel()` agregado a `src/shared/ollama-config.ts`, lee `OLLAMA_MODEL_VL_NAME`.
- `VisionService` registrado en `JarvisModule`.

### Added — Multi-model Ollama: resolvers por caso de uso + fix clasificador de intents (2026-07-09)

- Se agregaron dos nuevas funciones exportadas en `src/shared/ollama-config.ts`:
  - `resolveIntentModel()` → lee `OLLAMA_MODEL_TEST2_NAME`, descarta modelos `reasoning` automáticamente.
  - `resolveTechModel()` → lee `OLLAMA_MODEL_TEST3_NAME` (qwen3:4b por defecto).
- `IntentRouterService` ahora usa `resolveIntentModel()` en lugar de leer `OLLAMA_MODEL` directo.
- `OllamaQwenModelService` (ollamaModel_2.ts) reemplaza el hardcode `qwen3:4b` por `resolveTechModel()`.
- Se agregó `think: false` y strip de `<think>...</think>` en `llmClassify` para compatibilidad con modelos reasoning.
- Descubierto via test: `phi4-mini-reasoning` siempre emite chain-of-thought y no puede responder 1 palabra → descartado como clasificador. El resolver lo filtra automáticamente y cae al default `llama3.2:3b`.
- `.env.example` actualizado con las tres variables de modelo documentadas.
- Script de verificación en `scratch/test-model-resolvers.mjs` — testea resolución de vars y ping a cada modelo.

### Fixed — SITE_SEARCH: detección de sitios con prefijo ("Puedes darme") y typos (2026-07-09)

- Patrón 1 de `extractSiteSearchFromText` tenía `^` que impedía detectar queries como "Puedes darme 6 titulares de noticias en mystery planet" — se eliminó el ancla y se amplió el verbo `darme`.
- `resolveSiteAlias` ahora implementa fuzzy matching con Levenshtein (tolerancia 1 char por palabra), resolviendo typos como `plantet` → `mystery planet` → `mysteryplanet.com.ar`.

### Fixed — Corrupción en `jarvis.service.ts` y `web-helper.ts` (2026-07-08)

- Se eliminó una llave `}` extra que cerraba prematuramente el bloque `if (category === 'noticias' || ...)` en `JarvisService.query()`, dejando el `failMsg` de noticias locales fuera del bloque condicional.
- Se restauró `WebHelper.scrapeUrlWithSelectors()` que había quedado envuelto en un bloque `/**` sin cerrar, comentando accidentalmente el método completo y causando 4 errores de compilación (`TS2339`) en `jarvis.service.ts`, `content-cache.service.ts` y `web-helper.ts` (×2).

### Fixed — Titulares reales de noticias: scrapeHeadlines + detección SITE_SEARCH (2026-07-08)

- Se diagnosticó la causa raíz de las alucinaciones en noticias: el scraper devolvía 514 chars de menú/navegación del sitio, y el LLM usaba ese texto sin sentido para fabricar noticias plausibles.
- Nuevo método `WebHelper.scrapeHeadlines()` que extrae específicamente `h2 a`, `h3 a`, `.titulo a`, etc. Verificado contra elonce.com: extrae 60 titulares reales.
- `executeSiteSearch` ahora detecta queries de noticias/titulares y llama a `scrapeHeadlines` primero en lugar del scraper genérico de cuerpo.
- El "último recurso directo a El Once" fue reemplazado: ya no usa `scrapeUrl` (que devolvía menús) sino `scrapeHeadlines`.
- `extractSiteSearchFromText` en `IntentRouterService` reescrito con dos patrones nuevos de alta prioridad:
  - Patrón 0: "revisa X", "abrí X", "chequeá X" → detecta el sitio directamente.
  - Patrón 1: "dame N noticias del/de X" → detecta combinación de cantidad + fuente.
- El alias map y la lógica de resolución de dominios se extrajeron a `resolveSiteAlias()` para reutilización limpia entre patrones.
- Se corrigió un bug de regex multilínea con flag `/x` (no soportado en TypeScript) que rompía la compilación.

### Fixed — Evidence-first: sin evidencia web no se responden eventos actuales (2026-07-08)

- Se implementó la regla "Evidence First" en `JarvisService`: si no hay contexto web verificado, las preguntas sobre eventos actuales devuelven un mensaje honesto en lugar de pasar al LLM a inventar.
- `SITE_SEARCH` sin resultados ya no hace fallback a WEB ni al LLM — devuelve un aviso con link directo al sitio pedido.
- `SPORTS` sin resultados de API ni scraping ya no llama al LLM sin contexto — devuelve aviso honesto.
- Bloque `WEB` sin resultados ahora pasa por `isCurrentEventQuery()`: si la pregunta tiene señales de evento actual (hoy, ayer, noticias, resultado, gol, precio, etc.) devuelve aviso; si no (preguntas conceptuales) el LLM responde normalmente con conocimiento base.
- Nuevo método `buildNoEvidenceMessage()` construye respuestas honestas con hora y link al sitio cuando aplica.

### Fixed — CRUD de pendientes: lógica de comandos y extracción de objetivos (2026-07-08)

- Se corrigió la lógica de `TaskReminderService` donde comandos como "borra el pendiente agregar" se guardaban incorrectamente como nuevos pendientes porque el verbo "agregar" disparaba el intent de creación.
- Los intents de borrado y listado ahora se evalúan antes que el de creación para evitar falsos positivos.
- Se separaron `extractDeleteTarget` y `extractCreateObjective` en métodos independientes, cada uno limpiando solo los tokens de su contexto.
- Se agregó borrado por número ("borra el 2") como alternativa más confiable al borrado por nombre.
- Se agregó soporte para marcar pendientes como completados ("completé el pendiente 1", "ya hice la tarea 2").
- Cuando no se encuentra un pendiente por nombre al borrar, se muestra la lista numerada para facilitar el borrado por número.

### Fixed — Evaluador de conocimiento con heurísticas para rechazar contenido efímero (2026-07-08)

- Se agregaron heurísticas en `ExecutionEngineService` para detectar y rechazar contenido sin valor de reutilización antes de guardarlo en la biblioteca de conocimiento.
- El filtro evalúa señales como longitud mínima, presencia de fechas muy específicas, referencias a "hoy/ahora/esta semana", y ausencia de conceptos generalizables.
- Los resultados descartados se loguean con motivo, permitiendo auditar qué se rechazó y por qué.

### Added — Hilo de conversación en Aichat (2026-07-07)

- `AichatService` ahora mantiene un hilo de conversación: acepta `conversationId` opcional en el DTO y acumula mensajes anteriores antes de enviar al modelo.
- Se agregó `conversationId` a `CreateAichatDto` para que el cliente pueda persistir el contexto entre turnos.
- Tests de regresión añadidos para cubrir el flujo de hilo con y sin `conversationId`.

### Fixed — Nombre y descripción del modelo Ollama en Aichat (2026-07-07)

- `ollamaModel.ts` y `ollama-config.ts` corregidos para leer `name` y `description` correctamente desde la respuesta de la API de Ollama, evitando que aparecieran `undefined` en los logs y en el aviso del modelo activo.

### Fixed — Configuración dinámica del modelo Ollama (2026-07-07)

- Se centralizó la resolución del modelo en `src/shared/ollama-config.ts`: lee `OLLAMA_MODEL_NAME` y, como fallback, `OLLAMA_MODEL` desde el entorno.
- `AichatService`, `JarvisService` y `OllamaProvider` usan la misma utilidad, eliminando duplicación y garantizando que todos los flujos invoquen el mismo modelo activo.
- Las respuestas incluyen un aviso visible con el nombre del modelo, por ejemplo: `Modelo activo: llama3.2:3b (Ollama).`

### Fixed — Detalles del modelo en hardware nuevo (2026-07-07)

- `AichatService` actualizado para obtener y mostrar correctamente los detalles del modelo (parámetros, familia, tamaño) al cambiar de hardware.
- `ollamaModel.ts` corregido para mapear los campos de la respuesta de Ollama al schema interno sin perder metadatos.

### Added — Agregación de valor en Jarvis y evolución de conocimiento (2026-07-08)

- Se incorporó un motor de ejecución de planes para Jarvis que procesa tareas paso a paso, acumulando contexto y mejorando la calidad de las respuestas finales.
- Se añadió un flujo de deduplicación y resumen de resultados intermedios para reducir repeticiones y convertir múltiples hallazgos en una respuesta más útil y compacta.
- Se implementó la persistencia de snapshots de temas por conversación, permitiendo capturar aprendizajes clave, tags y conclusiones relevantes.
- Se habilitó la generación de narrativas de evolución de temas para reconstruir cómo cambió la comprensión o la opinión del usuario sobre un tema a lo largo del tiempo.
- Se añadió un filtro de valor de conocimiento para evitar guardar información efímera y priorizar contenidos con mayor potencial de reutilización.
- El resultado de cada ejecución ahora se entrega en un formato unificado con título, resumen, hechos, fuentes, confianza y metadatos de ejecución.
- Los resultados de ejecución pueden guardarse automáticamente en la biblioteca de conocimiento cuando superan el umbral de valor definido.

### Changed — Configuración dinámica del modelo Ollama para Jarvis y Aichat (2026-07-07)

- Se centralizó la resolución del modelo Ollama para que lea `OLLAMA_MODEL_NAME` y, si no existe, `OLLAMA_MODEL` desde el entorno.
- El chat de Aichat y el flujo de Jarvis ahora usan la misma configuración para invocar el modelo activo.
- Las respuestas del asistente incluyen un aviso visible con el nombre del modelo activo, por ejemplo: `Modelo activo: llama3.2:3b (Ollama).`
- Se añadió una utilidad compartida en `src/shared/ollama-config.ts` para evitar duplicación de lógica de configuración.

### Added — Sistema de Scraping Inteligente y Evolución de Business Sources (2026-06-27)

#### Mejoras en el esquema de Business Sources
- **Dominio Macro**: Se asignaron dominios (COMERCIOS, SALUD, EDUCACIÓN, TECNOLOGÍA) a las fuentes comerciales para facilitar el ruteo de agentes especializados en el futuro.
- **Confiabilidad y Estrategia**: Se introdujeron `sourceType`, `trustScore` y `scrapingStrategy` (`catalog`, `healthcare`, `education`, etc.) para ponderar resultados y guiar inteligentemente la extracción de datos.
- **Soporte Semántico y RAG**: Se reemplazó `keywords` por `tags` y se agregó `embeddingStatus` para integrar de forma nativa la vectorización futura con pgvector.
- **Enriquecimiento y Ubicación**: Nuevos campos `location` y `enrichment` para segmentar consultas por ciudad/provincia y conocer la disponibilidad de metadatos (email, teléfono, redes).

#### Sitemap Crawler
- Creado `SitemapCrawlerService` para reemplazar el scraping exploratorio aleatorio por un enfoque basado en sitemaps (`/sitemap.xml`).
- **Scraping Dirigido**: Filtra, penaliza URLs inútiles (términos, privacidad, tags) y bonifica automáticamente URLs clave según la `scrapingStrategy` (ej. prioriza `/producto/` para catálogos, o `/especialidad/` para clínicas).
- Mejora de rendimiento garantizada al reducir solicitudes inútiles y extraer páginas de alto valor para el RAG de Jarvis.

### Changed — Login sin credenciales (2026-06-26)

- `POST /auth/login` ya no requiere body ni `MASTER_PASSWORD`. Emite JWT directamente.
- Eliminado `LoginDto` y validaciones de contraseña en controller y service.

---

### Added — Sistema de autenticación JWT + Rate Limiting (2026-06-26)

#### Motivación
Para un asistente personal como JarBees que se expone a Internet, se necesitaba proteger los recursos de IA (Ollama, OpenRouter, scraping) contra bots externos y acceso no autorizado, manteniendo la simplicidad de un sistema de usuario único.

#### Implementación: Password única + JWT + Rate Limiting

**Arquitectura elegida:**
- **Contraseña maestra única** (`MASTER_PASSWORD` en .env) — sin gestión de usuarios, OAuth ni sesiones complejas
- **JWT simple** — endpoint POST /auth/login devuelve token de 30 días
- **Rate Limiting global** — 100 req/min por defecto, evita abuso de recursos

**Componentes creados:**

1. **AuthModule** (`src/auth/auth.module.ts`)
   - Configuración JWT con variables de entorno
   - Integración con Passport.js para estrategia JWT

2. **AuthService** (`src/auth/auth.service.ts`)
   - `login(password)` — valida contra `MASTER_PASSWORD`, emite JWT con payload `{ sub: 'jarbees-owner', role: 'owner' }`
   - `verifyPayload()` — usado por JwtStrategy para validar tokens

3. **AuthController** (`src/auth/auth.controller.ts`)
   - `POST /auth/login` — endpoint público que recibe `{ password }` y devuelve `{ access_token, expires_in }`
   - Validación con class-validator (mínimo 4 caracteres)
   - Documentado con Swagger

4. **JwtStrategy** (`src/auth/jwt.strategy.ts`)
   - Estrategia Passport que extrae token del header `Authorization: Bearer <token>`
   - Valida firma con `JWT_SECRET` y verifica expiración

5. **JwtAuthGuard** (`src/auth/jwt.guard.ts`)
   - Guard global que protege TODOS los endpoints por defecto
   - Soporta decorador `@Public()` para marcar endpoints sin autenticación
   - Usa Reflector para leer metadata de `@Public()`

6. **@Public() decorator** (`src/auth/public.decorator.ts`)
   - Decorador simple para marcar endpoints públicos
   - Ejemplo: `@Public()` en `/auth/login`, `/health`, etc.

**Integración en AppModule:**
- `AuthModule` importado
- `ThrottlerModule` configurado con 2 niveles:
  - `default`: 100 req/minuto
  - `strict`: 10 req/minuto (para endpoints sensibles, uso opcional con decorador)
- 2 Guards globales vía `APP_GUARD`:
  - `JwtAuthGuard` — protección JWT en todos los endpoints
  - `ThrottlerGuard` — rate limiting en todos los endpoints

**Variables de entorno agregadas:**
```env
MASTER_PASSWORD="tu-contraseña-segura-aqui-cambiar"
JWT_SECRET="tu-jwt-secret-aleatorio-cambiar-por-uno-seguro"
JWT_EXPIRES_IN="30d"
```

**Paquetes instalados:**
- `@nestjs/jwt@11.0.2`
- `@nestjs/throttler@latest`
- `passport-jwt@4.0.1`
- `@types/passport-jwt@4.0.1`
- `@nestjs/passport@11.0.1` (ya estaba)
- `passport@0.7.0` (ya estaba)

**Relación seguridad/esfuerzo:**
✅ Simple — sin OAuth, sin base de usuarios, sin sesiones  
✅ Seguro — JWT firmado + expiración + rate limit  
✅ Escalable — agregar usuarios/Google Login después es trivial (arquitectura preparada)  

**Pendiente:**
- Marcar otros endpoints públicos con `@Public()` según se necesite (ej: `/health`, webhooks, etc.)
- Considerar ThrottlerGuard con `@SkipThrottle()` o límites custom en endpoints específicos
- Documentar en README el flujo de autenticación para desarrolladores

---

### Added — ACADEMIC_REFERENCE: biblioteca de fuentes académicas canónicas (2026-06-26)

#### Filosofía de diseño
Knowledge on Demand — no scraping periódico masivo.
Solo se consulta cuando el usuario pregunta algo específico.
TTL largo (7-30 días) para contenido que no cambia: la definición de derivada no es una noticia.

#### Verificación de fuentes (2026-06-26)
Todas testeadas con `axios+cheerio`:

| Fuente | Palabras | Estado |
|---|---|---|
| Encyclopedia of Mathematics | 5845 | ✅ Excelente |
| arXiv AI (lista reciente) | 2159 | ✅ Excelente |
| HyperPhysics | 1864 | ✅ Excelente |
| Physics World | 1454 | ✅ |
| NASA Science | 1351 | ✅ |
| Nature News | 1280 | ✅ |
| Science News | 978 | ✅ |
| MDN Web Docs | 793 | ✅ |
| PostgreSQL Docs | 523 | ✅ |
| HuggingFace Papers | 400 | ✅ |
| MathWorld (URL directa) | 150 | ⚠️ útil con searchPattern |
| ChemLibreTexts | 74 | ❌ muy poco |
| ESA Science | 111 | ⚠️ poco contenido en raíz |
| PubChem | 31 | ❌ SPA React |
| NestJS Docs | 0 | ❌ SPA puro |

#### Nuevas categorías en SourceRegistry

| Categoría | Fuentes | TTL |
|---|---|---|
| `academic_math` | MathWorld (searchPattern), Encyclopedia of Math | 30 días |
| `academic_physics` | HyperPhysics, Physics World | 7 días |
| `academic_astronomy` | NASA Science, ESA Science | 7 días |
| `academic_science` | Nature News, Science News | 7 días |
| `academic_dev` | MDN Web Docs (searchPattern), PostgreSQL Docs | 14 días |
| `academic_ai` | HuggingFace Papers, arXiv AI, arXiv ML | 1 día |
| `ia` | HuggingFace Blog, MIT Tech Review, The Verge AI, VentureBeat AI, Xataka IA, Ars Technica AI | 6h |
| `desarrollo` | dev.to, GitHub Blog, Pragmatic Engineer, npm Blog, NestJS Blog | 12-24h |

#### Nuevos dominios en DomainRouterService

**`MATH`** (prioridad 92) — Matemática pura y aplicada
- Patterns: teoremas, álgebra, cálculo, geometría, probabilidad, estadística, integrales, matrices, tensores, series de Fourier, espacio de Hilbert
- Fuentes: MathWorld, Encyclopedia of Math, Wikipedia ES

**`PHYSICS`** (prioridad 91) — Física teórica y experimental
- Patterns: física cuántica/clásica/nuclear, relatividad, mecánica, termodinámica, electromagnetismo, quarks, bosón de Higgs, modelo estándar
- Fuentes: HyperPhysics, Physics World, Wikipedia ES

**`ASTRONOMY`** (prioridad 90, con negaciones anti-astrología) — Astrofísica y exploración espacial
- Patterns: NASA, ESA, misiones espaciales, telescopio James Webb/Hubble, exoplanetas, agujeros negros, big bang, cosmología
- Negaciones: horóscopo, signo zodiacal, carta astral (→ va a ASTROLOGY, no ASTRONOMY)
- Fuentes: NASA Science, ESA Science, Wikipedia ES

**`WEB_DOCS`** (prioridad 89) — Documentación técnica web
- Patterns: CSS grid/flexbox, JavaScript DOM/fetch/async, HTML semántico, Web APIs, PostgreSQL queries/joins/indexes, MDN
- Fuentes: MDN Web Docs, PostgreSQL Docs, Wikipedia ES

**`AI_PAPERS`** (prioridad 87) — Papers académicos de IA
- Patterns: arXiv, preprint, papers de IA/ML/LLM, transformers architecture, attention is all you need, HuggingFace papers
- Fuentes: arXiv AI, HuggingFace Papers, arXiv ML

#### Cambios en `domainToCategory()`:
```
MATH        → 'academic_math'
PHYSICS     → 'academic_physics'
ASTRONOMY   → 'academic_astronomy'
WEB_DOCS    → 'academic_dev'
AI_PAPERS   → 'academic_ai'
AI          → 'ia'
DEVELOPMENT → 'desarrollo'
```

#### Ejemplos de routing ahora:

| Query | Dominio | Fuentes consultadas |
|---|---|---|
| "qué es un espacio de Hilbert" | `MATH (0.89)` | MathWorld → Encyclopedia of Math |
| "cómo funciona el bosón de Higgs" | `PHYSICS (0.88)` | HyperPhysics → Physics World |
| "últimas misiones de la NASA" | `ASTRONOMY (0.91)` | NASA Science → ESA |
| "paper sobre transformers attention" | `AI_PAPERS (0.87)` | arXiv AI → HuggingFace Papers |
| "cómo usar CSS flexbox" | `WEB_DOCS (0.89)` | MDN Web Docs → PostgreSQL Docs |
| "para qué sirve el romero" | `PLANTS (0.85)` | ifernandez89.github.io → Wikipedia |

---

### Added — DomainRouterService: nuevos dominios + fuentes verificadas (2026-06-26)

#### URLs analizadas por el usuario, clasificadas y categorizadas:

| URL | Palabras | Veredicto | Acción |
|---|---|---|---|
| `es.wikipedia.org` | 1073 | ✅ Excelente | Priority subida a 10, categoría `referencia` |
| `mysteryplanet.com.ar/site` | 1758 | ✅ Excelente | Ya existía, confirmada |
| `mi.parana.gob.ar` | 1156 | ✅ Excelente | Selectores mejorados con `section` |
| `ifernandez89.github.io/PlantasMedicinales` | 192 | ✅ Funciona | Selector `body` agregado como fallback |
| `whenisthenextmcufilm.com` | 17 | ✅ Preciso (poco texto pero exacto) | Priority subida a 9, selectores `h1,p` |
| `carta-natal.es/carta.php` | 625 | ⚠️ Texto estático (carta necesita JS) | Agregada como `astrologia_ref` (referencia interpretativa) |
| `jsonplaceholder.typicode.com` | — | ❌ API fake de testing | No agregada |
| `skills.sh` | 87 | ❌ Solo arte ASCII | No agregada |
| `www.elonce.com` | 94 | ⚠️ Ya existe (funciona vía selectores) | Sin cambios |

#### Nuevos dominios en DomainRouterService:

**`REFERENCE`** — Definiciones, historia, enciclopedia
- Patterns: `qué es`, `definición de`, `historia de`, `biografía de`, `cuándo nació`, `dónde queda`
- Fuentes: `es.wikipedia.org`, `infobae.com`

**`PLANTS`** (prioridad 85) — Plantas medicinales y herboristería
- Patterns: `planta medicinal`, `hierba curativa`, `remedio natural`, `infusión de`, `propiedades medicinales`, nombres de plantas (aloe vera, manzanilla, romero, jengibre...)
- Fuentes: `ifernandez89.github.io/PlantasMedicinales`, `es.wikipedia.org`

**`DEVELOPMENT`** (prioridad 84) — Novedades de software y open source
- Patterns: `dev.to`, `GitHub release`, `nueva versión de npm/react/nestjs`, `changelog`, `open source proyecto`
- Fuentes: `dev.to`, `github.blog`, `arstechnica.com`

**`MOVIES_TV` (MCU override, prioridad 88)** — Películas Marvel específicamente
- Patterns: `marvel`, `mcu`, `spider-man`, `avengers`, `próxima película de Marvel`
- Fuentes: `whenisthenextmcufilm.com` (primera), `infobae.com`, `lanacion.com.ar`
- La URL especializada ahora es la primera fuente consultada para todo lo relacionado con Marvel

#### Nuevas categorías en SourceRegistry:

**`ia`** — Inteligencia Artificial (separada de `tecnologia` genérica)
- Fuentes: Hugging Face Blog, MIT Technology Review, The Verge AI, VentureBeat AI, Xataka IA, Ars Technica AI

**`desarrollo`** — Noticias de software y herramientas dev
- Fuentes: dev.to (con `searchPattern`), GitHub Blog, The Pragmatic Engineer, npm Blog, NestJS Official Blog

**`astrologia_ref`** — Referencia astro (carta-natal.es para interpretación, no cálculo)

#### Cambios en `domainToCategory()`:
- `AI` → `'ia'` (categoría propia, antes apuntaba a `'tecnologia'`)
- `DEVELOPMENT` → `'desarrollo'` (nueva categoría)
- `PLANTS` → `'referencia'` (comparte con Wikipedia)

---

### Added — DomainRouterService: fuentes dirigidas por dominio semántico (2026-06-26)

#### Problema que resolvía
El `IntentRouter` clasificaba correctamente el *tipo* de consulta (WEB, SPORTS, LOCAL) pero no el *dominio*. Resultado: se consultaban 30 fuentes genéricas y se obtenía una respuesta pobre.

Ejemplos reales del problema:
- "noticias sobre Jesica Cirio en Elonce" → `WEB` → scraping genérico → respuesta vacía
- "astrología para esta noche" → `WEB` → scraping genérico → 91s → respuesta inventada

#### Solución: `DomainRouterService`

Nuevo servicio en `src/jarvis/tools/intent/domain-router.service.ts` que opera **sin IA**, solo reglas determinísticas.

**Dominios reconocidos (16):**
`SPORTS` · `LOCAL_NEWS` · `NATIONAL_NEWS` · `POLITICS` · `AI` · `PROGRAMMING` · `SCIENCE` · `TECHNOLOGY` · `ASTROLOGY` · `MUSIC` · `MOVIES_TV` · `MYSTERY` · `ECONOMY` · `GOVERNMENT_LOCAL` · `REFERENCE` · `UNKNOWN`

**Para cada dominio devuelve:**
- `domain` — el dominio clasificado
- `confidence` — 0.0 a 1.0 basado en patrones que matchean
- `suggestedSources` — 2-4 URLs de SourceRegistry específicas para ese dominio
- `enrichedQuery` — query mejorada con contexto (ej: añade "Paraná Entre Ríos" si es LOCAL_NEWS)

**Flujo nuevo del intent WEB:**
```
WEB intent detectado
  ↓
DomainRouter.classify(query)
  → domain: LOCAL_NEWS (0.92)
  → sources: [elonce.com, apfdigital.com.ar, analisisdigital.com.ar]
  → enrichedQuery: "Jesica Cirio Paraná Entre Ríos"
  ↓
autoWebSearchWithSources(enrichedQuery, 'noticias', sources)
  → scrapea SOLO las 3 fuentes sugeridas en paralelo
  → si fallan → fallback a autoWebSearch genérico
```

**Antes:** 30 fuentes → resultados genéricos
**Ahora:** 3 fuentes relevantes → resultados precisos

**Ejemplos de clasificación:**
| Query | Dominio | Fuentes usadas |
|---|---|---|
| "noticias sobre Jesica Cirio en Elonce" | `LOCAL_NEWS` | elonce.com, apfdigital.com.ar |
| "Messi gol Copa América" | `SPORTS` | tycsports.com, ole.com.ar |
| "nuevo modelo de Qwen" | `AI` | techcrunch.com, huggingface.co |
| "quien gobierna Paraná" | `GOVERNMENT_LOCAL` | mi.parana.gob.ar, parana.gob.ar |
| "NestJS prisma migracion" | `PROGRAMMING` | techcrunch.com, arstechnica.com |

**Archivos creados/modificados:**
- `src/jarvis/tools/intent/domain-router.service.ts` — nuevo servicio (16 dominios, ~50 reglas)
- `src/jarvis/jarvis.module.ts` — registrar DomainRouterService como provider
- `src/jarvis/jarvis.service.ts`:
  - inyectar `DomainRouterService`
  - reemplazar bloque WEB: ahora usa `domainRouter.classify()` + `autoWebSearchWithSources()`
  - nuevo método `domainToCategory()` — mapea Domain a categoría de SourceRegistry
  - nuevo método `autoWebSearchWithSources()` — scrapea fuentes dirigidas antes del fallback genérico

---

### Added — Arquitectura de tres niveles: Memoria auto-extraída + Historial persistente (2026-06-26)

#### Motivación
JarBees tenía los tres niveles de memoria definidos en el schema de Prisma, pero solo el Nivel 3 (Knowledge/scraping) estaba activo. El Nivel 2 (Memoria) se leía pero nunca se escribía automáticamente. El Nivel 1 (Historial) existía pero se perdía al recargar el browser porque el frontend generaba un `sessionId` nuevo en cada sesión.

#### Cambios implementados

**1. `MemoryExtractorService` — Jarvis aprende automáticamente**

Nuevo servicio en `src/jarvis/memory/memory-extractor.service.ts` que analiza cada mensaje del usuario buscando hechos persistentes y los guarda en la tabla `Memory` **sin bloquear la respuesta**.

Patrones de extracción implementados (con categoría e importancia):
- **Identidad**: "me llamo X", "mi nombre es X" → `fact:9`
- **Profesión**: "trabajo como desarrollador/programador/etc." → `skill:8`
- **Tecnologías**: "uso/trabajo con NestJS/React/TypeScript/etc." → `skill:7`
- **Preferencias**: "prefiero respuestas cortas/largas/con ejemplos" → `preference:9`
- **Ubicación**: "vivo en X", "soy de X" → `fact:8`
- **Proyectos**: "estoy desarrollando X" → `context:7`
- **Intereses**: "me interesa la astronomía/música/IA" → `preference:6`
- **Comandos explícitos**: "recordá que X" → `fact:8`

Deduplicación por similitud Jaccard (>70% de palabras en común → no guardar).

Se ejecuta en background via `.catch()` seguro — errores no afectan la respuesta al usuario.

Integración: se llama desde `saveAndObserve()` en `JarvisService` después de cada turno.

**2. `GET /jarbees/session` — SessionId persistente**

Nuevo endpoint que el frontend llama UNA VEZ al arrancar:
```
GET /jarbees/session?sessionId=<uuid-guardado-en-localstorage>
```
- Si el sessionId es un UUID válido (36 chars) → lo devuelve tal cual
- Si no tiene → genera uno nuevo con `randomUUID()`

El frontend guarda el resultado en `localStorage` y lo pasa en cada llamada a `/jarbees/query`. El historial de conversación ahora sobrevive entre recargas del browser.

**3. `GET /jarbees/history` — Recuperar historial al recargar**

Nuevo endpoint para que el frontend reconstruya el chat al cargar:
```
GET /jarbees/history?sessionId=xxx&limit=50
```
Devuelve los últimos N mensajes en orden cronológico ascendente.

#### Arquitectura de tres niveles — ahora completa

```
Nivel 1 — HISTORIAL (ConversationMessage)
  Todo lo que se dijo, por sessionId persistente
  → endpoint: GET /jarbees/history

Nivel 2 — MEMORIA (Memory)
  Hechos importantes sobre el usuario
  → escritura: automática via MemoryExtractorService
  → lectura:   buildJarvisContext() → memoryRepo.search()

Nivel 3 — KNOWLEDGE (ScrapedContent + ScrapedPage)
  Contenido web cacheado con TTL por categoría
  → ContentCacheService + WebHelper + SourceRegistry
```

#### Integración con el frontend (Next.js) — solo 3 cambios

```typescript
// 1. Al iniciar la app (una vez)
const { sessionId } = await fetch('/jarbees/session?sessionId=' + localStorage.getItem('jarvis_session'))
localStorage.setItem('jarvis_session', sessionId)

// 2. Al enviar cada mensaje
await fetch('/jarbees/query', { method: 'POST', body: JSON.stringify({ message, sessionId }) })

// 3. Al recargar — recuperar historial previo
const { messages } = await fetch('/jarbees/history?sessionId=' + sessionId)
```

#### Archivos creados/modificados
- `src/jarvis/memory/memory-extractor.service.ts` — nuevo servicio de extracción
- `src/jarvis/jarvis.service.ts` — inyectar MemoryExtractorService, llamar desde saveAndObserve
- `src/jarvis/jarvis.module.ts` — registrar MemoryExtractorService como provider
- `src/jarvis/jarvis.controller.ts` — agregar GET /session y GET /history

---

### Added — AstrologyTool: cálculos astronómicos/astrológicos en tiempo real (2026-06-26)

#### Motivación
Las consultas sobre "clima astrológico" dependían de scraping de sitios web (15-30s, propenso a bloqueos 403 y alucinaciones al traducir). Con el documento **Archeoscope** como referencia, se reemplazó por cálculos locales instantáneos.

#### Cambios

- **`AstrologyTool`** (`src/jarvis/tools/astrology/astrology-tool.service.ts`):
  - `getTodaySkyData()` — fase lunar (emoji + % iluminación), posición lunar/solar en signo zodiacal, planetas visibles, próxima fase, interpretaciones básicas
  - `getPlanetaryPositions()` — 10 cuerpos celestes, detección de retrógrados, balance de elementos
  - Motor: `astronomy-engine` (VSOP87) — 0 API keys, 0 red, <100ms

- **IntentRouter** — nuevo intent `ASTROLOGY` con patrones de alta confianza
  - Detecta: `clima astro`, `horoscopo`, `carta astral`, `fase lunar`, `luna llena/nueva`, `donde esta la luna`, etc.
  - Excluye falsos positivos: "clima astrológico" + "temperatura/lluvia" → `TOOL` (meteorología)

- **JarvisService** — handler directo para `ASTROLOGY` que usa `respondWithAstrologyPrompt()` (system prompt especializado, sin scraping)

- **SourceRegistry** — fuentes de scraping astrológico (astro.com, lunarium, miastral) comentadas/deprecadas

- **Rendimiento**: 15-30s (scraping) → <100ms (cálculo local) — **231x más rápido**

#### Pendiente (algoritmos disponibles en Archeoscope)
- Aspectos planetarios (conjunción, trígono, cuadratura, etc.)
- Nodos Lunares (Norte/Sur)
- Calendario Maya (Tzolk'in, Haab, Cuenta Larga)

---

### Added — Pendientes persistidos para Jarvis: creación y listado desde conversación (2026-06-25)

#### Motivación
Se quería que Jarvis pudiera registrar pendientes de forma simple durante una conversación y luego recuperarlos más tarde para recordar al usuario su lista de tareas pendientes.

#### Implementación
- Nuevo servicio de tareas pendientes que detecta comandos del tipo “crea un pendiente” o “lista mis pendientes”.
- Integración con el flujo principal de Jarvis para que responda directamente a esos mensajes antes de seguir con el resto del pipeline.
- Persistencia en la base de datos mediante el repositorio de tareas existente, reutilizando el modelo Task/TaskStep ya presente.
- Prueba de regresión para cubrir creación y listado de pendientes.

#### Resultado
El asistente ya puede crear pendientes desde una conversación y consultarlos después, lo que habilita un flujo base para recordatorios y seguimiento de tareas.

### Added — Tareas con prioridad, categoría y proyecto en Jarvis (2026-06-25)

#### Motivación
Para que los pendientes resulten más útiles, era necesario que Jarvis no solo guardara un texto, sino que también clasificara la tarea por contexto útil: prioridad, categoría y proyecto.

#### Implementación
- Se ampliaron los campos del modelo Task con prioridad, categoría y proyecto.
- El servicio de tareas ahora infiere prioridad y categoría según palabras clave del mensaje.
- Se agregó detección básica de proyectos como JarBees cuando la conversación menciona temas técnicos del producto.
- Se actualizó la prueba de regresión para cubrir este comportamiento.

#### Resultado
Las tareas guardadas ahora aportan más contexto para listarlas, priorizarlas y agruparlas en el futuro.

### Added — Web Intelligence Layer: captura nativa de APIs y GraphQL en Playwright (2026-06-24)

#### Motivación
Se quería que Jarvis pudiera registrar pendientes de forma simple durante una conversación y luego recuperarlos más tarde para recordar al usuario su lista de tareas pendientes.

#### Implementación
- Nuevo servicio de tareas pendientes que detecta comandos del tipo “crea un pendiente” o “lista mis pendientes”.
- Integración con el flujo principal de Jarvis para que responda directamente a esos mensajes antes de seguir con el resto del pipeline.
- Persistencia en la base de datos mediante el repositorio de tareas existente, reutilizando el modelo Task/TaskStep ya presente.
- Prueba de regresión para cubrir creación y listado de pendientes.

#### Resultado
El asistente ya puede crear pendientes desde una conversación y consultarlos después, lo que habilita un flujo base para recordatorios y seguimiento de tareas.

### Added — Web Intelligence Layer: captura nativa de APIs y GraphQL en Playwright (2026-06-24)

#### Motivación
Se necesitaba inspeccionar tráfico de red real durante la navegación web sin depender de procesos MCP externos, especialmente para detectar endpoints JSON, GraphQL y payloads ocultos en páginas dinámicas.

#### Implementación
- Captura pasiva de respuestas con `page.on('response')` en los flujos de navegación y renderizado de Playwright.
- Detección de peticiones API/GraphQL con método, URL, estado HTTP, payload de request y respuesta.
- Integración de las APIs detectadas al contexto que se entrega al LLM en formato markdown legible.
- Script de verificación end-to-end en `scratch/test-api-interception.ts` para validar la captura real de llamadas JSON.
- Informe de seguimiento documentado en `walkthrough.md`.

#### Resultado
La capa de Web Intelligence ahora puede exponer endpoints relevantes extraídos de la navegación real, mejorando la comprensión contextual de sitios dinámicos y la calidad del análisis del agente.

### Added — AstrologyTool: cálculos astronómicos/astrológicos en tiempo real (2026-06-23)

#### Motivación
Anteriormente, las consultas sobre "clima astrológico", posiciones planetarias y fases lunares dependían de scraping de sitios web (astro.com, lunarium, miastral), lo cual causaba:
- **Latencia alta**: 15-30 segundos por consulta
- **Poco confiable**: bloqueos 403, contenido dinámico con JS, timeouts
- **Contenido en inglés**: requería traducción, propenso a alucinaciones del LLM
- **Sin garantía de datos**: el LLM a veces inventaba eventos planetarios

#### Solución: `AstrologyTool` con `astronomy-engine`
Implementación basada en el documento **Archeoscope** (guía de replicación de módulos astronómicos).

**Características:**
- **Instantáneo**: cálculos <100ms (vs 15-30s scraping)
- **Sin dependencias externas**: usa `astronomy-engine` (VSOP87) — 0 API keys, 0 red
- **Datos precisos**: posiciones planetarias con precisión astronómica real
- **Multilenguaje**: genera las respuestas directamente en español
- **Sin riesgo de bloqueo**: todo calculado localmente

**Funcionalidades implementadas:**
1. **`getTodaySkyData()`** — Clima astrológico del día:
   - Fase lunar con emoji (Luna Nueva 🌑, Llena 🌕, etc.) y % de iluminación
   - Posición lunar en signo zodiacal con grados exactos
   - Posición solar en signo zodiacal
   - Planetas visibles esta noche (elongación >20° del Sol)
   - Próxima fase lunar con fecha exacta
   - Interpretaciones astrológicas básicas por signo y fase

2. **`getPlanetaryPositions()`** — Carta astral completa:
   - Posiciones de 10 cuerpos celestes (Sol, Luna, Mercurio...Plutón)
   - Detección de movimiento retrógrado (℞)
   - Balance de elementos (Fuego, Tierra, Aire, Agua)

**Integración con IntentRouter:**
- Nuevo intent `ASTROLOGY` (clasificación de alta confianza)
- Patrones detectados:
  - Directos: `clima astro`, `horoscopo`, `carta astral`, `planetas`, `retrógrado`
  - Sutiles: `que signo`, `donde esta la luna`, `fase lunar`, `luna llena/nueva`
- Exclusión de falsos positivos: "clima astrológico" ya NO se clasifica como `TOOL(clima)` (meteorología)

**Archivos creados:**
- `src/jarvis/tools/astrology/astrology-tool.service.ts`

**Archivos modificados:**
- `src/jarvis/jarvis.module.ts` — registrar AstrologyTool como provider
- `src/jarvis/jarvis.service.ts` — agregar handler para intent ASTROLOGY
- `src/jarvis/tools/intent/intent-router.service.ts` — nuevo intent type + patrones de detección
- `src/jarvis/jarvis.service.ts` (`detectCategory`) — **eliminar categoría "astrologia"** del scraping web

**Categoría de scraping eliminada:**
- `astrologia` ya NO es una categoría de `SourceRegistry` ni de `detectCategory()`
- Las fuentes Astro.com, Lunarium, MiAstral quedan comentadas en `source-registry.ts` (pueden eliminarse)

**Ejemplo de uso:**
```
Usuario: "Que me dices del clima astrológico para esta noche?"
IntentRouter: ASTROLOGY (high)
AstrologyTool: calcula datos en <100ms
Respuesta:
🌌 Clima Astrológico para martes, 23 de junio de 2026

**Luna 🌖 (72% iluminada)**
- Fase: Gibosa Menguante
- Posición: ♒ Acuario 14.3°
- Próxima fase: Cuarto Menguante el 26 de junio

**Sol ☀️**
- Posición: ♋ Cáncer 1.9°

**Planetas visibles esta noche:**
- ♃ **Júpiter** en Géminis 18.2°
- ♄ **Saturno** en Piscis 4.7°

**Energías del día:**
- Luna en Acuario (Aire): innovación, conexión comunitaria
- Gibosa Menguante: compartir sabiduría y gratitud
```

**Próximos pasos sugeridos (opcional):**
- Implementar cálculo de aspectos planetarios (conjunción, trígono, etc.) — algoritmo disponible en Archeoscope
- Agregar nodos lunares (Norte/Sur) — ya documentado en Archeoscope
- Calendario Maya (Tzolk'in/Haab) si hay interés — algoritmo incluido en el documento

### Fixed — Prisma SQLite queries: removed unsupported `mode: 'insensitive'` option (2026-06-23)

#### Causa raíz
El proyecto usa SQLite (definido en `prisma/schema.prisma`), pero varias repositories estaban usando la opción `mode: 'insensitive'` en queries de Prisma. Esta opción solo está disponible para PostgreSQL, no para SQLite, causando el error:
```
Unknown argument `mode`. Did you mean `lte`? Available options are marked with ?.
```

#### Archivos corregidos
- `src/jarvis/repositories/memory.repository.ts` - método `search()`
- `src/jarvis/repositories/conversation.repository.ts` - método `searchAcrossSessions()`
- `src/jarvis/repositories/document.repository.ts` - métodos `searchDocuments()` y `searchChunks()`
- `src/aichat/repositories/preguntas.repository.ts` - método `findRelevant()`

#### Solución
Se eliminó el parámetro `mode: 'insensitive'` de todos los queries `contains`. Dado que el código ya convierte las queries a minúsculas con `.toLowerCase()`, la búsqueda sigue siendo insensible a mayúsculas/minúsculas sin necesidad de la opción `mode`.

### Fixed — Intent Router: falso positivo SPORTS con mensajes largos (historial pegado) (2026-06-23)

#### Causa raíz
Cuando el usuario pegaba el historial de conversación anterior junto con su nueva pregunta (ej: copiaba el chat completo en el campo de texto), el `IntentRouterService.fastClassify()` evaluaba el **mensaje completo** incluyendo el historial. Si ese historial contenía palabras deportivas ("Argentina vs Austria", "goles"), el router clasificaba la nueva pregunta como `SPORTS (high)` en lugar de `WEB/noticias`.

Ejemplo del log que evidenciaba el bug:
```
[intent:fast] SPORTS (high) — "resumen de noticias para Paraná el día de hoy\nJarBees\nHoy ma"
```

#### Correcciones aplicadas

**`src/jarvis/tools/intent/intent-router.service.ts`:**
- **Truncado anti-ruido**: en `fastClassify()`, si el mensaje tiene más de 300 chars, se clasifican solo las primeras 200 chars (`classifyText = message.length > 300 ? message.slice(0, 200) : message`). La intención real del usuario siempre está al inicio del mensaje.
- **LLM classify consistente**: `classify()` también pasa el texto truncado a `llmClassify()` para casos de baja confianza, evitando que el historial pegado contamine la clasificación LLM.
- **URLs preservadas**: la búsqueda de URLs sigue siendo sobre el mensaje completo, ya que una URL puede aparecer al final del texto.

**`src/jarvis/jarvis.service.ts`:**
- **Retry directo a El Once**: cuando `autoWebSearch()` falla para categoría `noticias` o `gobierno`, antes de devolver el error se intenta scrapear `elonce.com` directamente (sin DuckDuckGo ni caché). Si retorna >200 chars, se usa ese contenido. Registrado como `toolsUsed: ['direct_elonce']`.
- **Mensaje de error mejorado**: cuando todo falla, el mensaje ahora incluye la hora real del intento (`12:57 hs`), texto más empático ("Intenté conectarme a las fuentes locales pero no respondieron") y cierre más claro ("Volvé a preguntarme en un momento, las fuentes suelen recuperarse enseguida.").

### Fixed — Noticias locales: routing, scraping y system prompt (2026-06-23)

#### Causa raíz del problema
Cuando el usuario pedía "noticias de Paraná hoy", JarBees respondía con datos inventados
o derivaba al usuario a buscar solo. Se identificaron 4 bugs en cadena:

1. **`detectCategory` devolvía `'gobierno'` en vez de `'noticias'`** para cualquier consulta
   que mencionara "Paraná" — incluyendo "noticias de Paraná". Esto causaba que el scraper
   accediera a `mi.parana.gob.ar` (sitio municipal) en vez de `elonce.com`.
2. **`El Once` sin `searchPattern`** → solo se scrapeaba la homepage, nunca resultados de búsqueda.
3. **DuckDuckGo extraía URL de display text** (`.result__url` text) en vez del `href` real
   del enlace. Esto causaba URLs mal formadas y scraping fallido en todos los resultados DDG.
4. **`enrichQueryForCategory` enviaba la pregunta completa** ("resumen de noticias para Paraná
   el día de hoy") a DuckDuckGo en vez de términos limpios ("noticias Paraná Entre Ríos
   23 de junio de 2026"). DDG da resultados mucho peores con preguntas en lenguaje natural.

#### Correcciones aplicadas

**`src/jarvis/jarvis.service.ts`:**
- **`detectCategory`**: noticias/novedades/actualidad/resumen se evalúan ANTES que el bloque
  de Paraná → "noticias de Paraná" → `'noticias'` (no `'gobierno'`)
- **`detectCategory`**: Paraná ciudad sin keywords de noticias → también devuelve `'noticias'`
  (fuente El Once, no Mi Paraná municipalidad)
- **`enrichQueryForCategory`** reescrito: construye query limpia para DuckDuckGo
  (`noticias Paraná Entre Ríos 23 de junio de 2026`) en vez de pasar la pregunta completa
- **Graceful failure para noticias**: cuando `autoWebSearch` falla con categoría `'noticias'`
  o `'gobierno'`, en vez de llamar al LLM sin contexto (que inventaba datos), devuelve mensaje
  honesto con links directos a El Once, UNO Entre Ríos y Mi Paraná
- **`looksEvasive` ampliado**: detecta ahora "no hay información disponible", "te recomiendo
  consultar", "puedo ofrecerte algunos datos generales", "datos generales y eventos relevantes
  que podrían" — exactamente los patrones del modelo evasivo
- **System prompt — eliminado dato hardcodeado**: removido `"Intendenta actual (2026): Rosario
  Romero"`. Los funcionarios electivos duran 4 años y pueden cambiar por fallecimiento u otras
  causas — NUNCA deben estar en código fuente. Reemplazado por instrucción de buscar en web
- **System prompt — regla crítica noticias**: cuando no hay `browserContext`, el LLM recibe
  instrucción explícita de NO inventar noticias ni autoridades. Respuesta correcta: "No pude
  obtener las noticias en este momento. Intentá de nuevo."
- **System prompt — bloque de autoridades locales**: instrucción clara de no usar conocimiento
  interno sobre intendentes/gobernadores. SIEMPRE consultar fuente web actual

**`src/jarvis/tools/web/source-registry.ts`:**
- **El Once**: agregado `searchPattern: '/noticias?s={query}'`, priority 8→9, TTL 2h→1h,
  selectores mejorados (`.nota-cuerpo`, `.article-body`, `.contenido`, `article`, `main`)
- **UNO Entre Ríos** (nuevo): fuente local de noticias de Entre Ríos (priority 8, TTL 1h)
- **El Entre Ríos** (nuevo): fuente complementaria (priority 7, TTL 1h)

**`src/jarvis/tools/web/web-helper.ts`:**
- **Fix crítico DuckDuckGo**: `$(el).find('.result__url').text()` devuelve texto display,
  NO el href real. Corregido a `$(el).find('.result__title a').attr('href')` + decodificación
  del redirect interno de DDG (`?uddg=<encoded-url>`)
- **Múltiples resultados para noticias**: en vez de tomar solo el primer artículo útil, ahora
  acumula hasta 3 artículos scrapeados y los concatena → resúmenes más completos
- **`scrapeUrlWithSelectors` → público**: para que `ContentCacheService` pueda usarlo con
  los selectores CSS específicos de cada fuente (antes usaba `scrapeUrl` genérico)
- **`MAX_TEXT_CHARS`**: 3000 → 4000 chars por artículo
- **`MAX_URLS`**: 3 → 4 URLs a scrapear en paralelo

**`src/jarvis/tools/web/content-cache.service.ts`:**
- **Cache MISS**: usa `scrapeUrlWithSelectors` con la fuente y sus selectores antes de
  caer a `scrapeUrl` genérico → mejor extracción de contenido en El Once y similares


- **`Source`, `ScrapedPage`, `ScrapedContent`, `Query` (BD)**: arquitectura de 4 tablas para caché inteligente con TTL por categoría. Migración `20260623134338_web_scraping_cache_layer`
  - **`Source`**: catálogo de fuentes confiables con `name`, `urlBase`, `category`, `priority` (1-10), `ttlHours`, `active`, `successRate`, `avgResponseTimeMs`, configuración JSON de scraping
  - **`ScrapedPage`**: páginas cacheadas con `url` (unique), `contentHash` SHA-256 para detectar cambios, `scrapedAt`, `expiresAt` (TTL automático), `status` (`valid`/`expired`/`failed`), `cacheHits` (tracking de uso), `lastAccessedAt`
  - **`ScrapedContent`**: contenido crudo + procesado con `htmlRaw` (opcional), `textExtracted`, `jsonExtracted` (datos estructurados), `metadata` JSON
  - **`Query`**: analytics de consultas con `question`, `category`, `sourcesUsed`, `cacheHit` (boolean), `responseTimeMs` para optimización basada en uso real
- **`SourceRegistry`** (`src/jarvis/tools/web/source-registry.ts`): catálogo de **15 fuentes confiables** organizadas por categoría
  - **📰 Noticias (3)**: Infobae (priority 10), La Nación (9), El Once Paraná (8) — TTL 1-2h
  - **🌦️ Clima (2)**: Meteored Argentina (10), SMN (10) — TTL 1h
  - **⚽ Deportes (3)**: TyC Sports (10), ESPN Argentina (10), Olé (9) — TTL 30min
  - **🔬 Ciencia (3)**: Nature News (10), Science News (10), CONICET (9) — TTL 24h
  - **💻 Tecnología & IA (3)**: TechCrunch (10), Ars Technica (10), Hugging Face Blog (10) — TTL 6h
  - **📚 Referencia (2)**: Wikipedia ES (9), Plantas Medicinales/Ignacio (8) — TTL 7 días
  - **🏛️ Gobierno Local (1)**: Mi Paraná (9) — TTL 6h — datos municipales de la ciudad de Paraná, Entre Ríos
  - **Estrategia de crecimiento**: 45+ fuentes adicionales comentadas para agregar basándose en analytics reales (cache hits, latencia, éxito de scraping). Evitamos: fuentes que bloquean scraping, HTML cambiante, respuestas lentas, categorías sin demanda
  - Cada fuente tiene `priority` (1-10 mayor = más confiable), `ttlHours` optimizado por volatilidad del contenido, selectores CSS específicos cuando aplicable
- **`ContentCacheService`** (`src/jarvis/tools/web/content-cache.service.ts`): servicio de caché con tres estrategias
  - **Cache HIT** → servir desde BD en milisegundos (sin scraping)
  - **Cache MISS** → scrapear fuentes confiables → guardar con TTL automático
  - **Cache EXPIRED** → re-scrapear solo cuando TTL vence
  - **Analytics automático**: tracking de cache hits, fuentes usadas, latencia por consulta
  - **`fetchRelevantContent(query, category, limit=3)`**: busca en top 3 fuentes de la categoría, retorna `CacheResult[]` con `fromCache`, `scrapedAt`, `expiresAt`
  - **`cleanExpiredCache()`**: limpieza de páginas expiradas (para cron job)
  - **`getCacheStats()`**: métricas de caché (total, válidas, expiradas, top fuentes, top categorías, hit rate)

### Changed — SourceRegistry v2: fuentes verificadas con scraping real
- **Metodología**: todas las fuentes fueron testeadas con axios+cheerio antes de activarlas. Se descartaron o comentaron las que fallaron con 403, ENOTFOUND, SPA vacío, o 404
- **Resultado: 30 fuentes activas** distribuidas en 10 categorías, todas con scraping estático confirmado

| Categoría | Fuentes activas | Descartadas | Motivo descarte |
|-----------|----------------|-------------|-----------------|
| 📰 Noticias generales | Infobae, La Nación | — | — |
| 📰 Noticias locales ER | El Once, UNO Entre Ríos, APF Digital, Análisis Digital, El Entre Ríos | — | 5/5 funcionan |
| 🏛️ Gobierno | Mi Paraná, Parana.gob.ar | entrerios.gov.ar | SPA Angular (9 palabras) |
| ⚽ Deportes | TyC Sports, Olé, Promiedos, Infobae Deportes | ESPN Deportes | SPA React (0 palabras) |
| 🔬 Ciencia | CyTA-Leloir, CONICET, Science News | BBC, NatGeo AR, InfoCielo | 404 / ENOTFOUND / 403 |
| 💻 Tecnología | FayerWayer, Xataka, MuyComputer, TechCrunch, Ars Technica, Hugging Face | OpenAI News | 403 Forbidden |
| 🔮 Misterio | Mystery Planet | misteriosyverdades, sobrenatural.org, urbania | ENOTFOUND (caídos) |
| 🎵 Música | Rolling Stone AR, Los 40 AR, La Nación Espectáculos | Infobae/cultura/musica | 404 |
| 🔮 Astrología | MiAstral, Astro.com, Zodiacal, Lunarium | carta-natal.es | Requiere datos personales |
| 📚 Referencia | Wikipedia ES, Plantas Medicinales | — | — |
| 🎬 Entretenimiento | MCU Film | — | — |
| 🌦️ Clima | *(ninguna)* | meteored, SMN, weather.com, tutiempo | 404/403/timeout — usar Open-Meteo API ya integrada |

- **`getSummary()`**: nuevo método público que retorna el resumen de fuentes por categoría
- **Clima**: ningún sitio de clima es scrapeble estáticamente. El tool de Open-Meteo (ya integrado en AssistantToolsService) es la vía correcta para clima — sin scraping
- **ESPN**: SPA React puro, requeriría Playwright. Se puede activar si se habilita el modo headless
- **Orden de evaluación corregido**: `SPORTS` se evalúa ANTES que `TOOL` para evitar que preguntas como "¿cuándo y a qué hora es el próximo partido?" se clasifiquen incorrectamente como `TOOL(hora)` en lugar de `SPORTS`
- **Regex deportivo mejorado**: agregado `próximo partido|siguiente partido|cuando juega|cuando es el` para capturar consultas sobre partidos futuros
- **Contexto deportivo en hora**: `/(que hora|hora actual)/` ahora excluye contexto deportivo (`partido|juego|match`) → "hora del partido Argentina" → `SPORTS`, no `TOOL`
- **Confianza alta para partidos futuros**: "próximo partido de la selección" → `SPORTS` confianza `high` (antes podía ser `medium` o clasificarse mal)

### Fixed — System Prompt: año actual 2026 + contexto Paraná ciudad
- **Año actual explícito**: system prompt ahora incluye `Año actual: 2026 (NO 2024, NO 2025)` y fecha/hora dinámica calculada en tiempo real
- **Contexto local Paraná**: agregado bloque `📍 CONTEXTO LOCAL` con info de la ciudad (fundación 1813, 213 años en 2026, sitios relevantes, fuentes locales)
- **Anti-confusión río vs ciudad**: instrucción explícita "NO confundir con el río Paraná — el usuario se refiere a la CIUDAD"
- **Regla de fecha**: "Si mencionan 'hoy', 'actual', 'este año' → usar el año 2026, NO 2024"
- **Fuentes locales priorizadas**: Mi Paraná (mi.parana.gob.ar) y El Once (elonce.com) agregadas como fuentes confiables con categoría `gobierno` (priority 9, TTL 6h)
- **Detección de contexto local**: `detectCategory()` identifica preguntas sobre Paraná ciudad vs río Paraná usando keywords (`municipalidad`, `intendente`, `Parque Urquiza` vs `río`, `caudal`, `nivel`)

### Changed — WebHelper: estrategia de fuentes priorizadas por categoría
  1. **Si hay `category`** → busca en fuentes confiables priorizadas PRIMERO (ej: TyC Sports para deportes)
  2. **Scrapea en paralelo** las top 3 fuentes con selectores específicos si están configurados
  3. **Fallback a DuckDuckGo** si las fuentes no dan resultados
  4. **Scraping final** en paralelo de URLs de DuckDuckGo
- **`scrapeUrlWithSelectors(url, contextQuery, source?)`**: nuevo método privado que usa selectores específicos de la fuente para extracción más precisa
- **Timeout optimizado**: búsqueda 6s, scraping 7s individual → total máximo ~20-30s con paralelismo
- **Logs mejorados**: indica si resultado vino de fuente confiable o DuckDuckGo, tiempo total de extracción

### Changed — JarvisService: integración de caché inteligente + contexto local Paraná

### Added — Jarvis 2026: arquitectura de memoria, RAG y endpoints REST (2026-06-23)

#### Qué se incorporó
- Nuevo módulo de Jarvis con controlador, servicio, módulo y repositorios para memoria, historial, documentos y perfil de usuario.
- Modelos de Prisma añadidos para `UserProfile`, `Memory`, `ConversationMessage`, `Document`, `Chunk`, `Task` y `Feedback`.
- Endpoints REST para consulta principal, memoria persistente, ingestión de documentos, búsqueda RAG y perfil de usuario.
- Construcción de prompts con perfil adaptativo, historial de sesión, memoria y contexto documental antes de invocar al LLM.
- Configuración optimizada para Ollama con contexto mayor y respuestas más deterministas.

#### Impacto
- El asistente evoluciona de chatbot transaccional a asistente personal con memoria entre sesiones.
- Se habilita mejor contexto local para Argentina y apoyo a búsquedas de información actualizada y documental.

- **`autoWebSearch(query, category?)`**: nuevo flujo en 3 pasos
  1. **Si hay categoría** → `ContentCacheService.fetchRelevantContent()` primero
  2. **Fallback** → `WebHelper.search(query, category)` con fuentes priorizadas
  3. **Último recurso** → Google Playwright
- **`detectCategory(message)`**: detecta categoría del mensaje para optimizar caché (deportes, clima, noticias, tecnologia, ciencia, gobierno, etc.)
  - **Contexto local Paraná**: detecta preguntas sobre la ciudad de Paraná (municipalidad, intendente, Parque Urquiza, etc.) → usa fuentes `gobierno` (Mi Paraná + El Once)
  - Distingue entre "Paraná ciudad" vs "río Paraná" usando keywords (`río`, `caudal`, `nivel`)
- **System prompt mejorado**: 
  - **Año actual explícito**: `2026` (NO 2024, NO 2025) — corrige alucinaciones de fecha
  - **Fecha y hora dinámica**: se calcula en tiempo real con zona horaria del usuario
  - **Contexto local Paraná**: ciudad capital de Entre Ríos, fundada 25 junio 1813 (213 años en 2026), sitios relevantes, fuentes locales
  - **Instrucción anti-confusión**: "NO confundir con el río Paraná — el usuario se refiere a la CIUDAD"
- **Intent router integrado**: pasa categoría detectada a `autoWebSearch()` → consultas como "goles de Argentina hoy" usan caché de deportes primero (30min TTL) → respuesta en milisegundos si está en caché
- **Tracking de tools**: `toolsUsed` ahora incluye `cache:{category}` cuando se usa caché, ej: `['auto_search', 'cache:deportes']`
- **Respuestas más rápidas**: consultas frecuentes (clima, deportes, noticias, gobierno local) sirven desde caché sin scraping → latencia <100ms vs 10-30s
- **Fallback evasivo mejorado**: cuando el LLM responde "no tengo información", ahora detecta categoría y usa caché inteligente antes de scrapear

### Added — WebHelper: búsqueda web genérica para cualquier pregunta
- **`WebHelper` genérico** (`src/jarvis/tools/web/web-helper.ts`): helper estático sin dependencias de NestJS DI para búsqueda web + scraping universal. Reemplaza la lógica específica de deportes con capacidad de responder cualquier pregunta factual
  - **`WebHelper.search(query, scrape=true)`**: busca en DuckDuckGo → scrapea las primeras 3 URLs en paralelo → retorna texto relevante hasta 3000 chars con snippets + contenido extraído
  - **`WebHelper.quickSearch(query)`**: solo snippets de DuckDuckGo sin scraping (~1-2s)
  - **`WebHelper.scrapeUrl(url, contextQuery?)`**: scrapea una URL específica con extracción inteligente de contenido relevante basado en keywords del query
  - **Extracción inteligente de contenido**: prioriza selectores semánticos (`article`, `main`, `.article-body`, `.content`) → fallback a body completo → filtrado por relevancia usando keywords del query
  - **Scraping robusto**: User-Agent real, timeouts configurables (6s búsqueda, 7s scraping), manejo silencioso de errores 404/403/ENOTFOUND
  - **Sin dependencias externas pesadas**: usa solo `axios` + `cheerio` (ya instalados), sin Playwright, sin API keys
- **Integración en `JarvisService`**: `autoWebSearch()` y `searchDuckDuckGo()` ahora delegan a `WebHelper`. El flujo `respondWithLLM()` usa `WebHelper.search()` como fallback automático cuando detecta respuestas pobres del LLM (negativas tipo "no tengo acceso", "no sé", respuestas <50 chars)
- **Detección de respuestas insuficientes**: `isInsufficientAnswer()` en `jarvis.service.ts` analiza la respuesta del LLM buscando patrones de negativa o falta de datos concretos → si detecta una respuesta pobre, relanza automáticamente con contexto web sin preguntar al usuario
- **`SportsScraperHelper` deprecado**: la funcionalidad específica de deportes ahora vive en `WebHelper` como caso particular. `SportsScraperHelper` sigue existiendo por compatibilidad pero ya no se usa en el flujo principal

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

### Fixed - migraci�n Postgres y ConversationMessage (2026-07-08)

- Se resolvi� el error The table public.ConversationMessage does not exist al migrar de SQLite a Postgres.
- Se elimin� el directorio prisma/migrations/ y se cre� una nueva historia de migraciones limpia para Postgres con prisma migrate dev --name init_postgres.
- La tabla ConversationMessage ahora se crea correctamente en la base de datos PostgreSQL neon.tech.
- Se actualiz� el script de inicio r�pido para incluir la instalaci�n de ngrok con 
pm install -g ngrok.
- El servidor NestJS ya funciona correctamente con Postgres y expone ngrok activo en https://sustained-spree-carnation.ngrok-free.dev.
A d d e d   n e w   f e a t u r e :   F i x   f o r   d e v   s e r v e r   s t a r t u p 
 
 

---

## [0.5.0] - 2026-07-13

### Added — Execution Engine + Knowledge Evolution

#### Execution Engine (`src/jarvis/planner/execution-engine.service.ts`)
- Nuevo `ExecutionEngine` que conecta el `PlannerService` con las herramientas reales.
- Ejecuta planes multi-paso de forma secuencial, acumulando el output de cada paso como contexto para el siguiente.
- **8 tipos de pasos implementados:**
  - `search` — búsqueda web via `BrowserTool.search()`
  - `scrape` — scrapear URL específica via `BrowserTool.fetch()`
  - `read_memory` — consultar memorias relevantes via `MemoryRepository`
  - `read_docs` — consultar documentos RAG via `DocumentRepository`
  - `summarize` — resumir contexto acumulado con LLM (temperature=0.2)
  - `deduplicate` — eliminar oraciones repetidas por similitud Jaccard (umbral 70%)
  - `save` — guardar resultado en `DocumentIngestService` (Knowledge Library)
  - `respond` — generar respuesta final al usuario con LLM
- Si un paso falla, continúa con el siguiente siempre que haya contexto previo.
- `PlannerService` actualizado: ahora el LLM genera el `type` de cada paso junto con la descripción.
- Nuevo método `createAndExecute()` en `PlannerService`: crea el plan Y lo ejecuta, retornando `ExecutionResult` con `answer`, `stepsCompleted`, `stepsFailed`, `savedToKnowledge`.
- Inferencia automática del tipo de paso desde la descripción cuando el LLM no lo provee (`inferStepType()`).
- `ExecutionEngine` registrado en `JarvisModule`.

**Nuevo endpoint:**
- `POST /jarbees/planner/execute` — objetivo → plan → ejecución → respuesta final

#### Knowledge Evolution (`src/jarvis/memory/knowledge-evolution.service.ts`)
- Nuevo `KnowledgeEvolutionService`: el diferencial real de JarBees frente a cualquier chatbot.
- **Snapshot automático:** después de cada respuesta, `extractAndSave()` corre en background analizando el intercambio con el LLM (temperature=0.1, max 150 tokens) para extraer `{ topic, conclusion, tags }`.
- **Narración de evolución:** `getEvolution(topic, days)` recupera todos los snapshots de un tema, los ordena cronológicamente y genera una narración natural con el LLM (temperatura=0.4).
- Deduplicación por similitud Jaccard — evita guardar dos veces el mismo hecho.
- Conectado en `saveAndObserve()` del `JarvisService` — se activa en todas las respuestas automáticamente.
- `KnowledgeEvolutionService` registrado en `JarvisModule`.

**Nuevos endpoints:**
- `GET /jarbees/evolution?topic=Qwen&days=180` — línea de tiempo + narración LLM
- `GET /jarbees/evolution/topics` — todos los temas registrados con frecuencia

**Nuevo modelo de DB:**
- `TopicSnapshot` — `topic`, `conclusion`, `tags String[]`, `sessionId`, `createdAt`
- Índices en `topic`, `createdAt`, `sessionId`

**Ejemplo de uso:**
```
GET /jarbees/evolution?topic=Qwen&days=180

{
  "topic": "Qwen",
  "firstMentioned": "01 ene. 2026",
  "lastMentioned": "13 jul. 2026",
  "totalMentions": 12,
  "narrative": "Hace 6 meses preferías llama3.2:3b por velocidad.
                En marzo descubriste que qwen3:4b era superior para código.
                Ahora lo usás como experto técnico con temperature=0.2..."
}
```

### Fixed — Circular dependency en `AichatModule` (tokens undefined en runtime)
- `LLAMA_MODEL_TOKEN` y `QWEN_MODEL_TOKEN` se importaban desde `aichat.module.ts` en `aichat.service.ts`, creando un ciclo: módulo → service → módulo.
- En modo watch (`ts-node`), el ciclo hacía que los tokens llegaran como `undefined`, NestJS no resolvía el índice [4] y lanzaba `EADDRINUSE` al intentar reiniciar.
- Solución: tokens extraídos a `src/aichat/aichat.tokens.ts`, el módulo los re-exporta para compatibilidad.

### Fixed — Conflicto de nombre de clase entre modelos Ollama
- Ambas implementaciones de Ollama se llamaban `OllamaModelService`.
- NestJS usa el nombre de la clase como identificador interno en `useClass` — una pisaba a la otra.
- Solución: segunda clase renombrada a `OllamaQwenModelService`.

### Fixed — Tests de specs (`aichat.controller.spec.ts`, `assistant-tools.service.spec.ts`)
- `controller.update()` y `controller.remove()` eliminados del controller → tests marcados como skip.
- `AssistantToolsService` ahora requiere `BrowserToolService` en su constructor — test actualizado con mock.

### Changed — `JARBEES_ARCHITECTURE.md` reescrito completamente
- Documento anterior describía el estado de hace varios meses.
- Nuevo documento refleja el estado actual real: 17 modelos en DB, Execution Engine, Knowledge Evolution, Browser con Playwright completo, IntentRouter con 10 intents, 30+ fuentes locales, todos los endpoints, cobertura por módulo (~72%), limitaciones conocidas y próximos pasos.
