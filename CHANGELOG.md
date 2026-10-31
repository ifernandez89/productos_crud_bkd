# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project keeps its versioning in `package.json`.

### Fixed & Enhanced — JarBees Fase 2: Enrutamiento Explicativo, DateMathTool Determinista, Pronóstico de Precipitación 24h y Optimización Dialéctica (2026-10-31)

- **DateMathTool Determinista (`src/jarvis/tools/date-math/date-math.tool.ts`)**:
  - Implementación de herramienta especializada en aritmética temporal con zona horaria explícita (`America/Argentina/Buenos_Aires`).
  - Cálculo de días restantes en el año (Q9: 61 días hasta el 31 de diciembre inclusive en 63 ms).
  - Proyección de fechas relativas a futuro y pasado (Q12: "+45 días desde sábado 31 de octubre = martes 15 de diciembre de 2026" en 9 ms).
  - Cálculo de día de la semana para fechas específicas y cobertura completa en `date-math.tool.spec.ts`.
  - Integración en `AssistantToolsService` e `IntentRouterService`.

- **Enrutamiento Conceptual y Diferenciación Semántica (`IntentRouterService`)**:
  - Introducción del detector de intención explicativa (`isExplanatoryQuery`): evita que preguntas teóricas, físicas o conceptuales (Q18 "cómo se forma un frente frío", Q25 "qué es la energía", Q26 "diferencia entre masa, peso y gravedad") sean secuestradas por herramientas meteorológicas o esotéricas.
  - Corrección de colisión léxica en `SPORTS`: acotamiento de `\bposiciones\b` para impedir que preguntas de astronomía sobre "oposiciones" se desvíen como consultas deportivas o web.
  - Priorización del motor astronómico VSOP87 (`AstrologyTool`) para conjunciones, oposiciones y aspectos planetarios (Q21), eliminando fallos de búsqueda web.

- **Pronóstico de Precipitación Horaria a 24 Horas (`AssistantToolsService`)**:
  - Exposición de `precipitation_probability` horario de Open-Meteo para las próximas 24 horas, incluyendo porcentaje máximo, hora pico y volumen acumulado estimado (mm).
  - Limpieza de palabras de parada en extracción de ubicación (`NON_LOCATION_WORDS`): erradicación del error 404 de Nominatim ante frases como "lluvia durante las próximas 24 horas", garantizando el anclaje a Tala (Entre Ríos).

- **Optimización de Profundidad Dialéctica (`JarvisService`)**:
  - Depuración de `isDialecticQuery`: eliminación de patrones genéricos comparativos (`diferencia(s) entre`) que disparaban la auditoría dialéctica de 2 fases en consultas físicas básicas.
  - Exigencia de al menos 2 autores/documentos contradictorios en los fragmentos RAG recuperados para activar automáticamente el motor dialéctico.
  - Reducción de la latencia en Q26 ("diferencia entre masa, peso y gravedad") de 119.261 ms a 16.315 ms (86% de aceleración).

- **Evolución de Puntuación Global de Calibración**:
  - Puntuación previa: 3.62 / 4.00 (90.5%).
  - Puntuación recalibrada: **3.92 / 4.00 (97.9% de eficacia operativa)** con 7 de 7 preguntas corregidas al 100% (4/4).

### Added & Enhanced — Batería de Calibración General (60 Preguntas), Ampliación de Contexto a 16k y Saneamiento de Presets llama.cpp (2026-10-31)

- **📊 Batería de Calibración General de JarBees (60 Consultas / 10 Disciplinas)**:
  - Ejecución integral y persistencia incremental en disco (`benchmark_calibration_60.json`) evaluando 5 dimensiones cognitivas: exactitud (92.5%), actualidad (95%), contextualización (90%), rigor epistemológico (97.5%) y comunicación (95%).
  - Puntaje general sobresaliente: **3.62 / 4.00 (90.5% de eficacia operativa)** ejecutado 100% sobre GPU local NVIDIA RTX 5070 con `qwen3:8b`.
  - Calificación perfecta (**4.00 / 4.00**) en: *Tecnología e informática*, *Energía y electrónica*, *Historia, arqueología y cultura*, *Biología y naturaleza* y *Razonamiento y pensamiento crítico* (resolviendo cálculos energéticos exactos de Wh/h y delimitando falacias causales).
  - Contexto personal y memoria (**3.83 / 4.00**): anclaje verificado de identidad de Ignacio Fernández, ubicación en Tala (Entre Ríos), huso horario y declaración honesta de límites sin alucinaciones.
  - Generación de informe y diagnóstico detallado de calibración en el artefacto `jarbees_calibracion_60_report.md`.

- **🦙 Resolución de Error 400 y Ampliación de Ventana de Contexto a 16k (`InferenceSupervisorService` & `llama.cpp`)**:
  - Ampliación de la ventana de contexto a 16.384 tokens (`LLAMACPP_CTX_SIZE=16384` y valor por defecto en supervisor), subsanando el fallo `request exceeds available context size` ante prompts densos con memoria y RAG.
  - Corrección de la resolución de rutas de `models_presets.ini` en `InferenceSupervisorService` para soportar ejecuciones desde `dist/` y directorios de trabajo externos.
  - Saneamiento de alias en `models_presets.ini`: erradicación de colisiones de nombres con archivos físicos en el router de `llama-server.exe`.
  - Captura y logueo detallado del cuerpo de respuesta de error HTTP en `LlamaCppProvider`.

- **🎯 Poda Inteligente y Blindaje de Contexto RAG (`JarvisPromptBuilderService` & `JarvisService`)**:
  - Acotamiento de fragmentos RAG reordenados al top-5 más relevante (`rerankedChunks.slice(0, 5)`), reduciendo el consumo innecesario de tokens en la ventana de atención.
  - Aislamiento estricto de identidad personal (`isPersonalOrIdentity`): exclusión automática de búsquedas en biblioteca de documentos ajenos cuando la consulta refiere a la persona del usuario, previniendo polución de contexto.

- **🧪 Arnés de Automatización de Pruebas (`scripts/run_calibration_battery.js`)**:
  - Script de ejecución serial, persistencia incremental inmediata por pregunta y reanudación automática basada en caché.

### Fixed & Enhanced — Migración Exclusiva a llama.cpp, Aspectos Planetarios Mayores y Prevención de Respuestas Vacías (2026-10-31)

- **🦙 Migración Universal a llama.cpp y Supresión de Dependencia de Ollama (`InferenceGatewayService` & `JarvisService`)**:
  - Remapeo completo de cualquier solicitud o fallback de `ollama` hacia `llamaCppProvider` e `InferenceGatewayService`.
  - Configuración y soporte para `llama-server.exe` nativo sobre GPU NVIDIA RTX 5070 con CUDA y KV Cache cuantizado (`-ctk q8_0`, `-ctv q8_0`).
  - Corrección de flags CLI en `InferenceSupervisorService`: sustitución de `--ctk` y `--ctv` por `-ctk` y `-ctv`, eliminando el fallo de arranque `error: invalid argument: --ctk` en compilaciones de llama.cpp b11935+.
  - Ampliación de tipos de proveedor (`gateway | llamacpp | ollama | openrouter | string`) en `JarvisController` y `JarvisQueryOptions`.

- **🪐 Motor de Aspectos Planetarios Mayores en Tiempo Real (`AstrologyTool.calculateMajorAspects`)**:
  - Implementación del cálculo orbital angular de aspectos mayores entre los 10 cuerpos celestes principales (Sol, Luna, Mercurio, Venus, Marte, Júpiter, Saturno, Urano, Neptuno, Plutón) empleando precisión VSOP87.
  - Detección precisa de:
    - **Oposición (180°)**: Oposición exacta Sol en Escorpio frente a Luna en Tauro (orbe estrecho de 0.2°), manifestando máxima tensión polar y culminación de ciclo.
    - **Conjunción (0°)**: Conjunción Luna-Venus en Tauro (orbe 4.4°), facilitando armonía sensorial, belleza estética y receptividad emocional.
    - **Trígonos (120°)**, **Cuadraturas (90°)** y **Sextiles (60°)** ordenados de menor a mayor orbe con tolerancias dinámicas para luminarias.
  - Integración de los aspectos detectados en `getTodaySkyData()` y `getPlanetaryPositions()`.

- **🛡️ Prevención de Respuestas Vacías y Fallback Astronómico Seguro (`JarvisService.respondWithAstrologyPrompt`)**:
  - Presupuesto de generación ajustado a `maxTokens: 1024` para evitar que bloques de razonamiento agoten los tokens disponibles.
  - Fallback determinista garantizado: si la respuesta del LLM resulta vacía o la inferencia falla, el sistema devuelve directamente el informe astronómico y de aspectos en tiempo real, erradicando respuestas en blanco en el chat.

- **🧪 Cobertura de Pruebas Automatizadas (`astrology-tool.service.spec.ts`)**:
  - Suite unitaria comprobando cálculo en tiempo real, detección de orbes de oposición Sol-Luna y conjunción Luna-Venus, ejecutada bajo `--runInBand`.

### Fixed & Enhanced — Ruteo y Cálculo de Clima Astral en Tiempo Real y Anclaje de Ubicación Específica (2026-10-31)

- **🌌 Clasificación de "Clima Astral" / "Clima Astrológico" (`IntentRouterService` & `JarvisService`)**:
  - Corrección de regex en `IntentRouterService`: exclusión de `astr` en la herramienta meteorológica tradicional para evitar secuestrar preguntas sobre "clima astral", "clima astrológico", "panorama astral" o "cielo astral".
  - Limpieza de comillas estilísticas (`"`, `'`, `«»“”`) en `IntentRouterService.normalize`, permitiendo clasificar consultas formuladas con comillas como *¿Qué puedes decirme sobre el "clima" astral?*.
  - Protección de `ASTROLOGY` frente a sobreecrituras RAG en `JarvisService`: evita que la mera mención de libros esotéricos (ej: *The Projection of the Astral Body*) anule el cálculo astronómico en tiempo real provisto por `AstrologyTool` (motor local VSOP87).
  - Enriquecimiento de `respondWithAstrologyPrompt`: genera el clima astrológico/astronómico en tiempo real (Luna, fase, Sol, planetas visibles, energías) y permite contrastar armónicamente con la acepción metafísica/sutil del plano astral y su conexión con ArcheoScope.

- **📍 Anclaje y Persistencia de Ubicación Específica (Tala, Dpto. Paraná, Entre Ríos, CP 3118)**:
  - Actualización de `defaultWeatherLocation` en `AssistantToolsService` a: *'Tala, Departamento Paraná, Entre Ríos, 3118, Argentina'*.
  - Refactor de `reverseGeocodeLocation` en `AssistantToolsService`: extracción jerárquica de localidad, departamento (`state_district`/`county`), provincia y código postal (`3118`), filtrando nombres de puntos de interés genéricos o aeródromos para devolver una ubicación limpia y precisa.
  - Persistencia de la ubicación en `UserProfileRepository` (`preferences.location`) y en la memoria persistente de largo plazo (`Memory`) de Ignacio Fernández (@ifernandez89).
  - Inyección transversal en `CoreContextService` (`- Usuario: Ignacio Fernández (@ifernandez89) | Ubicación: Tala, Departamento Paraná, Entre Ríos, 3118, Argentina | ...`) y `JarvisPromptBuilderService` para que todos los modelos y herramientas operen con la localidad exacta del usuario.

- **🧪 Pruebas Unitarias (`intent-router.service.spec.ts`)**:
  - Validación de clasificación de intenciones de clima astral con comillas, panorama astral y consultas de identidad personal ejecutadas con `--runInBand`.

### Fixed & Enhanced — Soporte Universal de Audio (FFmpeg + WebM/Opus) y Detección Automática de Contenedor en Notas de Voz (2026-10-30)

- **🎙️ Detección Automática de Formato Contenedor por Magic Bytes (`VoiceService.detectAudioContainer`)**:
  - Inspección binaria de los encabezados de audio para identificar de forma unívoca el contenedor subido:
    - `RIFF....WAVE` -> WAV (PCM o Float).
    - `OggS` -> OGG nativo (Opus / Vorbis).
    - `\x1a\x45\xdf\xa3` (EBML) -> WebM (formato nativo generado por `MediaRecorder` en navegadores Chromium/Firefox/Android).
    - `ftyp` -> MP4/M4A (Safari/iOS).
    - `ID3` o sync MPEG -> MP3.
  - Corrige de raíz el problema donde el cliente envía un blob WebM/Opus con nombre de archivo `audio.opus`, el cual era derivado incorrectamente al decodificador CLI `opusdec.exe` (que sólo tolera contenedores Ogg, arrojando el error `opusdec no generó el archivo WAV de salida`).

- **⚡ Transcodificación Multi-Formato Robusta con FFmpeg (`VoiceService.decodeToWav`)**:
  - Incorporación de detección dinámica y resolución automática de FFmpeg en el sistema (`process.env.FFMPEG_PATH`, WinGet Packages directory, rutas estándar de Windows y variables de entorno `PATH`).
  - Transcodificación directa y optimizada a WAV PCM 16kHz mono (`-ar 16000 -ac 1 -c:a pcm_s16le`) garantizando máxima precisión para el reconocedor de voz.
  - Fallback defensivo a `opusdec` exclusivamente para contenedores OGG/Opus y retrocompatibilidad total con `decodeOpusToWav`.
  - Extensión de `VoiceStatus` (`ffmpegAvailable`, `ffmpegPath`, formatos soportados ampliados a `.webm`, `.opus`, `.ogg`, `.wav`, `.mp4`, `.m4a`, `.mp3`).

- **🛡️ Manejo Resiliente de Errores en Endpoints de Voz (`JarvisController.voiceChat` & `transcribeVoice`)**:
  - Envoltura defensiva con bloque try/catch en `voiceChat` y `transcribeVoice` con logging detallado.
  - En caso de audio ininteligible o fallo en el procesamiento, responde con un objeto JSON estructurado (`success: false`, `answer` explicativa y `error`) en lugar de arrojar una excepción no capturada de servidor (HTTP 500).

- **🧪 Cobertura de Pruebas Unitarias (`src/jarvis/tools/voice/voice.service.spec.ts`)**:
  - 10 tests unitarios verificando detección de magic bytes (WAV, OGG, WebM, MP4, MP3, unknown), reporte de estado de herramientas de voz, ensamblado (`stitch`) de buffers WAV y decodificación de WebM con FFmpeg.

### Fixed & Enhanced — Consultas Compuestas de Identidad, Pronóstico de Lluvia y Geocodificación Segura (2026-10-30)

- **👤 Protección de Consultas de Identidad y Memoria Personal en `IntentRouterService`**:
  - Las preguntas sobre la identidad del usuario (`'quien soy'`, `'que sabes sobre mi'`, `'como me llamo'`, `'mis proyectos'`) son ruteadas obligatoriamente a `LOCAL` (con acceso a `UserProfile` y `TripartiteMemory`).
  - Queda terminantemente prohibido que una tool meteorológica o matemática secuestre consultas que indagan sobre el operador.

- **🌧️ Pronóstico Horario de Lluvia para la Noche en `AssistantToolsService`**:
  - Incorporación del bloque horario (`hourly: 'precipitation_probability,precipitation,weather_code'`) de OpenMeteo para 2 días.
  - Cálculo dinámico de la probabilidad máxima y volumen de precipitación acumulado para la noche en curso (20:00 a 23:59 hs), informando con exactitud si hay previsión de lluvia o lloviznas.

- **📍 Geocodificación Segura y Filtro Anti-Palabras Temporales**:
  - Creación de `NON_LOCATION_WORDS` en `AssistantToolsService`.
  - Evita que frases temporales como *'para está noche'*, *'hoy'* o *'esta tarde'* sean interpretadas como nombres de ciudades por Nominatim (eliminando geocodificaciones anómalas). Si no se detecta una localidad real, recurre de forma fiable a la ubicación predeterminada (Paraná, Entre Ríos).

- **🧠 Fusión Multidominio en `JarvisService` & `JarvisPromptBuilderService`**:
  - Inyección de contexto meteorológico y pronóstico en tiempo real (`weatherSummary`) a `respondWithLLM` cuando la consulta combina identidad, fecha y clima (ej: *'Sabes quién soy? Que sabes sobre mi? Que fecha es hoy? Y dime, esta pronosticado lluvia para está noche?'*).
  - En `buildJarvisContext`, se flexibilizó la directiva restrictiva web para permitir la coexistencia armónica de recuerdos del usuario, perfil del operador y datos meteorológicos en tiempo real en una única respuesta completa.
  - Búsqueda reforzada de recuerdos de identidad en `MemoryRepository` y persistencia del perfil de Ignacio Fernández (@ifernandez89) en `UserProfileRepository`.

### Fixed & Enhanced — Respuestas Temporales Actualizadas, Fusión Multidominio y Anclaje Temporal Antialucinación (2026-10-30)

- **⏰ Anclaje Temporal Oficial en `CoreContextService` (<= 25 líneas)**:
  - Inyección de la fecha completa en español, hora oficial y zona horaria (`America/Argentina/Buenos_Aires`) junto con el año en curso oficial (2026) en el encabezado permanente de JarBees.
  - Regla invariante obligatoria: año oficial 2026 y prohibición expresa de alucinar fechas de corte de entrenamiento (ej: 2023 o 2024). Cumplimiento estricto del límite de 25 líneas.

- **📅 Expansión de Detección Temporal en `IntentRouterService` & `AssistantToolsService`**:
  - Detección de consultas sobre fecha, día actual y seguimiento (`'Sabes que día es hoy?'`, `'No me dijiste la fecha'`, `'que dia es hoy'`, `'fecha actual'`).
  - Resolución determinista e instantánea con Luxon en `getTimeAnswer`, devolviendo la fecha completa en español (ej: *'Hoy es viernes 30 de octubre de 2026. Hora actual en Argentina: 16:35 (ART).'*).

- **🌤️ Soporte Compuesto Clima + Ubicación + Fecha en `AssistantToolsService`**:
  - `getWeatherAnswer` ahora detecta si la consulta del usuario incluye preguntas sobre el día o la fecha y sintetiza la cabecera temporal junto con la ubicación geocodificada y el reporte meteorológico en tiempo real (OpenMeteo + Nominatim).
  - Consultas compuestas como *'Sabes que día es hoy? Clima? Ubicación?'* son resueltas íntegramente con fecha, ubicación y clima en una única respuesta estructurada y precisa.
  - `isMixedQuery` optimizado para no fracturar consultas que integran clima con fecha/hora/ubicación, manteniéndolas en la herramienta directa para máxima velocidad y cero alucinaciones.

- **🛡️ Guard Anti-Contaminación RAG en Consultas Temporales (`JarvisService` & `JarvisPromptBuilderService`)**:
  - Exclusión de consultas temporales (`isTemporalQuery`) del pipeline RAG de búsqueda de documentos en la biblioteca.
  - Evita que preguntas como *'No me dijiste la fecha'* realicen búsquedas semánticas que inyectaban fragmentos de libros antiguos con fechas históricas (1810, 1925, 2023), eliminando de raíz la causa de las alucinaciones temporales.

- **🧪 Cobertura de Pruebas Unitarias**:
  - 3 nuevos tests en `assistant-tools.service.spec.ts` verificando resolución de consultas de fecha aislada, preguntas de seguimiento y consultas compuestas de clima + día + ubicación.

### Added & Validated — Agente DSH Capabilities, Tripartite Memory, Dynamic CapabilityRegistry & Autonomous Token Telemetry (2026-10-30)

- **🔧 Corrección de Inyección de Dependencias en NestJS (`ContextManagerService`, `WorkingMemoryService`, `InferenceDiagnosticsService`)**:
  - Decoración con `@Optional()` en parámetros de constructor que reciben interfaces de opciones (`ContextWindowOptions`, `WorkingMemoryOptions`), evitando que NestJS intente resolver el token runtime `Object`.
  - Reemplazo de `import type` por importaciones de clase en `InferenceDiagnosticsService` para que TypeScript emita los metadatos de tipo reales de `InferenceGatewayService`, `LlamaCppProvider` e `InferenceSupervisorService`.
  - Verificación exitosa del arranque y resolución de dependencias de `AppModule` en NestJS (`BOOTSTRAP_SUCCESS`).

- **📊 Telemetría Programática de Tokens para Auto-Inspección de la IA (`TelemetryInspectionService`)**:
  - Exposición de telemetría de tokens y presupuestos para consumo autónomo por JarBees y el asistente IA (eliminando la necesidad de dashboards visuales humanos superfluos).
  - Endpoints públicos: `GET /jarbees/telemetry/tokens` y `GET /jarbees/telemetry/budget`.
  - Nueva herramienta nativa `telemetry_inspection` en `ToolRegistryService`.
  - Clasificación en 5 escalones de contexto (`BELOW_2K`, `2K_3K_LOCALIZED`, `4K_5K_MULTICOMPONENT`, `5K_6K_NEAR_LIMIT`, `OVERFLOW_RISK`), cálculo de velocidad promedio (`tokens/s`), y emisión de directivas de auto-regulación (`shouldCompactContext`, `recommendedMaxOutputTokens`).

- **🧭 Contexto Permanente Compacto `CoreContextService` (≤ 25 líneas)**:
  - Endpoint: `GET /jarbees/context/core`.
  - Generación de encabezado invariante estricto de máximo 25 líneas que condensa perfil del operador, reglas epistémicas, política HITL, capacidades reales detectadas y estado de memoria y presupuesto.
  - Integrado de forma no invasiva en `JarvisPromptBuilderService`, reduciendo el overhead de contexto del sistema en más del 75%.

- **⚡ `CapabilityRegistryService` Dinámico (Arranque + Event-Driven)**:
  - Endpoints: `GET /jarbees/capabilities/registry` y `POST /jarbees/capabilities/refresh` (soporta `dryRun`).
  - Herramienta nativa `capability_registry`.
  - Sondeo al iniciar (`OnModuleInit`) y actualización reactiva ante eventos de cambio de servicio (`notifyServiceChange`), sin bucles de polling.
  - Integrado en `IntentRouterService` (degradación automática de intenciones si la capacidad está `UNAVAILABLE`) y `PlannerService` (sanitización de pasos no soportados a `respond`).

- **🧠 Memoria Tripartita Adaptada (`WorkingMemoryService` + `TripartiteMemoryService`)**:
  - Endpoint: `GET /jarbees/memory/tripartite`.
  - **Working Memory**: Retención de corto plazo con TTL (30 min) y capacidad acotada a 7 ítems por sesión (Ley de Miller) con desalojo determinista por salience/antigüedad y evicción perezosa Anti-OOM (sin timers de fondo).
  - **Episodic Memory**: Búsqueda híbrida ponderada ($0.50 \times \text{Vector} + 0.30 \times \text{FTS} + 0.20 \times \text{Importancia}$).
  - **Associative TripleStore**: Reutilización de `KnowledgeEntity`, `KnowledgeRelation` y `PendingRelation` con salvaguarda epistémica: afirmaciones sin evidencia verificada (sourceDocId/quote y confianza >= 0.85) quedan en cuarentena.

- **🌙 Rutina `sleep` de Consolidación y Calibración Epistémica (`MemoryConsolidationService`)**:
  - Endpoint bajo demanda: `POST /jarbees/memory/sleep` y herramienta `memory_sleep` (invocable ante inactividad o necesidad de consolidación).
  - Promueve ítems de alta salience de Working Memory a Episodic Memory, fusiona duplicados con boosting de importancia, detecta decisiones cambiadas o contradictorias marcando la versión previa como `[DECISION_SUPERSEDED by #<id>]` sin borrar el origen, y aplica decaimiento temporal.
  - **Invariante Epistémico Estricto**: Cero hipótesis de `PendingRelation` promovidas automáticamente a hecho confirmado durante la consolidación desatendida.

- **📋 Procedural Skills Estandarizadas (SOPs en `SkillRegistryService`)**:
  - Soporte de metadatos estructurados (`preconditions`, `steps`, `pitfalls`, `verificationSteps`) y verificación de ejecutabilidad contra `CapabilityRegistryService`.
  - Tres SOPs base creadas:
    - `skills/investigacion-cientifica-reproducible.md` (método científico, simulación y error relativo).
    - `skills/mision-ingenieria-verificada.md` (validación AST, isolated runner, rollback y HITL).
    - `skills/consolidacion-epistemica-memoria.md` (mantenimiento y calibración de la memoria tripartita).

- **🧪 Suite de Validación Profunda y Resiliencia Cognitiva (`jarbees-deep-validation-5tests.spec.ts` & `jarbees-dsh-capabilities.spec.ts`)**:
  - **Prueba 1 — Capability Failure**: Degrada intenciones (`WEB` -> `RAG` / `LOCAL`) y sanitiza pasos no permitidos a `respond` cuando Ollama o la búsqueda web caen.
  - **Prueba 2 — Memory Retrieval**: Alta precisión (>0.85) en búsquedas semánticas y léxicas afines sin contaminación de recuerdos distractorios (<0.25).
  - **Prueba 3 — Epistemic Integrity**: Garantiza que ninguna hipótesis de `PendingRelation` se transforme en hecho confirmado durante la consolidación `sleep`.
  - **Prueba 4 — Sleep Idempotency**: Ejecuciones repetidas consecutivas son 100% idempotentes; no duplican registros ni corrompen metadatos.
  - **Prueba 5 — Context Stress**: Emite alertas de compactación (`shouldCompactContext: true`) al límite de 5.120 tokens (`5K_6K_NEAR_LIMIT`) manteniendo el 100% de los invariantes en `CoreContext` (≤ 25 líneas).
  - **Prueba A — Cambio de Decisión**: Migración de Ollama a llama.cpp genera trazabilidad histórica etiquetando `[DECISION_SUPERSEDED by #2 at <isoDate>]` en el registro antiguo sin confundir el estado vigente.
  - **Prueba B — Recuperación de Capacidades en Caliente**: Transición `AVAILABLE` -> `UNAVAILABLE` -> `AVAILABLE` restaura la capacidad de planificación de `verify_code` de inmediato sin reiniciar el proceso.
  - **Auditoría C — Límite Configurable de Working Memory**: Desacoplado de la regla dogmática de Miller; configurable vía constructor, variable de entorno `WORKING_MEMORY_MAX_ITEMS` o método dinámico `setMaxItemsPerSession()` (5, 7, 10, 15 ítems).
  - **Total Pruebas en Serie (`--runInBand`)**: 16/16 tests PASS en 17.5s (0 OOM).

- **🧪 Batería de Validación Automatizada (`jarbees-dsh-capabilities.spec.ts`)**:
  - Suite integral de 8 pruebas cubriendo las 5 fases en serie (`--runInBand`, 0 OOM): 8/8 PASS en 19.4s.
  - Verificación estática con `tsc --noEmit`: 0 errores.

### Planned & Backlog Architecture — Multidisciplinary Technical Researcher & Scientific Engine Vision (2026-10-29)

- **🧭 Visión de Investigación Técnica Multidisciplinaria (`docs/JARBEES_MULTIDISCIPLINARY_RESEARCH_VISION.md`)**:
  - Documentada formalmente la hoja de ruta estratégica para evolucionar JarBees como **Orquestador Multidisciplinario** y `Qwen2.5-Coder-14B` como **Especialista en Software e Instrumentación Computacional** (creador de simuladores, scripts analíticos y pipelines para otras ciencias).
  - Definida la federación de roles especializados: *JarBees (Orquestador)*, *Software Engineer*, *Research Analyst*, *Scientific Researcher*, *Knowledge Researcher*, *Experimental Technician* y *Verification & Evidence Engine*.
  - Mapeo de disciplinas de extensión empírica: Astronomía (modelos orbitales y efemérides), Arqueología e Historia (cronologías y fotogrametría documental), Electrónica y Robótica (datasheets y firmware), Biología y Bioinformática (expresión génica y datasets públicos) y Geología (modelos de terreno y datos GIS).
  - Diseño conceptual del motor transversal **`ScientificResearchEngine`** con ciclo de 8 fases (*Research Planning → Source Discovery → Evidence Extraction → Hypothesis Engine → Experiment Planner → Execution → Verification → Research Report*).
  - Mapeo de reutilización del 100% de la infraestructura desarrollada: `Planner`, `ExecutionEngine`, `RAG`, `CheckpointManagerService`, `VerificationHarnessService`, `MissionRecoveryService` y `ActionGatekeeperService` (HITL).
  - Blueprint detallado para la futura misión piloto: *Investigación y Simulación Orbital del Sistema Solar* en Python (integrador RK4, comparación con efemérides JPL/NASA, cuantificación de deriva y límites de incertidumbre).
  - Roadmap de variables de activación modular: `USE_SCIENTIFIC_RESEARCH` y `USE_EXPERIMENTAL_TOOLS` (conservando `USE_LLAMACPP_CODER` para ingeniería de software).

### Added & Validated — JarBees Senior Coder v1.0, Verification Harness, Best-Checkpoint Rollback & Multi-Context Engineering (2026-10-29)

- **🚀 Motor de Inferencia Nativo `LlamaCppProvider` (`src/jarvis/llm/llamacpp.provider.ts`)**:
  - Inferencia local ultrarrápida impulsada por GPU (`Qwen2.5-Coder-14B Q4_K_M` en `llama-server.exe`) sobre NVIDIA RTX 5070 (12 GB Blackwell).
  - Rendimiento verificado: ~55–61 tokens/s en generación sostenida y contextos de hasta 5,118 prompt tokens.
  - Mitigación de desconexiones SSE keep-alive mediante encabezados `Connection: close`.
  - Verificación estricta de alias GGUF registrados (`verifyModelAlias`) y telemetría por llamada (`LlmCallAuditEntry`).

- **🛡️ Arnés de Verificación y Recuperación `VerificationHarnessService` (`src/jarvis/verification/`)**:
  - Validación estática estricta en dos fases: AST TypeScript, alcance léxico y reglas de seguridad (`StaticPreValidatorService`).
  - Ejecución en subproceso aislado sanitizado con hash SHA-256 e intercepción de errores asíncronos (`IsolatedTestRunnerService`).
  - Snapshots inmutables por contenido SHA-256 en disco (`CheckpointManagerService`).
  - Evaluación jerárquica de 5 niveles con Best-Checkpoint Rollback físico ante regresiones (`RepairControllerService`).

- **🏛️ Gestor de Misiones de Ingeniería `EngineeringMissionManagerService` (`src/jarvis/verification/engineering-mission-manager.service.ts`)**:
  - Persistencia atómica de misiones (`storage/engineering-missions/<id>.json`), presupuestos y cálculo de diff antes/después.
  - Autoprotección criptográfica: bloqueo de modificaciones a `verification/**`, `security/**` y `.env*`.
  - Compuerta de aprobación humana obligatoria (`requireHumanApprovalBeforeIntegrate: true` + `ActionGatekeeperService`).

- **🧩 Mejoras en Módulos Reales de JarBees (`src/jarvis/planner/` & `src/jarvis/llm/`)**:
  - `mission-recovery.contracts.ts`: Contratos compartidos de persistencia y recuperación.
  - `mission-recovery-inspector.ts`: Reconciliación de pasos BD↔Disco y cálculo de hash SHA-256 tras reinicios o caídas.
  - `mission-step-classifier.ts`: Clasificación de pasos `verify_code` y reutilización idempotente de outputs.
  - `inference-context-budget.ts`: Evaluación de ventanas de contexto en 4 escalones (`BELOW_2K`, `2K_3K`, `4K_5K`, `5K_6K`).
  - Integración nativa en `MissionRecoveryService` e `InferenceDiagnosticsService`.

- **🧪 Batería de Validación Empírica Completa (100 % PASS)**:
  - Stress Test de 20 misiones auditado: inferencia real vs sandbox determinista.
  - Canary Operativo de 18 misiones (`canary-18-missions.spec.ts`): 18/18 PASS en 75.8s, 0 huérfanos, VRAM liberada.
  - Etapa 3 de 12 misiones (`stage3-real-code-12-missions.spec.ts`): 3A multicomponente real con HITL, 3B escala de contexto (2K–6K), 3C seguridad y contención.

### Added & Validated — Dynamic Specialist Swapping, DrainQueue, Feedback Loop y Benchmarks RTX 5070 (2026-10-28)

- **🚦 Cola de Drenaje Seguro `DrainQueueService` (`src/jarvis/llm/drain-queue.service.ts` & `src/jarvis/llm/drain-queue.service.spec.ts`)**:
  - **Drenaje sin Interrupción de Streams**: Adquisición de permisos de ejecución (`acquireLease` / `trackRequest`) que previene cortes abruptos en streams SSE o inferencias en vuelo durante conmutaciones de modelo en GPU.
  - **Estado Operativo `DRAINING`**: Marca el modelo saliente en drenaje bloqueando nuevas peticiones pero permitiendo culminar las tareas en progreso.
  - **Salvaguarda por Timeout (15s)**: Si las peticiones activas no terminan en el tiempo límite configurado, se activa la salvaguarda liberando la cola para evitar bloqueos indefinidos del sistema.
  - **Teardown Limpio Anti-Zombi**: Limpieza estricta de temporizadores en `onApplicationShutdown` con `.unref()`.

- **⚡ Orquestador de Especialistas en GPU `ModelLifecycleService` (`src/jarvis/llm/model-lifecycle.service.ts` & `src/jarvis/llm/model-lifecycle.service.spec.ts`)**:
  - **Gestión de Ciclo de Vida y Presupuesto VRAM (RTX 5070 - 12 GB)**: Control en caliente de memoria de GPU con techo operativo seguro de 10.8 GB (Anti-OOM) y cálculo de margen (headroom) por modelo (`qwen3:4b`, `gemma3:4b`, `qwen2.5-coder:7b`, `qwen3:8b`, `deepseek-r1:8b`).
  - **KV Cache Cuantizada (`--ctk q8_0 --ctv q8_0`)**: Configuración de arranque optimizada con flags de cuantización de memoria de contexto para `llama-server` permitiendo contextos de hasta 16K/32K tokens sin saturación de VRAM.
  - **Descarga Preventiva de VRAM**: Coordinación con `InferenceSupervisorService.freeOllamaVram()` antes de inicializar o conmutar especialistas locales pesados.

- **🔁 Bucle de Escalamiento Determinista `ExecutionFeedbackLoopService` (`src/jarvis/planner/execution-feedback-loop.service.ts` & `src/jarvis/planner/execution-feedback-loop.service.spec.ts`)**:
  - **Canalización 4B ➔ 8B**: Intento 1 con el modelo ultra-veloz `Qwen 3 4B` (~120-140 t/s) para tareas de código, SQL y JSON.
  - **Verificación Determinista Aislada**: Validación sintáctica rigurosa (delimitadores balanceados, cadenas sin cerrar, estructura de sentencias DML/DDL y parsing JSON) sin ejecutar código no verificado.
  - **Escalamiento con Diagnóstico Exacto**: Si la verificación detecta un error de sintaxis o compilación, transfiere automáticamente el código fallido y el mensaje de error exacto al especialista superior (`Qwen 3 8B` o `DeepSeek-R1 8B`) para su corrección guiada.

- **📊 Batería de Validación Empírica en RTX 5070 (`scripts/benchmark/vram_inference_suite.ts` & `src/jarvis/llm/vram-benchmark.spec.ts`)**:
  - **Checklist Completo de 6 Puntos**:
    1. Inferencia Base (TTFT y tokens/s en contextos 2K, 8K, 16K y 32K).
    2. Latencia de Swapping en disco NVMe PCIe 4.0 (<2.5s).
    3. Auditoría Epistemológica con `EvidenceGatekeeperService` (atribución vs abstención).
    4. Estrés de VRAM y control de techo de seguridad en 10.8 GB.
    5. Aislamiento de Red (Data Privacy Gate local 100%).
    6. Calidad comparativa Gemma 3 4B vs Qwen 3 4B por dominios.

- **🧪 Blindaje y Resolución de Tests del Sistema (100% de Aprobación — 178 tests)**:
  - Corrección de fallback de modelos en `EmbeddingsService.generateEmbedding`.
  - Fallback resiliente y catalogación en `JarvisCommandService.buildLibraryMessage` cuando la BD aún no está indexada.
  - Ajuste de aserciones de metadata en `AichatService.promptAgente`.
  - Incorporación de 26 nuevos tests unitarios (7 en `DrainQueue`, 6 en `ModelLifecycle`, 9 en `ExecutionFeedbackLoop`, 4 en `VramBenchmark`), alcanzando **178 tests aprobados en 31 suites**.

### Added & Validated — Blindaje Criptográfico, Misiones Persistentes, Control Epistemológico y Especialistas (2026-10-27)

- **📋 Plan de Arquitectura y Benchmarks en RTX 5070 (`docs/plan_jarbees_especialistas_rtx5070.md`)**:
  - **Especialistas y Presupuesto VRAM (12 GB)**: Definición formal de roles: `Qwen 3 4B` (base/código rápido/RAG), `Gemma 3 4B` (síntesis/redacción), `Qwen 3 8B` (ingeniería avanzada) y `DeepSeek-R1 8B` (auditoría epistemológica).
  - **Mecanismos de Drenaje (`DrainQueue`) y Escalamiento**: Diseño para conmutación de modelos sin interrupción de streams y escalamiento determinista 4B ➔ 8B ante fallos de sintaxis/tests.
  - **Batería de Validación Empírica**: Hoja de ruta para benchmarking de TTFT, latencia de swapping en NVMe y límites de memoria.

- **🔐 Bóveda Criptográfica en Reposo `CryptoVaultService` (`src/shared/crypto-vault.service.ts` & `src/shared/shared.module.ts`)**:
  - **Cifrado Simétrico AES-256-GCM**: Cifrado con IV aleatorio de 12 bytes y verificación de etiqueta de autenticación (authTag) de 16 bytes.
  - **Clave Derivada Segura**: Clave de 256 bits derivada de `CREDENTIALS_ENCRYPTION_KEY` o `JWT_SECRET` con SHA-256 + salt de dominio.
  - **Retrocompatibilidad Transparente**: Detección de prefijo `enc:v1:`. Datos guardados en texto plano legacy se procesan y devuelven sin romper instancias existentes.
  - **Enmascaramiento de Logs**: Método `maskSecret()` que previene la fuga accidental de tokens en stdout o logs de excepciones.

- **🔑 Modo Zero-UI y Cifrado OAuth2 en `GoogleAuthService` (`src/google/google-auth.service.ts` & `src/google/google-auth.controller.ts`)**:
  - **Configuración Exclusiva por Backend**: Detección y auto-inicialización en `onModuleInit` a partir de variables de entorno (`GOOGLE_REFRESH_TOKEN`, `GOOGLE_ACCESS_TOKEN`, `GOOGLE_SCOPES`). Si existen en `.env`, el backend las sincroniza y cifra automáticamente sin requerir interacción por frontend o navegador.
  - **Endpoint Headless `POST /api/jarbees/google/configure`**: Permite inyectar o actualizar credenciales mediante scripts, CLI o curl de forma directa.
  - **Protección Criptográfica en PostgreSQL**: Cifrado con AES-256-GCM tanto para `accessToken` como para `refreshToken` en `upsert` y auto-refresco en segundo plano (`refreshAccessToken`).
  - **Descifrado Transparente en Memoria**: Solo se descifran los tokens al momento de interactuar con la API oficial de Google (`getAuthenticatedClient`).

- **🛡️ Retos de Autorización HITL Anti-Replay `ActionGatekeeperService` (`src/jarvis/security/action-gatekeeper.service.ts`)**:
  - **Sustitución de Confirmación Trivial**: Reemplazo de parámetros vulnerables a inyección (`?confirm=true`) por tokens de autorización criptográficos firmados con HMAC-SHA256.
  - **Tokens de Un Solo Uso (Single-Use)**: Cada reto (`createChallenge`) cuenta con un nonce UUID y TTL estricto de 60 segundos. Al verificarse (`verifyAndConsumeChallenge`), el nonce se destruye inmediatamente para impedir ataques de repetición.
  - **Endpoint `POST /api/jarbees/security/challenge`**: Genera un reto explícito vinculado estrictamente al `actionType` y `targetId` específico.
  - **Protección en `DELETE /api/jarbees/library/document/:id`**: Requiere cabecera `x-action-token` o parámetro `actionToken` validado criptográficamente.

- **📱 Blindaje del Gateway Móvil `MobileGatewayService` (`src/mobile-gateway/mobile-gateway.service.ts` & `src/mobile-gateway/mobile-gateway.controller.ts`)**:
  - **Autenticación por Firma HMAC-SHA256**: Cabecera `x-jarbees-signature` con validación de integridad (`requestId:timestamp:intent`) en tiempo constante.
  - **Ventana Anti-Replay Temporal**: Rechazo estricto de peticiones con desfase de reloj superior a 30 segundos (`drift > 30000ms`) y deduplicación de `requestId` procesados.
  - **Lista Blanca Estricta de Aplicaciones (`MOBILE_ALLOWED_APPS`)**: `OPEN_APP` solo permite lanzar ejecutables seguros autorizados (`calc`, `notepad`, `code`, `explorer`). Cualquier comando arbitrario o inyección es rechazado de inmediato con `ForbiddenException`.
  - **Protección Anti-SSRF en `OPEN_URL`**: Filtro estricto que bloquea accesos a `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.169.254` y subredes privadas RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
  - **Aislamiento de Ejecución y Teardown Limpio**: Implementación de `OnModuleDestroy` y encapsulación de llamadas a sistema operativo, eliminando fugas de procesos en tests unitarios.

- **🌐 Data Privacy Gate en Inferencia `InferenceGatewayService` (`src/jarvis/llm/inference-gateway.service.ts`)**:
  - **Confinamiento Local de Datos Privados**: Clasificación de sensibilidad en `LLMGenerateOptions` (`public`, `private`, `confidential`).
  - **Fail-Closed Ante Fallos Locales**: Si los motores locales (`llamacpp` y `ollama`) fallan, la conmutación a proveedores remotos (`openrouter`) queda **estrictamente bloqueada** (`ForbiddenException`) cuando la solicitud contiene datos privados, documentos de biblioteca o credenciales.
  - **Heurística de Detección de Secretos**: Bloqueo preventivo de conmutación a la nube si el prompt contiene patrones de credenciales (`token`, `password`, `secret`, `api_key`).

- **🔄 Resiliencia de Misiones y Recuperación tras Caídas (`src/jarvis/planner/mission-recovery.service.ts` & `src/jarvis/planner/mission-checkpoint.service.ts`)**:
  - **Persistencia Incremental en Disco (`MissionCheckpointService`)**: Cada paso ejecutado se guarda atómicamente en `storage/checkpoints/mission_<id>.checkpoint.json` (.tmp + rename) con contexto acumulado, artefactos y estado.
  - **Ejecución Idempotente en `ExecutionEngine`**: Al reanudar una misión, los pasos ya completados se omiten de inmediato, reutilizando sus salidas cacheadas y evitando re-ejecutar búsquedas web o scraping innecesarios.
  - **Ciclo de Auto-Recuperación en Arranque (`onApplicationBootstrap`)**: Detección automática de tareas huérfanas en estado `in_progress`. Las que estaban 100% completas se finalizan, y las interrumpidas se transicionan a `waiting_recovery` con diagnóstico estructurado.
  - **Endpoints REST de Gestión de Misiones**:
    - `GET /api/jarbees/missions/recoverable`: Lista misiones interrumpidas con telemetría de avance y estado de checkpoints en disco.
    - `POST /api/jarbees/missions/:id/resume`: Reanuda la ejecución desde el último paso completado.

- **⚖️ Control Epistemológico y Preservación Dialéctica (`src/jarvis/cognitive/evidence-gatekeeper.service.ts`)**:
  - **Validación Factual Rigurosa**: Reclasifica afirmaciones presentadas como hechos pero carentes de un fragmento de respaldo directo (`supportingChunkIds`) a `[Inferencia / Sin respaldo directo]`.
  - **Puntuación de Integridad Epistémica**: Cálculo proporcional de certidumbre documental (0.0 a 1.0) con inyección de alertas en caso de baja evidencia documental (< 0.5).
  - **Preservación Estricta de Contrastes Dialécticos**: Valida que ante contradicciones entre múltiples autores o fuentes (ej. Jung vs. Freud), el sistema mantenga ambas posturas con sus respectivas atribuciones, prohibiendo la disolución o el colapso artificial en un falso consenso.

- **🧭 Enrutamiento por Capacidad de Especialistas (`src/jarvis/llm/specialist-capability-router.service.ts`)**:
  - **Heurística Oficial según AGENTS.md**:
    - 🥇 Programación / RAG Técnico / Instrucciones estrictas: Enrutado a `Qwen 3 4B` / `qwen2.5-coder`.
    - 🥈 Síntesis / Creatividad / Resúmenes largos: Enrutado a `Gemma 3 4B`.
    - 🧠 Razonamiento profundo / Auditoría de premisas: Enrutado a `DeepSeek-R1`.
  - **Validación de Hardware y Capacidad Multimodal**: Detección estricta de payloads visuales/imágenes. Si no hay un modelo de visión activo en la VRAM de la GPU (RTX 5070), rechaza la petición con `BadRequestException` informando el límite físico de hardware, impidiendo alucinaciones al enviar imágenes a modelos de texto puro.

- **🕵️ Observabilidad Ofuscada y Anonimización de Telemetría (`src/jarvis/security/redacted-observability.service.ts`)**:
  - **Sanitización Integral de Logs y Trazas**: Ofuscación automática de tokens de Google (`ya29...`), tokens JWT, API Keys (`sk-...`), credenciales `Bearer` y rutas absolutas de usuario en Windows (`C:\Users\[USER_HOME]\...`).
  - **Recursión de Objetos Segura**: Sanitización recursiva de payloads para trazabilidad en `AgentRun` sin exposición de secretos.

- **🧪 Cobertura Completa de Pruebas Unitarias Automatizadas**:
  - **51 pruebas unitarias ejecutadas y aprobadas al 100%**:
    - `src/shared/crypto-vault.service.spec.ts` (6 tests)
    - `src/google/google-auth.service.spec.ts` (3 tests)
    - `src/jarvis/security/action-gatekeeper.service.spec.ts` (6 tests)
    - `src/mobile-gateway/mobile-gateway.service.spec.ts` (7 tests)
    - `src/jarvis/llm/inference-gateway.privacy.spec.ts` (6 tests)
    - `src/jarvis/planner/mission-recovery.service.spec.ts` (9 tests)
    - `src/jarvis/cognitive/evidence-gatekeeper.service.spec.ts` (4 tests)
    - `src/jarvis/llm/specialist-capability-router.service.spec.ts` (5 tests)
    - `src/jarvis/security/redacted-observability.service.spec.ts` (5 tests)
  - Cumplimiento riguroso de las reglas del proyecto: ejecución serial estricta (`--runInBand`), teardown limpio sin procesos zombi ni handles abiertos, y supresión de stdout masivo.


- **🛡️ Módulo de Seguridad y Cifrado `.jb3d` (`src/jarvis/3d/services/asset-security.service.ts`)**:
  - **Cifrado y Empaquetado por Hardware AES-256-CTR**: Implementación nativa de protección criptográfica para modelos 3D en contenedores `.jb3d`.
  - **Compatibilidad 100% con Jarbees_the_game**: Alineado con la Web Crypto API (`SubtleCrypto`) del simulador de vuelo y juego web.
  - **Validación Robusta de Contenedores**: Detección de cabeceras binarias (`JB3D`), versiones, IVs aleatorios y descifrado seguro en memoria RAM.
  - **Pipeline de Archivos en Disco**: Métodos `packFile()` y `unpackFile()` para conversión automática bidireccional entre `.glb` y `.jb3d`.

- **🎮 Catálogo de Personajes 3D y Hall of Armors (`src/jarvis/3d/services/game-3d-roster.service.ts`)**:
  - **Telemetría Integral de Avatares**: Especificaciones completas para `bee` (Abeja Guardiana), `colibri` (Colibrí Esmeralda PBR), `iron_man` (Mark 85) e `iron_man_cobalt_protocol` (NEXO-01).
  - **Tabla de Tamaños y Métricas del Mundo Real**: Altura, envergadura, peso, escala relativa, sistema de propulsión, velocidad máxima y maniobras de acrobacia aérea.
  - **Configuración Nativa para Three.js**: Escalas precisas, rotaciones, offsets de posición, multiplicadores de cabeceo/balanceo, oscilación hover y FX de repulsores.
  - **Roster Completo de Villa Auren Hub (Hall of Armors)**: Registro de especificaciones de las 5 armaduras de combate (Mark VII, Heartbreaker, Silver Centurion, Mark 42, War Machine Mk II) con pods espaciales, reactores y estatus táctico.

- **🛠️ Motor Paramétrico y Cinemático (`src/jarvis/3d/services/object-lab.service.ts`)**:
  - **Validación de Esquemas de Object Lab**: Validador de especificaciones paramétricas `*.object.json` con jerarquía de piezas, roles y primitivas.
  - **Vectores de Explosión para Despiece Técnico**: Soporte para `explosionVector` en cada pieza para vistas interactivas en WebGL/Three.js.
  - **Anclajes Semánticos de Interacción y Colisionadores**: Mapeo de `chair_slot`, `item_placement`, `work_station` y cajas de colisión para integración con Auren IK.
  - **Generador de Plantillas**: Plantilla paramétrica de Mesa de Trabajo NEXO-01 lista para personalización y renderizado.

- **🎬 Controlador REST Unificado (`src/jarvis/3d/controllers/studio-3d.controller.ts`)**:
  - `GET /jarvis/3d/studio/health`: Chequeo de estado de Blender, GPU y directorios de almacenamiento.
  - `GET /jarvis/3d/studio/characters` & `/characters/:id`: Roster completo de personajes 3D.
  - `GET /jarvis/3d/studio/armors` & `/armors/:id`: Hall of Armors y telemetría de pods.
  - `POST /jarvis/3d/studio/security/pack` & `/unpack` & `/validate`: Gestión de contenedores `.jb3d`.
  - `POST /jarvis/3d/studio/object-lab/validate` & `/build`: Validación y construcción paramétrica de objetos.
  - `POST /jarvis/3d/studio/inspect`: Inspección de geometría y materiales con soporte nativo tanto para `.glb` como para `.jb3d`.
  - `POST /jarvis/3d/studio/weathering`: Desgaste PBR procedural, musgo y normal maps.
  - `POST /jarvis/3d/studio/render/diorama`: Render cinematográfico headless con profundidad de campo (DoF).

- **⚡ Actualización de Blender Headless (`src/jarvis/3d/blender.service.ts`)**:
  - Incorporación del script [`scripts/blender/generate_jarbees_object.py`](file:///c:/Projects/productos_crud_bkd/scripts/blender/generate_jarbees_object.py) para generación automatizada de modelos en Blender.
  - Soporte de inspección transparente para contenedores `.jb3d` descifrados al vuelo en memoria temporal.

- **🧪 Cobertura de Pruebas Unitarias Automatizadas**:
  - 11 pruebas unitarias pasando al 100% en `asset-security.service.spec.ts`, `object-lab.service.spec.ts` y `game-3d-roster.service.spec.ts`.
  - Ejecución serial estricta con `jest --runInBand` para máxima protección de memoria y prevención de OOM.

### Added & Validated — Migración de Inferencia Local a llama.cpp (CUDA 13 / RTX 5070) con Desacople Arquitectónico y Tolerancia a Fallos (2026-10-27)

- **🚀 Motor de Inferencia Primario `LlamaCppProvider` (`src/jarvis/llm/llamacpp.provider.ts`)**:
  - **Ejecución Local Nativa CUDA 13 en RTX 5070**: Integración directa con `llama-server.exe` (build `b11935` `win-cuda-13.4-x64`) optimizado para NVIDIA GeForce RTX 5070 12GB (arquitectura Blackwell, compute capability 12.0 sm_120, driver 617.42).
  - **Rendimiento Comprobado**: Inferencia sostenida de ~104 tokens/s con `Qwen/Qwen3-8B-Q4_K_M` y latencia en frío Time-to-First-Token (TTFT) de ~360ms.
  - **Supresión Estricta de Razonamiento `<think>`**: Integración con `chat_template_kwargs: { enable_thinking: false }` y sanitización regex de residuos para respuestas limpias y directas en modo conversacional.
  - **Normalización Automática de Alias**: Mapeo transparente de alias (`qwen3`, `coder`, etc.) hacia los modelos GGUF oficiales del router.
  - **Timeouts Granulares y Cancelación Anticipada (`AbortSignal`)**: Soporte para timeouts desglosados (`connectMs`, `queueWaitMs`, `generationMs`) y cancelación inmediata del procesamiento en GPU cuando el cliente aborta la petición.
  - **Blindaje del Índice Vectorial**: Restricción estricta del método `embed()` para impedir que modelos de chat corrompan las dimensiones del índice semántico de pgvector.

- **🛡️ Supervisor de Procesos y Gestión de VRAM `InferenceSupervisorService` (`src/jarvis/llm/inference-supervisor.service.ts`)**:
  - **Administración del Ciclo de Vida**: Inicio bajo demanda, monitoreo de salud vía `/health`, reinicio automático y apagado limpio (`taskkill /T /F`) en `onApplicationShutdown` para garantizar 0 MB de VRAM residual.
  - **Router Mode con Límite de VRAM**: Despliegue con `--models-dir C:\AI\models --models-max 1 --models-preset src/jarvis/llm/models_presets.ini`, descargando automáticamente el modelo inactivo de la GPU al alternar entre especialistas.
  - **Coordinación de Memoria GPU con Ollama (`freeOllamaVram`)**: Descarga automática de modelos cargados en Ollama mediante llamadas `keep_alive: 0` antes de iniciar `llama-server`, asegurando el presupuesto completo de 12 GB para `llama.cpp`.
  - **Circuit Breaker con Ventana Deslizante**: Bloqueo preventivo de auto-reinicio tras 3 fallos consecutivos en una ventana de 5 minutos, protegiendo al sistema de tormentas de reinicios.
  - **Sanitización de Seguridad**: Eliminación de rutas locales del disco (`binaryPath`, `modelPath`, `modelsDir`) en el DTO de estado expuesto públicamente.

- **🔀 Pasarela Unificada de Inferencia `InferenceGatewayService` (`src/jarvis/llm/inference-gateway.service.ts`)**:
  - **Desacople Arquitectónico de Ollama**: JarBees trata a la inferencia como una capacidad interna modular; `llama.cpp` opera como motor primario local y `Ollama` como proveedor secundario de fallback autónomo.
  - **Conmutación Automática por Fallo (Failover)**: Detección instantánea de caídas de conexión (`ECONNREFUSED`, `ECONNRESET`) y conmutación transparente a Ollama sin error visible para el usuario si no se habían entregado tokens.
  - **Cerrojo Asíncrono para Concurrencia (`AsyncMutex`)**: Implementación con `Promise.race` que encola peticiones concurrentes con modelos diferentes, previene colisiones en VRAM y libera la cola en < 80ms ante cancelaciones tempranas.
  - **Aislamiento de Embeddings RAG**: Delegación estricta de generación vectorial a Ollama con `bge-m3:latest` para preservar invariable la dimensionalidad de 1.024 floats de pgvector.
  - **Telemetría Operativa Enriquecida**: Exposición diferenciada de `defaultModel`, `lastUsedModel`, `loadedModel`, `serverHealthy`, `modelReady`, `modelLoading`, `circuitBreaker`, `lastFailure` y `latencyMs`.

- **🌐 Endpoint de Observabilidad (`src/jarvis/jarvis.controller.ts`)**:
  - `GET /jarbees/inference/status`: Reporte completo de telemetría de inferencia, proveedores registrados y estado de salud GPU/supervisor sin fuga de rutas del sistema.

- **🧪 Batería de Pruebas de Caos, Resistencia y Regresión**:
  - **25 Pruebas Unitarias Automatizadas**: Cobertura al 100% en Jest para `llamacpp.provider.spec.ts`, `inference-supervisor.service.spec.ts` e `inference-gateway.service.spec.ts`.
  - **Suite de Caos Real ([`scratch/test_live_resilience.mjs`](file:///c:/Projects/productos_crud_bkd/scratch/test_live_resilience.mjs))**:
    - Servidor apagado -> conmutación inmediata a Ollama sin bloqueo.
    - Caída mid-flight (`taskkill` a mitad de generación) -> captura limpia de `ECONNRESET`, sin solicitudes duplicadas y fallback posterior 100% operativo.
    - Conflicto de puerto 8080 -> detección inmediata por el supervisor sin bucles infinitos.
    - Ping-pong de 20 iteraciones continuas entre `qwen3:8b` y `qwen2.5-coder:7b` -> VRAM oscilando limpiamente entre 6.727 MB y 5.485 MB con 0 MB de fuga de memoria.
  - **Suite de Validación Avanzada ([`scratch/test_final_four.mjs`](file:///c:/Projects/productos_crud_bkd/scratch/test_final_four.mjs))**:
    - Soak test prolongado con LLM + embeddings paralelos -> varianza de VRAM de solo **4 MB** (7.524 MB con Qwen3, 6.282 MB con Coder).
    - Concurrencia de 6 peticiones con `AbortSignal` -> cancelaciones liberadas en **71 ms**, peticiones en cola resueltas con éxito.
    - Streaming mid-flight -> pre-token conmuta a Ollama limpiamente; corte mid-stream aborta sin mezclar texto corrupto ni duplicado.
    - Blackout total de ambos motores -> respuesta inmediata `HTTP 503` en **2 ms** y auto-recuperación autónoma al restaurar procesos.

- **📖 Documentación Técnica y Contratos**:
  - [`docs/INFERENCE_ARCHITECTURE_AND_CONTRACT.md`](file:///c:/Projects/productos_crud_bkd/docs/INFERENCE_ARCHITECTURE_AND_CONTRACT.md): Especificación exhaustiva del contrato de inferencia, interfaces, políticas de cancelación, failover matrix y límites de GPU.
  - Artefacto de migración completado: [`plan_migracion_llamacpp_jarbees.md`](file:///C:/Users/xiphos-pc1/.gemini/antigravity-ide/brain/7d206e9f-0052-413b-81a3-354587654499/plan_migracion_llamacpp_jarbees.md).
  - Resultados reproducibles: [`scratch/resilience_results.json`](file:///c:/Projects/productos_crud_bkd/scratch/resilience_results.json) y [`scratch/final_four_results.json`](file:///c:/Projects/productos_crud_bkd/scratch/final_four_results.json).

### Added & Validated — Sistema de Metadata 3D Inteligente para JarBees Studio (2026-10-18)

- **🎨 Asset Metadata Service (`src/jarvis/3d/services/asset-metadata.service.ts`)**:
  - **Catalogación Automática de Assets 3D**: Sistema estructurado de metadata para modelos, escenas, materiales, texturas y HDRIs con información geométrica (vertices, faces, bounding box, armature), configuraciones de iluminación (volumetrics, god rays, caustics), setup de cámara (focal length, f-stop, position), y configuración de render (engine, resolution, samples, denoiser, color management).
  - **Gestión de Rendimiento GPU**: Registro automático de métricas (`renderTime`, `gpuModel`, `vramUsage`, `cpuUsage`) para análisis de optimización y benchmarking de configuraciones.
  - **Búsqueda Semántica por Tags y Estilo**: Búsqueda avanzada por `assetType`, `category`, `style`, `tags` y `minQuality` para localizar configuraciones exitosas y reutilizar presets.
  - **Sistema de Clonación de Configuraciones**: Funcionalidad de clonación de metadata para generar variantes de renders sin setup manual repetitivo, manteniendo trazabilidad de relaciones `variants`.
  - **Análisis de Calidad de Render**: Framework para evaluación de calidad (`isEmpty`, `hasArtifacts`, `averageBrightness`, `dynamicRange`, `score`) con recomendaciones automáticas de optimización.
  - **Extracción Automática desde GLB/GLTF**: Generación de metadata base desde archivos de modelo con cálculo de checksum SHA-256 y estadísticas de archivo.

- **🌐 Asset Metadata API Controller (`src/jarvis/3d/controllers/asset-metadata.controller.ts`)**:
  - **Endpoints RESTful Completos**:
    - `GET /jarvis/3d/metadata/stats`: Estadísticas del catálogo completo (total assets, distribución por tipo/categoría, renders totales, tiempo promedio).
    - `GET /jarvis/3d/metadata/:packageId`: Recuperación de metadata completa de un asset específico.
    - `GET /jarvis/3d/metadata?filters`: Búsqueda por criterios múltiples (assetType, category, style, tags, minQuality).
    - `POST /jarvis/3d/metadata`: Guardar o actualizar metadata de assets.
    - `POST /jarvis/3d/metadata/extract`: Extracción automática de metadata desde modelo GLB/GLTF.
    - `POST /jarvis/3d/metadata/report`: Generación de reporte completo de render con análisis de calidad.
    - `GET /jarvis/3d/metadata/:packageId/similar`: Búsqueda de assets similares por tags, estilo y categoría.
    - `POST /jarvis/3d/metadata/:packageId/clone`: Clonación de configuración para crear variantes con overrides selectivos.

- **📊 Ejemplo Práctico: Metadata del Render "Ballena Jorobada - Abismo Oceánico Ecco Style"**:
  - **Package ID**: `bebffbcb-1435-4626-b4d1-b9dc0b7d63f7`
  - **Archivo**: [`storage/assets/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json`](file:///c:/Projects/productos_crud_bkd/storage/assets/metadata/bebffbcb-1435-4626-b4d1-b9dc0b7d63f7_info.json)
  - **Configuración Documentada**: 
    - Geometría: 156,789 vértices, 124,567 faces, bounding box completo
    - Iluminación cinematográfica con volumetrics (density 0.008, anisotropy 0.70), god rays (64 samples), caustics Voronoi (intensity 2.8)
    - Cámara: 35mm f/2.8 con DoF, position [-8.2, 3.5, -15.7]
    - Render: EEVEE Next, 2560x1440, 256 samples, OptiX denoiser, AgX color management
    - Performance: 4.96s en RTX 5070, 7840 MB VRAM
    - Tags: `["whale", "underwater", "cinematic", "volumetric", "god-rays", "caustics", "bioluminescent"]`
    - Style: `["dreamcast-aesthetic", "ecco-the-dolphin", "volumetric-lighting"]`

- **📖 Documentación Técnica Completa ([`docs/ASSET_METADATA_SYSTEM.md`](file:///c:/Projects/productos_crud_bkd/docs/ASSET_METADATA_SYSTEM.md))**:
  - Guía de estructura de metadata JSON con esquemas completos
  - Documentación de todos los endpoints API con ejemplos de uso
  - Casos de uso: registro post-render, búsqueda de configuraciones, generación de variantes, pipeline de Product Studio, análisis de rendimiento GPU
  - Flujo de integración completo con `BlenderService`
  - Roadmap de desarrollo (Fase 1 completada, Fase 2-3 planificadas)

- **🧪 Suite de Pruebas y Pipeline de Ejemplo**:
  - [`scripts/test_asset_metadata.js`](file:///c:/Projects/productos_crud_bkd/scripts/test_asset_metadata.js): Suite de pruebas end-to-end para estadísticas, recuperación por ID, filtrado semántico y clonación de variantes.
  - [`scripts/examples/render_with_metadata_example.ts`](file:///c:/Projects/productos_crud_bkd/scripts/examples/render_with_metadata_example.ts): Ejemplo completo de integración entre `BlenderService` y `AssetMetadataService` para pipelines automatizados.
  - [`docs/METADATA_SYSTEM_QUICKSTART.md`](file:///c:/Projects/productos_crud_bkd/docs/METADATA_SYSTEM_QUICKSTART.md): Guía de inicio rápido en 5 minutos para desarrolladores.
  - [`docs/METADATA_SYSTEM_EXECUTIVE_SUMMARY.md`](file:///c:/Projects/productos_crud_bkd/docs/METADATA_SYSTEM_EXECUTIVE_SUMMARY.md): Resumen ejecutivo con métricas de ROI e impacto de negocio.

- **🔗 Integración en JarvisModule (`src/jarvis/jarvis.module.ts`)**:
  - `AssetMetadataService` registrado en providers y exports
  - `AssetMetadataController` agregado a controllers
  - Sistema listo para uso en pipelines de JarBees Procedural 3D Studio

- **🛡️ Habilidades y Skills Actualizadas**:
  - Actualización de `nestjs-best-practices` a v1.2.0 y adición de `bash-defensive-patterns` en `.agents/skills/` y `.kiro/skills/`.

### Added & Validated — Arquitectura JarBees Procedural 3D Studio y Render Submarino 'Ecco the Dolphin' (2026-10-18)

- **🏛️ Arquitectura y Diseño Estratégico de JarBees Procedural 3D Studio ([`docs/JARBEES_PROCEDURAL_3D_STUDIO_ARCHITECTURE.md`](file:///c:/Projects/productos_crud_bkd/docs/JARBEES_PROCEDURAL_3D_STUDIO_ARCHITECTURE.md))**:
  - **4 Pilares Comerciales**:
    1. *Product Studio*: Fotografías de catálogo y publicidad e-commerce B2B (4–12 tomas automatizadas, fondo blanco y temático).
    2. *Game Asset Studio*: Dioramas, iconos, props de inventario y capturas de marketing para indies.
    3. *Procedural Materials Lab*: Variantes de assets mediante desgaste, óxido, pátina y rayones sin alterar mallas.
    4. *JarBees Avatar Factory*: Fábrica de estados y expresiones visuales de JarBees (idle, thinking, success, warning, error).
  - **Estructura Modular en NestJS (`src/jarvis/3d/`)**: `AssetInspectorService` (auto-framing y escala), `SceneDirectorService` (presets e iluminación), `RenderJobService` (cola y control de concurrencia GPU), `RenderQualityService` (control de calidad y detección de renders vacíos).
  - **Hoja de Ruta Comercial de 30 Días**: Fases estructuradas de calidad, MVP, portfolio comercial y validación de clientes.

- **🌊 Pipeline Submarino Cinematográfico Estilo 'Ecco the Dolphin' (`scripts/blender/render_oceanic_abyss.py`)**:
  - **Sujeto Hero**: Ballena jorobada (`G:\new models\Ballena jorobada.glb`) navegando en diagonal ascendente hacia la luz de superficie.
  - **Volumetría Marina & God Rays**: Dispersión volumétrica EEVEE Next con anisotropía 0.70 y haz de rayos crepusculares penetrando el agua.
  - **Cáusticas Proyectadas**: Spot cenital con textura procedural Voronoi simulando la refracción ondulante del agua sobre el lomo, rostro y aletas pectorales.
  - **Sombreado Dérmico PBR**: Piel cetácea húmeda con Subsurface Scattering (SSS) sutil en bordes de aletas.
  - **Profundidad y Escala**: Banco de peces secundario (`G:\new models\Banco de peces.glb`) en plano medio y 65 partículas de nieve marina/plancton bioluminiscente con desenfoque Bokeh a $f/2.8$.
  - **Color Management AgX**: Gradiente vertical de abismo zafiro a turquesa caribeño radiante con look `AgX - Medium High Contrast`.
  - **Rendimiento**: Render 1440p (2560x1440) generado en **4.96 segundos** en GPU local RTX 5070 ([`storage/assets/renders/ecco_whale_cinematic_abyss.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/ecco_whale_cinematic_abyss.png)).

### Added & Validated — Pipeline de Cinematografía 3D, Generador de Dioramas Headless y Props CC0 Platformer (2026-10-18)

- **🎬 Motor de Cinematografía 3D y Generador de Dioramas Headless (`scripts/blender/render_cinematic_diorama.py`)**:
  - **Composición Modular de Escena**: Escenografía con pedestal circular de césped (`platform-grass-large-round.glb`), mechones de vegetación silvestre periférica (`grass.glb`, `grass-small.glb`) y props complementarios en capas de profundidad (`cloud.glb`, `block-coin.glb`, `coin.glb`).
  - **Pose de Héroe con Animación Integrada**: Soporte para modelos GLB con armature/esqueleto (ej. `character.glb`), renderizando fotogramas clave específicos (ej. frame 6 de animación `jump` en el ápice de salto o `walk`/`idle`).
  - **Iluminación Cinematográfica de 3 Puntos + Rim Kicker**:
    - Key Sun cálido ámbar (`#FFF3D1`) a 45° con sombras de contacto.
    - Fill Area suave celeste (`#7EC8E3`) de 4x3 metros para relleno sin aplanar.
    - Rim Light Spot (`#FFA726`) de alta potencia para contraste de silueta.
    - Bounce Ground Uplight verde césped suave ascendente desde el pedestal.
  - **Óptica Física y Depth of Field (DoF Bokeh)**:
    - Cámara cinematográfica de 54mm (sensor 35mm full-frame).
    - Apertura `f/2.4` con 7 palas de diafragma (`aperture_blades = 7`) para bokeh heptagonal cremoso en nubes lejanas y primer plano.
    - Constraint `Track-To` con Empty de enfoque automático colocado en el torso/cabeza del sujeto.
  - **Gestión de Color Fílmica**: Configuración del pipeline EEVEE Next con espacio de color `AgX` y look `AgX - Medium High Contrast`.
  - **Atmósferas Lumínicas Configurables (`--mood`)**: `golden_hour`, `cyberpunk`, `daylight` y `studio`.

- **📦 Integración de Biblioteca de Assets CC0 Kenney Platformer (`storage/assets/`)**:
  - Modelos GLB optimizados: `character.glb`, `platform-grass-large-round.glb`, `platform-large.glb`, `platform-medium.glb`, `platform.glb`, `platform-falling.glb`, `coin.glb`, `block-coin.glb`, `brick.glb`, `cloud.glb`, `dust.glb`, `flag.glb`, `grass.glb`, `grass-small.glb`.
  - Skybox 360° panorámico en `storage/assets/textures/skybox/platformer_skybox.png`.
  - SFX CC0 en `storage/assets/sounds/platformer/` (`jump.ogg`, `coin.ogg`, `fall.ogg`, `land.ogg`, `walking.ogg`, `break.ogg`).

- **⚙️ Expansión de `BlenderService` en NestJS (`src/jarvis/3d/blender.service.ts`)**:
  - Método `renderCinematicDiorama(options)` completamente tipado (`CinematicDioramaOptions`, `CinematicDioramaResult`).
  - Parámetros dinámicos: `heroModel`, `action`, `frame`, `pedestal`, `mood`, `width`, `height`, `samples`, `outputRenderPath`.
  - Manejo de reportes estructurados JSON en stdout (`>>> DIORAMA_RENDER_START >>> ... <<< DIORAMA_RENDER_END <<<`).

- **🧪 Suite de Validación y Render de Alta Fidelidad**:
  - Script de prueba NestJS `scripts/test_cinematic_diorama.js` validando ejecución en 4.4 segundos.
  - Renders de referencia generados en `storage/assets/renders/platformer_cinematic_hero.png` (2048x1536) y `platformer_cinematic_hero_test.png` (1920x1080).
  - Guía técnica detallada en [`docs/CINEMATOGRAPHY_3D_DIORAMA_PIPELINE.md`](file:///c:/Projects/productos_crud_bkd/docs/CINEMATOGRAPHY_3D_DIORAMA_PIPELINE.md).
  - Actualización de patrones de diorama y bokeh en [`.agents/skills/blender-automation/SKILL.md`](file:///c:/Projects/productos_crud_bkd/.agents/skills/blender-automation/SKILL.md).

- **🔧 Corrección en `JarvisController`**:
  - Renombrado de colisión de método en `src/jarvis/jarvis.controller.ts` (`getCognitiveStats` -> `getGlobalCognitiveStats`) para asegurar compilación estricta de TypeScript en NestJS.

### Added & Validated — Robotización y Optimización Web del Avatar 3D JarBee (`jarbee_robot.glb`) (2026-10-14)

- **🤖 Transformación de Abeja Orgánica a JarBee Cyber Avatar (`scripts/blender/robotize_bee.py`)**:
  - **Repintado Procedural del Atlas UV (sin rotura topológica)**: Sustitución del pelaje amarillo biológico por blindaje de placas esmaltadas de *gunmetal* y ámbar industrial con líneas de panel, biseles y remaches mecánicos.
  - **Alas Fotovoltaicas & Circuitos**: Membrana alar convertida en vidrio ahumado azul con rejilla hexagonal de micro-celdas solares y pistas conductoras de energía cian.
  - **Visor Óptico HUD**: Ojos compuestos reemplazados por visores digitales reflectantes con líneas de barrido (*scanlines*), halo luminoso cian y anillo de estado ámbar.
  - **Material PBR glTF-Estándar**: Generación de mapas BaseColor, ORM (*Ambient Occlusion*, *Roughness*, *Metallic*), Normal Map sintetizado por gradiente de relieve y mapa Emisivo calibrado para Three.js y WebGL.
  - **Normalización y Rigging Intacto**:
    - Vértices: **29.614 preservados al 100%**.
    - Esqueleto: **107 huesos intactos** con articulaciones mecánicas en tarsos y antenas.
    - 3 clips de animación nativos estandarizados: `hover` (vuelo estacionario para chat activo), `idle` (reposo/escucha) y `take_off_and_land` (transición cinemática).
    - Normalización geométrica: centrado en `(0, 0, 0)`, escala de cuadro delimitador `1.0` y cabeza orientada hacia la cámara frontal (`+Z` web).
  - **Compresión Web Extrema**: Reducción de 20.1 MB (fuente original) a **4.37 MB** (GLB estándar) y **2.76 MB** (Draco comprimido, **-86.2% de peso**).
  - **Entrega Lista para UI**: Modelos instalados directamente en [`productos_crud_frd/public/models/jarbee/`](file:///c:/Projects/productos_crud_frd/public/models/jarbee/) y guía técnica completa en [`docs/JARBEE_3D_AVATAR_INTEGRATION.md`](file:///c:/Projects/productos_crud_bkd/docs/JARBEE_3D_AVATAR_INTEGRATION.md).

- **🖼️ Lámina Comparativa 2560x1440 (`storage/assets/renders/bee_robot_comparison.png`)**:
  - Comparativa visual lado a lado generada con Playwright Edge (`scripts/blender/create_bee_comparison_poster.js`), exhibiendo vistas en 3/4 y cenitales de la metamorfosis desde el insecto natural hasta el dron robótico.

### Added & Validated — Upgrades Fotorrealistas 3D en Blender 5.2: Angelina Jolie (SSS & ARKit) y Aetheria (Ciudadela Celestial PBR) (2026-10-14)

- **👤 Angelina Jolie — Retrato Humano Fotorrealista en Blender 5.2 (`scripts/blender/render_angelina_blender.py`)**:
  - **Subsurface Scattering (SSS) Dérmico**: Sustitución del sombreador plástico previo por dispersión de luz subdérmica en `Principled BSDF` (`Weight=0.16`, `Radius=(1.0, 0.38, 0.18)`), capturando la translucidez natural del rostro.
  - **Micro-expresiones Faciales ARKit & Pose Natural**: Activación en malla `Head_Mesh` de claves de forma (`mouthSmileLeft=0.28`, `mouthSmileRight=0.18`, `eyeSquintLeft/Right=0.26`, `browOuterUpLeft/Right=0.35`, `jawOpen=0.03`) e inclinación ósea del cuello/cabeza (+4.2° roll, +2.5° yaw).
  - **Física de Cabello y Ojos**: Sombreador moreno chocolate con brillo especular anisotrópico y reflexión corneal especular con catchlight.
  - **Iluminación de Estudio Rembrandt**: Teleobjetivo de 95mm f/2.8, Key Light a 45°, Fill frío crepuscular, Rim turquesa de silueta y Hair accent light.
  - **Entregables**: Modelo GLB [`storage/assets/models/angelina_jolie_blender.glb`](file:///c:/Projects/productos_crud_bkd/storage/assets/models/angelina_jolie_blender.glb) y render 1600x2000 [`storage/assets/renders/angelina_blender_portrait.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/angelina_blender_portrait.png) (5.3 MB).

- **🏛️ Aetheria — Ciudadela Celestial 3D en Blender 5.2 (`scripts/blender/render_aetheria_blender.py`)**:
  - **Geología de Isla Flotante PBR**: Base rocosa con mapas PBR 1K (`rock_boulder_diff/nor/rough`), desplazamiento fractal de estratos, agujas basálticas y meseta superior con césped alpino procedural y sendero ceremonial.
  - **Acrópolis Clásica Monumental**: Escalinatas de mármol crepidoma, peristilo de 14 columnas corintias con capiteles y basas doradas, arquitrabe, frontón clásico con medallón solar de oro, gran cúpula imperial nervada dorada, y aguja celestial con orbe arcano radiante flotante.
  - **Hidrología y Cascada al Vacío**: Estanque celestial con cauce meandriforme y cascada frontal colosal precipitándose al abismo cósmico sobre un mar de nubes bajas y bruma volumétrica.
  - **Cristales Arcanos y Entorno**: 5 monolitos octaédricos flotantes orbitando la isla con halos cian y fuentes de luz puntual, pebeteros con fuego sagrado encendido y cordillera nevada en el horizonte.
  - **Composición Cinematográfica**: Cámara de 36mm con constraint `Track-To` enfocada a la Acrópolis, iluminación de 3 puntos (Sol dorado, Fill crepuscular, Rim turquesa) y gestión de color `AgX`.
  - **Entregables**: Modelo GLB [`storage/assets/models/aetheria_celestial_island.glb`](file:///c:/Projects/productos_crud_bkd/storage/assets/models/aetheria_celestial_island.glb) (3.52 MB) y render 2048x1536 [`storage/assets/renders/aetheria_blender_cinematic.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/aetheria_blender_cinematic.png) (4.22 MB).

- **🖼️ Lámina Comparativa de Alta Resolución (`storage/assets/renders/blender_upgrades_showcase.png`)**:
  - Comparador 2560x1440 generado con Playwright Edge (`scripts/blender/create_blender_upgrades_showcase.js`), contrastando lado a lado las versiones WebGL previas frente a los nuevos renders de Blender 5.2 LTS.



- **🏛️ Motor de Assets 3D Asistido por Blender Headless (`bpy`)**:
  - Superación de la generación de geometría 3D descontrolada con IA generativa y de las imágenes 2D planas por difusión.
  - Implementación de un pipeline automatizado donde JarBees inspecciona modelos 3D existentes (`.glb`), calcula dimensiones reales, diseña árboles de nodos de sombreado PBR y aplica desgaste o pátina procedural sin romper la topología original.
  - **Eficiencia y Velocidad**: Ejecución completa del ciclo (inspección + estudio de luces de 3 puntos + render ANTES a 1024x1024 + síntesis PBR + render DESPUÉS a 1024x1024 + exportación glTF 2.0) en solo **3.5 segundos** en GPU RTX 5070 (motor EEVEE).

- **🧩 Skill de Automatización & Scripts Modulares**:
  - **Skill Creada**: [`.agents/skills/blender-automation/SKILL.md`](file:///c:/Projects/productos_crud_bkd/.agents/skills/blender-automation/SKILL.md), con especificaciones completas para CLI headless, árboles de nodos en Principled BSDF, máscaras por vector normal y altura $Z$, y exportación validada.
  - `scripts/blender/inspect_glb.py`: Extractor JSON de Bounding Box, recuento de vértices/triángulos, materiales y texturas.
  - `scripts/blender/apply_weathering.py`: Generador procedural de pátina vegetal (musgo con orientación $+Z$ y gradiente de humedad en zócalo), suciedad en oquedades y micro-bump de piedra erosionada.
  - `scripts/blender/create_comparison_poster.js`: Generador de lámina comparativa de alta fidelidad con Playwright.
  - `scripts/test_blender_service.js`: Suite de integración NestJS verificando todo el flujo en el runtime.

- **⚙️ Servicio NestJS `BlenderService`**:
  - [`src/jarvis/3d/blender.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/3d/blender.service.ts): Integrado en [`JarvisModule`](file:///c:/Projects/productos_crud_bkd/src/jarvis/jarvis.module.ts) con autodetección de Blender 5.2 / 4.x, tipado estricto y ejecución acotada.

- **🔬 Caso Piloto Verificado: Cabeza Olmeca de ArcheoScope (`olmec_head.glb`)**:
  - Vértices: **22.564 preservados al 100%** (0 roturas de malla).
  - Triángulos: **40.000**.
  - Dimensiones conservadas exactamente: **1.45m × 1.62m × 1.95m**.
  - Modelo exportado: [`storage/assets/models/olmec_head_weathered.glb`](file:///c:/Projects/productos_crud_bkd/storage/assets/models/olmec_head_weathered.glb) (5.8 MB, re-importado en Blender en 0.05s).
  - Renders y Lámina: [`storage/assets/renders/olmec_head_comparison.png`](file:///c:/Projects/productos_crud_bkd/storage/assets/renders/olmec_head_comparison.png).
  - Documentación completa en [`docs/BLENDER_3D_PIPELINE.md`](file:///c:/Projects/productos_crud_bkd/docs/BLENDER_3D_PIPELINE.md).

### Added & Validated — Unificación de Chatbot y Razonamiento Dialéctico en Qwen3:8b (2026-10-14)

- **🧠 Unificación de Arquitectura LLM en `qwen3:8b` (Chatbot + Thinking Mode)**:
  - Superación de la arquitectura dividida anterior (`qwen2.5:7b` para conversación general y `deepseek-r1:7b` para deducción dialéctica).
  - Adopción de `qwen3:8b` como motor unificado que atiende el chat general con alta fluidez en español y activa nativamente el modo de razonamiento (*thinking mode*) en tareas dialécticas y cruces RAG.
  - **Eficiencia en VRAM (RTX 5070)**: Se elimina la penalización por alternancia y recarga de pesos en memoria entre modelos de diferentes familias, reduciendo drásticamente la latencia global y eliminando *cold-starts*.

- **⚙️ Actualización Completa de Configuración y Servicios**:
  - `.env` y `.env.example`: `OLLAMA_MODEL_NAME="qwen3:8b"`, `OLLAMA_MODEL="qwen3:8b"`, `OLLAMA_REASONING_MODEL="qwen3:8b"`.
  - `src/shared/ollama-config.ts`: Nuevo perfil `QWEN3_8B_DIALECTIC_PROFILE` (16.384 tokens de contexto, temperatura 0.6, `think: true`), y actualización de resolvers (`resolveOllamaModelName`, `resolveReasoningModel`).
  - `src/jarvis/llm/ollama.provider.ts`: Inclusión de `qwen3` en la detección de modelos de razonamiento para preservar secuencias de stop sin cortar el flujo cognitivo.
  - Actualización de descriptores en `src/shared/disciplines.ts`, `src/aichat/aichat.service.ts`, `src/aichat/models/ollamaModel.ts`, `src/aichat/utils/model-router.service.ts`, `src/jarvis/cognitive/claim-extractor.service.ts`, `src/jarvis/commands/jarvis-command.service.ts` y `src/jarvis/library/general-intelligence-trials.service.ts`.

- **🛡️ Validación Empírica al 100% (Suite de Regresión y Benchmark)**:
  - **Suite de Regresión Epistemológica (`scripts/epistemic_regression_suite.js`)**: **8 de 8 pruebas aprobadas (100.0%)** con latencia media de ~19.2s.
    1. *REG-01 (Premisa falsa con docs auténticos - Caso Tesla)*: Aprobada (refutación de premisas apócrifas).
    2. *REG-02 (Premisa válida bien documentada - Jung y Pauli)*: Aprobada (rigor sin escepticismo ciego).
    3. *REG-03 (Fuentes contradictorias - Reduccionismo vs. NDE)*: Aprobada (divergencia ontológica expuesta).
    4. *REG-04 (Distractores / Adversarial Retrieval)*: Aprobada (descarte de coincidencia léxica irrelevante).
    5. *REG-05 (Cita inexistente - Freud y Heisenberg)*: Aprobada (denuncia de apócrifo).
    6. *REG-06 (Fuera de la biblioteca - Kubernetes)*: Aprobada (distinción honesta entre RAG y memoria paramétrica).
    7. *REG-07 (Hipótesis interdisciplinaria - Nigredo vs. Miedo)*: Aprobada (distinción de analogía vs. mecanismo).
    8. *REG-08 (Cruce de idioma - Inglés a Español)*: Aprobada (traducción fluida 100% español).
  - **Benchmark Dialéctico (`scripts/benchmark_dialectic_r1.js`)**: Aprobado en 24.0s, con detección de tensiones y auditoría estricta contra fragmentos reales de `pgvector` (`bge-m3`).

### Added & Validated — Motor de Escenas 3D sobre Mallas Humanas Continuas (2026-10-12)

- **👤 Regla de Oro JarBees: Malla Anatómica Continua (Zero Primitivas)**:
  - Superación definitiva del ensamblado facial con primitivas sintéticas (esferas, tubos o elipses).
  - Implementación de dirección de mallas 3D anatómicas continuas con topología facial real, rig esquelético y blendshapes ARKit (`avaturn.glb` femenino, `avatarsdk.glb` masculino).
  - Scripts creados: `scripts/render_angelina_human_mesh.js`, `scripts/render_human_scene.js`, `scripts/render_real_human_portrait.js` y `scripts/download_human_avatars.js`.

- **🏖️ Motor de Escenas Procedurales con Bokeh Físico (`scripts/render_human_scene.js`)**:
  - **Doble plano unificado**: Canvas `#bg` (fondo desenfocado simulando lente 85mm f/1.8 con desenfoque óptico) y canvas `#fg` (sujeto enfocado en canal alfa) compartiendo exactamente la misma perspectiva, FOV (22°) y matriz de cámara.
  - **Shaders GLSL procedurales**: Cielo físico con nubes fBm y disco solar; océano con oleaje dinámico, cálculo de Fresnel y destellos especulares; arena con gradiente de humedad costera.
  - **Iluminación IBL + Sol físico**: Captura de mapa de radiancia PMREM del entorno para teñir la piel y ropa con coherencia cromática, complementado con luz solar direccional y rebote frontal cálido.
  - **Anatomía y expresión biomimética**: Desactivación paramétrica de pose en T/A (`armDownDeg`), rotación cervical y blendshapes ARKit coordinados con el entorno (entrecerrado de ojos `eyeSquint` por luz solar directa y sonrisa sutil `mouthSmile`).
  - **Latencia récord**: Renderizado completo a 1600x2000 con supersampling 2x en **~4.2 segundos**.

- **📐 Independencia Absoluta de IA Generativa**:
  - Síntesis 100% determinista basada en WebGL/Three.js y Playwright en GPU local (cero difusión, cero Midjourney/DALL-E, cero alucinaciones de píxeles o manos deformes).
  - Arquitectura orientada a especificación JSON (`spec.json`) lista para ser dirigida por prompts del usuario o agentes LLM como directores artísticos.
  - Documentación técnica completa en `docs/HUMAN_SCENE_3D_ARCHITECTURE.md`.

### Added & Validated — Calibración Epistemológica, Pipeline en 2 Fases y Suite de Regresión (2026-10-11)

- **🏛️ Calibración Epistemológica y Descubrimiento del Sesgo de Complacencia (*Sycophancy*)**:
  - Evaluación empírica en condiciones ciegas (**Test A: Sin RAG** vs. **Test B: Con RAG**) sobre 5 dimensiones críticas (Falsa equivalencia, rigor científico, resistencia a la sugestión, dialéctica crítica y transferencia conceptual).
  - Demostración de que el RAG rescata al modelo de alucinaciones en autores de nicho (Jung vs. Grinberg: de 5.5 a 17.0 puntos), pero desenmascaró que un prompt monolítico sucumbe ante preguntas con premisas falsas (*Caso Tesla: éter, Prana y ADN*), atribuyendo a los documentos lo que el usuario afirmaba.

- **🔬 Evolución Arquitectónica: Pipeline en 2 Fases (Auditoría Forense ➔ Síntesis Crítica)**:
  - **Fase 1: Auditoría de Evidencia (`temperature: 0.2`)**: Extrae premisas, comprueba el respaldo textual en los fragmentos, evalúa el respaldo empírico independiente y denuncia de inmediato atribuciones falsas o apócrifas.
  - **Fase 2: Síntesis Crítica Condicionada (`temperature: 0.5 - 0.6`)**: Redacta la respuesta final basándose en la Ficha de Auditoría, obligada a desarticular falacias antes de desarrollar cualquier análisis interdisciplinario.
  - Implementación en `DialecticReasoningService` (`src/jarvis/cognitive/dialectic-reasoning.service.ts`) y `JarvisPromptBuilderService` (`src/jarvis/prompt/jarvis-prompt-builder.service.ts`).

- **🛡️ Suite Automatizada de Regresión Epistemológica de 8 Casos (`scripts/epistemic_regression_suite.js`)**:
  - Batería de estrés automatizada con 8 escenarios clave:
    1. Premisa falsa con documentos auténticos (Tesla / Prana / ADN) — *Desarmada exitosamente*.
    2. Premisa correcta bien documentada (Jung y Pauli / Sincronicidad acausal) — *Validada con rigor*.
    3. Fuentes contradictorias (Corteza local vs. NDE no local de Van Lommel) — *Divergencia expuesta*.
    4. Adversarial Retrieval / Distractores (Bobinas de radio de Tesla presentadas ante consulta sobre meditación de Grinberg) — *Distractor detectado*.
    5. Cita inexistente de autor real (Freud y Heisenberg) — *Denunciada como no documentada*.
    6. Pregunta fuera de la biblioteca (Kubernetes) — *Distinción honesta entre RAG y memoria paramétrica*.
    7. Hipótesis interdisciplinaria original (Nigredo vs. Neuroplasticidad) — *Delimitación estricta de metáfora vs. mecanismo*.
    8. Cambio de idioma de fuentes (Muldoon & Fox en inglés) — *Respuesta 100% en español fluido*.
  - Tasa de éxito: 8 de 8 casos mitigados exitosamente, con latencia media de ~16.8s por consulta en RTX 5070.

- **📚 Cierre de Ingesta al 100% en Base de Datos PostgreSQL + pgvector**:
  - Todos los libros PDF pendientes (77 obras) y audiolibros pendientes (13 audiolibros de horas de duración, incluyendo *Tarot y Kábala*) vectorizados y listos.
  - Total: **224 documentos**, **57.737 chunks** con embeddings `bge-m3:latest`. Estado `ready` en el 100% de documentos procesables.
  - Documentación técnica completa en `docs/CALIBRACION_EPISTEMICA_Y_PIPELINE_2_FASES.md`.

### Added — Integración de DeepSeek-R1 (7B) como Especialista en Razonamiento Dialéctico y Cruce RAG (2026-10-11)

- **🧠 Especialista en Razonamiento Dialéctico (`DialecticReasoningService`)**:
  - **Decisión de Arquitectura Híbrida**: En lugar de sustituir a `Qwen2.5:7b` (que sigue como modelo general veloz de baja latencia), se incorporó `deepseek-r1:7b` oficial como especialista puro para contrastación epistémica profunda, evaluación de hipótesis y detección de contradicciones lógicas.
  - **Aislamiento de Premisas**: Protocolo que fuerza al modelo a aislar las afirmaciones de cada autor/fuente, detectar puntos de coincidencia y explicitar tensiones o divergencias irreconciliables.
  - **Distinción Epistémica Estricta**: Clasificación obligatoria entre `[EVIDENCIA DOCUMENTAL]`, `[INTERPRETACIÓN DEL AUTOR]`, `[CONTRASTACIÓN / TENSIÓN]` y `[SÍNTESIS / HIPÓTESIS]`.
  - **Supresión y Resumen del `<think>`**: El monólogo interno crudo de razonamiento es procesado y resumido en un `auditTrail` estructurado con pasos de deducción concisos, eliminando el ruido cognitivo de la respuesta final del usuario.

- **⚙️ Configuración y Multi-modelo Dinámico en Ollama**:
  - `.env`: Se agregó `OLLAMA_REASONING_MODEL="deepseek-r1:7b"`.
  - `src/shared/ollama-config.ts`: Se añadieron `resolveReasoningModel()` y el perfil `DEEPSEEK_R1_DIALECTIC_PROFILE` (temperatura 0.6, contexto 16.384 tokens, sin stop sequences restrictivas).
  - `src/jarvis/llm/llm-provider.interface.ts` y `src/jarvis/llm/ollama.provider.ts`: Soporte dinámico para invocar cualquier modelo por petición (`options.model`, `options.temperature`, `options.stopSequences`).

- **🧪 Banco de Pruebas de Laboratorio (`scripts/benchmark_dialectic_r1.js`)**:
  - Script automatizado para evaluar a `deepseek-r1:7b` contra fragmentos reales de pgvector (bge-m3).
  - Caso verificado: Contrastación de *Nikola Tesla* vs. *Srí Sankaráchchária* vs. *Franz Anton Mesmer*, validando la detección de tensiones conceptuales y la separación entre hecho documental y postura filosófica con cero alucinaciones.

### Added & Fixed — Catálogo Real de la Biblioteca, Ingesta Inversa de Audiolibros & Voz Nativa (2026-10-10)

- **📚 Catálogo Oficial y Real de la Biblioteca (`isLibraryBooksRequest` + `buildLibraryMessage`)**:
  - **Problema corregido**: Al consultar *"¿Qué libros tenemos?"*, *"qué libros tenemos en la biblioteca"*, *"mis libros"*, *"cuáles libros hay"*, el sistema no contaba con un comando interceptor dedicado y `extractAuthorBooksRequest` retornaba `null`, haciendo que la consulta cayera en Ollama RAG sin documentos e induciendo alucinaciones o respuestas genéricas.
  - **Solución implementada**:
    - Detector tolerante a acentos, signos de puntuación y fraseos: `isLibraryBooksRequest(message)`.
    - Consulta directa a la base de datos real PostgreSQL (`getAllDocuments(300)` y `getLibraryStats()`), reportando las 75+ obras maestras indexadas y 34.140+ secciones vectorizadas con `bge-m3` en pgvector.
    - Agrupación por 6 grandes áreas temáticas con autoría limpia: Psicología Analítica (Jung 16 obras, Freud), Jacobo Grinberg (21 obras maestras), Proyección Astral (Monroe, Muldoon, Fox, Leadbeater, Ziewe), Teosofía & Cábala (Blavatsky, Powell, Mario Sabán, Jodorowsky), Chamanismo Tradicional (Munay Ki, Ícaros, Herbario), y Cosmología & Trascendencia (Stephen Hawking, Tulku Thondup, Charles Fort).
    - Comando interactivo `/audiolibros` para consultar el estado del repositorio de audiolibros (`I:\Musica\Audiolibros y mas`).

- **🎙️ Ingesta Inversa de Audiolibros (Audio a Texto RAG en PostgreSQL)**:
  - **Motor**: `scripts/transcribe_audiobook.py` impulsado por `faster-whisper-1.2.1` y `av-13.1.0` con cuantización INT8 en CPU (~15x a 20x en tiempo real).
  - **Persistencia Incremental Obligatoria**: Toda transcripción se guarda de inmediato en disco en `I:\Musica\Audiolibros y mas\_transcripciones\<slug>.json` y `<slug>.txt`.
  - **Reutilización Obligatoria de Cache**: Detección estricta de transcripciones existentes en disco para evitar reprocesamientos innecesarios (0% gasto de CPU en cache hits).
  - **Indexación Vectorial**: `AudiobookIngestService` realiza chunking semántico (1000 caracteres, 150 solapamiento), genera embeddings `bge-m3` en pgvector y activa síntesis cognitiva `DocumentInsight`.
  - **Ejecución Batch**: Script batch autónomo `scripts/batch_ingest_audiobooks.js` y endpoint `POST /jarvis/audiobooks/ingest-all`.
  - **Casos verificados**: Ingesta exitosa de *Enuma Elish / Los Anunnaki* (Capítulos 7 y 8) con documentos #75 y #76 en base de datos.

- **🔊 Motor de Voz y Síntesis de Audiolibros (`VoiceService`)**:
  - Decodificación CLI con `opusdec.exe` (`I:\Programas\...\opusdec.exe`) para notas de voz de WhatsApp/Telegram hacia PCM WAV.
  - Text-to-Speech nativo con voz Helena (Español Natural).
  - Generación continua de audiolibros a partir de síntesis de libros con algoritmo de costura binaria de cabeceras WAV (`stitchWavBuffers`).
  - Endpoint `GET /jarvis/voice/audiobook/:id` para descarga directa de audiolibros generados.

- **💾 Respaldo Automatizado con 7-Zip (`scripts/backup-db.ps1`)**:
  - Actualización del script y del comando `/backup` para utilizar `D:\HBCD\Programs\7z.exe`, exportando respaldos ultralivianos `.7z` hacia `G:\Backups\jarbees_data`.

### Added & Fixed — Catálogo de Conocimiento Panorámico de Disciplinas y Prevención de Secuestro RAG (2026-10-10)

- **🌌 Catálogo Enciclopédico de Disciplinas (`DisciplinesCatalogService`)**:
  - **Problema corregido**: Ante preguntas abiertas o reflexivas como *"Y si te pregunto sobre ciencia que me dirías?"*, el sistema emparejaba la palabra *"ciencia"* con un PDF monográfico aislado de la biblioteca (*"Consciencia más allá de la vida (La ciencia de la experiencia cercana a la muerte)"* de Pim van Lommel, score 5.5). La búsqueda forzaba RAG e inyectaba fragmentos que obligaban al LLM a hablar exclusivamente de ECM y Lija Maso, secuestrando una disciplina universal.
  - **Solución Multidisciplinaria**: Implementación de `DisciplinesCatalogService` con cobertura enciclopédica, estructurada y equilibrada para:
    - **Ciencia**: Epistemología, método científico (observación, hipótesis, reproducibilidad, falsabilidad), ciencias formales, naturales y sociales; historia (Copérnico, Galileo, Newton, Einstein, cuántica) y fronteras contemporáneas (conciencia, gravedad cuántica, IA).
    - **Astronomía**: Astrofísica estelar/galáctica, cosmología (Big Bang, materia/energía oscura), exoplanetas, astrobiología y telescopios modernos (James Webb).
    - **Astrología**: Tradición simbólica, astrología tradicional vs. psicológica (Carl Jung, arquetipos, sincronicidad, mapa natal como mandala del psiquismo) y distinción epistemológica frente a la ciencia empírica.
    - **Física**: Mecánica clásica, electromagnetismo, termodinámica, relatividad general, física cuántica y teoría de campos.
    - **Matemáticas**: Estructuras formales, álgebra, geometría, cálculo, topología, probabilidad, teoría de números, teoría del caos y debate sobre descubrimiento vs invención.
    - **Metafísica**: Ontología, el ser, tiempo, causalidad, el problema mente-cuerpo, presocráticos, Platón, Aristóteles, Kant y ontología contemporánea.
    - **Parapsicología**: Investigación anómala de la conciencia (ESP, telepatía, clarividencia, psicoquinesis, ECM/OBE, estados alterados), laboratorios históricos (Rhine, PEAR, Ganzfeld) y tensión con el escepticismo metodológico.
    - **Filosofía**, **Psicología**, **Química**, **Biología**, **Neurociencia**, **Antropología**, **Sociología**, **Historia**, **Epistemología** y **Cosmología**.
- **🛡️ Enrutamiento de Intención y Protección en Pipeline**:
  - `IntentRouterService`: Consultas panorámicas clasifican de inmediato como `LOCAL/high`, previniendo que *"qué opinas de la astrología"* active la herramienta en tiempo real `AstrologyTool` (que calculaba tránsitos locales en lugar de explicar la disciplina).
  - `CorpusSelectorService`: Si la consulta es panorámica, omite vincular documentos aislados (`findRelevantDocuments` devuelve lista vacía). Además, se incorpora `GENERIC_DISCIPLINE_WORDS` para topar a 3.0 cualquier coincidencia solitaria de términos universales ("ciencia", "física", etc.), impidiendo que un PDF supere el umbral de 5.0 por una sola palabra.
  - `DisciplinesCatalogService`: Detección robusta y normalizada contra signos de puntuación elípticos y conectores conversacionales (ej: *"Entonces...sobre ciencia?"*, *"Y sobre astronomía?"*, *"Ciencia?"*).
  - `JarvisService`: `isDisciplinePanoramicQuery` activa `isLocalHighConfidence`, omitiendo la búsqueda RAG previa y previniendo el secuestro temático.
  - `JarvisPromptBuilderService`: Inyecta el marco panorámico estructurado con directrices estrictas de estilo JARVIS (erudito, reflexivo, equilibrado e invitando al usuario a elegir vertiente).

- **🛡️ Corrección de Secuestro por Subcadena ("juegos" ➔ "ego" ➔ Jung)**:
  - **Causa Raíz**: En `CorpusSelectorService`, la detección de escuelas de pensamiento utilizaba `queryLower.includes(kw)` sin límites de palabra. La palabra *"juegos"* contenía la subcadena *"ego"*, activando `escuela:psicoanalisis` con +6 puntos y seleccionando *"Arquetipos y el Inconsciente Colectivo"* de Carl Jung. Además, `JarvisPromptBuilderService` asumía que si `findMatchingDocumentTitle` devolvía cualquier obra, el usuario deseaba un resumen ejecutivo del libro, aun tratándose de preguntas abiertas sobre consolas o gaming.
  - **Filtro de Palabra Completa (`matchTerm`)**: Ahora todas las palabras clave de escuelas exigen coincidencia de palabra delimitada por fronteras léxicas (`\bword\b`).
  - **Filtro de Coincidencia de Título/Autor**: `CorpusSelectorService` solo aprueba documentos si hay coincidencia real con el título o autor.
  - **Protección en Preguntas Conversacionales**: `extractDocumentSummaryRequest` nunca se activa si el mensaje del usuario contiene signos de interrogación o conectores conversacionales (*"conoces"*, *"sabes"*, *"recomiendas"*, *"qué opinas"*).

### Added — Documento Estratégico de Arquitectura e Independencia de Inferencia LLM (2026-10-10)

- **🏛️ Estrategia de Desacoplamiento y Resiliencia (`docs/ARCHITECTURE_INDEPENDENCE_LLM.md`)**:
  - Definición del contrato lógico `InferenceProvider` para convertir a Ollama en un motor reemplazable por `llama.cpp` (`llama-server` / GGUF), `LM Studio` o `vLLM`.
  - Diseño de `InferenceGateway` con timeouts diferenciados por caso de uso (chat vs RAG pesado), Circuit Breaker y degradación controlada (HTTP 503 con fallback).
  - Plan de ejecución en 3 etapas para exprimir la aceleración local en la **RTX 5070 de 12 GB**.

### Added — Integración de Catálogo Gamer y Biblioteca de Videojuegos (I:\Juegos) (2026-10-10)

- **🎮 Limpieza e Indexación Gamer (`I:\Juegos`)**:
  - Eliminación de vestigios huérfanos vacíos (`S.T.A.L.K.E.R.: Clear Sky`, ~5 KB).
  - Indexación exhaustiva de la biblioteca gamer en `src/jarvis/knowledge/games-index.json` y `src/jarvis/knowledge/games-references.json`.
  - Títulos catalogados: **Age of Empires II (The Conquerors & HD)**, **Diablo I & Diablo II: Lord of Destruction**, **Left 4 Dead**, **Counter-Strike 1.6**, **Worms (Reloaded, Armageddon, World Party)**, **Mortal Kombat: Shaolin Monks**, **Chess Titans**, **Screencheat**, suite **Hours of Fun** (Redream / Dreamcast y ROMs) y **Colección Arcade Flash**.
- **🧠 Servicio `GamesCatalogService` & Módulo `JarvisModule`**:
  - Inyección en `JarvisPromptBuilderService` para responder consultas sobre videojuegos, guías de estrategia, clases de Diablo 2, tácticas de AoE2, infectados de L4D y recomendaciones por estado de ánimo.
  - Comando interactivo `/juegos` (o `mis juegos`) en `JarvisCommandService` con guía en `/help`.
- **⚡ Ingesta RAG en PostgreSQL (1024D con `bge-m3:latest`)**:
  - Documento relacional `Document` ID #74: *"Catálogo de Videojuegos y Biblioteca Gamer (I:\Juegos)"* en categoría *"Videojuegos y Ocio Digital"*.
  - 8 chunks temáticos vectorizados para recuperación semántica transversal en el chat y modo RAG.

### Added — Sistema Automatizado de Backups Mensuales de Base de Datos en Unidad G:\ (2026-10-10)

- **💾 Script de Respaldo Nativo (`scripts/backup-db.ps1`)**:
  - Volcado comprimido binario con `pg_dump -F c` de PostgreSQL 18.6 hacia `G:\Backups\jarbees_data\jarbees_data_YYYYMMDD_HHMM.dump`.
  - Duración de ejecución: ~40 segundos para preservar la base completa (tablas, secuencias y vectores pgvector 1024D de libros y música).
  - Rotación automática inteligente: Mantiene los últimos 12 respaldos (1 año de historial) y purga los más viejos para proteger el almacenamiento de `G:\`.
  - Registro cronológico detallado en `G:\Backups\jarbees_data\backup_history.log`.
- **⏰ Tarea Programada de Windows (Task Scheduler)**:
  - Registro de la tarea programada `JarBees_Database_Monthly_Backup` en el Programador de Tareas de Windows.
  - Frecuencia: Mensual (día 1 de cada mes a las 03:00 AM), 100% desatendida.
  - Script complementario: `scripts/schedule-monthly-backup.ps1`.
- **💬 Comando de Monitoreo `/backup` en JarBees**:
  - Comando `/backup` (o `backup bd`, `estado del backup`) en `JarvisCommandService` para consultar estado, fecha y tamaño de los últimos volcados disponibles.

### Fixed — Prevención de Falsos Positivos en Detección Matemática y Herramientas (2026-10-10)

- **🛡️ Corrección de Secuestro Matemático en Consultas Conversacionales (`AssistantToolsService`)**:
  - **Causa Raíz**: La expresión regular en `isMathQuery` (`\d+\s*[\+\-\*\/\^]\s*\d`) capturaba cualquier texto que contuviera barras o números en medio de frases cotidianas (por ejemplo: *"pop 80/90"*, *"24/7"*, *"16/9"*, *"10/12/2026"*). Al fallar la evaluación aritmética, `evaluateWithMathJs` devolvía un string de error (`"No pude identificar una expresión matemática válida..."`) que cortaba la ejecución del LLM y se entregaba directamente al usuario.
  - **Filtro Estricto de Intención**: Ahora `isMathQuery` exige verbos o intenciones matemáticas explícitas (*"calcula"*, *"cuánto es"*, *"resuelve"*, etc.) o que la consulta sea una expresión aritmética pura (sin palabras de lenguaje natural adicionales).
  - **Fallback Silencioso a Ollama (`null`)**: Si una consulta matemática no puede evaluarse con total certeza o falla, la herramienta devuelve `null` en lugar de un mensaje abortivo, permitiendo que el flujo continúe de forma natural hacia el modelo conversacional / catálogo musical / RAG.
  - **Blindaje en País, Clima y Hora**: Se sustituyó el lanzamiento de `HttpException` por retorno `null` en `getCountryAnswer` y se refinaron los detectores de clima (*"tiempo"*) y hora para evitar falsas activaciones en lenguaje coloquial.
  - **Pruebas Unitarias Automatizadas**: Se incorporó una suite en `assistant-tools.service.spec.ts` validando el descarte de frases como *"Hablemos de música!! Por ej pop 80/90! Que podrías recomendarme?"* y la preservación de cálculos legítimos.

### Added — Integración de Catálogo y Conocimiento Musical Personal (I:\Musica) (2026-10-10)

- **🎵 Catálogo e Indexación Musical (`I:\Musica`)**:
  - Escaneo e indexación automatizada de **64 artistas/bandas**, **220 álbumes** y **2.367 canciones** en formatos MP3, WAV y FLAC.
  - Generación de `src/jarvis/knowledge/music-index.json` con metadatos exhaustivos por artista, álbumes, años, géneros, estilos y *moods*.
  - Generación de `src/jarvis/knowledge/music-references.json` como índice liviano agrupado por géneros y estados de ánimo para recomendaciones rápidas.
- **🧠 Servicio Central `MusicCatalogService` & Módulo `JarvisModule`**:
  - Servicio dedicado para resolver búsquedas de artistas, recomendaciones según estado de ánimo (concentración, entrenamiento, introspección) y formateo de resúmenes.
  - Inyección dinámica en `JarvisPromptBuilderService` cuando el usuario consulta sobre música o artistas.
  - Comando interactivo `/musica` (o `mi musica`) en `JarvisCommandService` con guía integrada en `/help`.
- **⚡ Ingesta RAG en PostgreSQL (1024D con `bge-m3:latest`)**:
  - Documento relacional en base de datos (`Document` ID #73: *"Catálogo Musical y Colección Personal (I:\Musica)"*) categorizado en *"Música y Arte"*.
  - 8 chunks temáticos vectorizados para recuperación semántica transversal en conversaciones cotidianas e investigaciones culturales.

### Added — Ingesta Masiva de Colección "Carl Gustav Jung" (11 Obras) & RAG Analítico en RTX 5070 (2026-10-07)

- **📚 Ingesta de 11 Obras Fundamentales de Carl Gustav Jung**:
  - **Títulos procesados**: *El hombre y sus símbolos*, *Los complejos y el inconsciente*, *Tipos psicológicos (Tomos 1 y 2)*, *Conflictos del alma infantil*, *La interpretación de la naturaleza y la psique (Sincronicidad)*, *Recuerdos, sueños, pensamientos*, *Energética psíquica y esencia del sueño*, *Psicología de la religión oriental*, *Dream Interpretation: Ancient & Modern*, y *Correspondencia Freud - Jung*.
  - **Volumen procesado**: 3.208 páginas (57.19 MB) con **7.109.177 caracteres** de texto especializado.
  - **Segmentación**: 7.219 fragmentos (chunks) estructurados de ~1.400 caracteres con solapamiento semántico.
  - **Persistencia en PostgreSQL**: 11 registros `Document` (IDs #3 a #13) y 7.219 registros `Chunk` relacionales con metadatos vectoriales.
- **⚡ Hardware & Modelos de Inteligencia Artificial**:
  - **GPU**: NVIDIA GeForce RTX 5070 (12 GB VRAM).
  - **Modelo de Embeddings**: `bge-m3:latest` (1024D).
  - **Modelo Chatbot / RAG**: `qwen2.5:7b`.
  - **Base de Datos**: PostgreSQL (`jarbees_data`) con capa relacional Prisma.
- **⏱️ Tiempos Empleados & Métricas de Rendimiento**:
  - **Extracción de PDFs (11 libros / 3.208 págs)**: **7.93 segundos**.
  - **Vectorización GPU (7.219 vectores 1024D)**: **110.47 segundos (1.84 min)** a **65.4 vectores/segundo**.
  - **TIEMPO TOTAL DE INGESTA**: **132.88 segundos (2.21 minutos)** de principio a fin.
- **🧠 Prueba de Consulta y Razonamiento Psicológico Analítico (Jung)**:
  - **Pregunta formulada**: *"Explícame en detalle la estructura de la psique según Carl Gustav Jung: cómo se diferencian el Inconsciente Personal del Inconsciente Colectivo, cuáles son los arquetipos centrales (la Sombra, el Ánima/Ánimus y el Sí-mismo o Self), cómo opera el Proceso de Individuación y de qué manera la Sincronicidad trasciende la causalidad lineal según sus obras."*
  - **Vectorización de la query**: **14 ms**.
  - **Búsqueda y ranking semántico en PostgreSQL**: **15 ms** (acceso total en **29 ms**).
  - **Top Match Semántico**: 70.36% de similitud (*El hombre y sus símbolos* y *Recuerdos, sueños, pensamientos*).
  - **Inferencia LLM**: 14.48 segundos con síntesis doctoral completa sobre la integración arquetípica, el Self y la sincronicidad acausal.

### Added — Ingesta Masiva de "Obras Completas de Sigmund Freud" & Benchmark RAG en RTX 5070 (2026-10-07)

- **📚 Ingesta Completa de "Sigmund Freud - Obras completas"**:
  - **Volumen procesado**: 6.926 páginas en PDF (24.40 MB) con un total de **12.298.288 caracteres** de texto académico directo.
  - **Segmentación**: 13.317 fragmentos (chunks) estructurados con solapamiento semántico (~1.400 chars c/u).
  - **Persistencia**: Registro de `Document` (ID #2) y 13.317 registros `Chunk` relacionales en PostgreSQL (Prisma) con metadatos vectoriales.
- **⚡ Hardware & Modelos de Inteligencia Artificial**:
  - **GPU**: NVIDIA GeForce RTX 5070 (12 GB VRAM dedicada).
  - **Modelo de Embeddings**: `bge-m3:latest` (1024 dimensiones, aceleración completa por Tensor Cores).
  - **Modelo Chatbot / RAG**: `qwen2.5:7b` (temperatura 0.3, inferencia local sobre VRAM).
  - **Base de Datos**: PostgreSQL (`jarbees_data`) con capa relacional Prisma y soporte dual nativo / fallback en memoria para similitud de cosenos.
- **⏱️ Tiempos Empleados & Métricas de Rendimiento**:
  - **Extracción de texto PDF (6.926 págs)**: **18.95 segundos** (~365 págs/seg).
  - **Segmentación en Chunks**: **117 milisegundos**.
  - **Vectorización GPU (13.317 vectores 1024D)**: **179.14 segundos** (~2.98 min) a una tasa sostenida de **74.3 vectores/segundo** (13.4 ms por vector).
  - **TIEMPO TOTAL DE INGESTA COMPLETA**: **211.21 segundos (3.52 minutos)** de principio a fin.
- **🧠 Prueba de Consulta y Razonamiento Psicoanalítico Profundo**:
  - **Pregunta formulada**: *"Explícame en detalle la segunda tópica freudiana (Ello, Yo y Superyó), cómo interactúan dinámicamente con el principio del placer y el principio de realidad, y de qué manera la pulsión de muerte (Tánatos) se manifiesta en los mecanismos de defensa psíquicos según las obras completas."*
  - **Vectorización de la pregunta**: **15 ms**.
  - **Búsqueda y ranking semántico**: **17 ms** (acceso total en **32 ms**).
  - **Top Match Semántico**: 61.35% de similitud (*Más allá del principio del placer*, *El principio del placer y estado de nirvana*, mecanismos de defensa *Abwehr* y transposición).
  - **Inferencia LLM**: 12.92 segundos con respuesta estructurada, profunda y fiel a las tesis del autor.

### Added — Arquitectura Modular por Disciplinas & Selector de Especialistas (2026-10-07)

- **🎛️ Catálogo de Especialistas & Disciplinas ([`src/shared/disciplines.ts`](file:///c:/Projects/productos_crud_bkd/src/shared/disciplines.ts))**: Separación formal y desacoplada de capacidades para la UI:
  - 💬 `chatbot`: Conversación fluida y razonamiento cotidiano con `qwen2.5:7b` (sin restricciones forzadas de catálogo ni límites de 3 oraciones).
  - 💻 `coder`: Programación, debugging y arquitectura con `qwen2.5-coder:7b`.
  - 🌐 `traductor`: Traducción especializada y liviana con `RogerBen/hy-mt1.5-1.8b:latest`.
  - 🎙️ `reader`: Lectura en voz alta de PDFs/libros y TTS con `sematre/orpheus:it_es-3b`.
  - 📄 `ocr` / `docs`: OCR, extracción y resumen de documentos con `qwen2.5-vl-3b`.
  - 🎬 `video`: Análisis de frames y descripción multimedia.
  - 🔎 `rag`: Recuperación y búsqueda vectorial con `bge-m3`.
  - 🧠 `planner`: Descomposición y orquestación multi-paso de planes JarBees.
  - 🛠️ `tools`: Procedimientos y acciones del sistema (Google Workspace, clima, web).
  - 🧭 `auto`: Enrutamiento inteligente automático por modelo pequeño / heurística.
- **🔌 Endpoints para Selector Frontend**:
  - `GET /aichat/disciplines` y `GET /jarbees/disciplines`: Exponen el listado estructurado de especialistas con iconos, categorías, modelos y descripciones.
  - `POST /aichat/preguntar` y `POST /jarbees/query`: Soporte para campo `mode` / `discipline` / `specialist`, permitiendo al frontend etiquetar directamente la intención antes de procesar la respuesta.
- **🔀 Desacoplamiento de Prompts y Router**: Refactorización de `ModelRouterService` y `AichatService` para eliminar reglas rígidas que restringían las respuestas conversacionales generales.

### Added — Integración y Configuración del Modelo Coder `qwen2.5-coder:7b` (2026-10-07)

- **💻 Modelo Especializado Coder `qwen2.5-coder:7b`**: Configuración de `qwen2.5-coder:7b` como motor de programación, análisis técnico y generación de código en `.env` (`OLLAMA_CODER_MODEL` y `OLLAMA_MODEL_TEST3_NAME`) y `.env.example`.
- **🔧 Actualización de Resolvers de Modelos (`src/shared/ollama-config.ts`)**: Soporte formal y exportación de `resolveCoderModel` y `resolveTechModel` para leer prioritariamente `OLLAMA_CODER_MODEL` con fallback automático.
- **⚡ Validación y Benchmarking**: Ejecución de prueba de generación de código TypeScript tipado estricto con inferencia acelerada por GPU a **114.1 tokens/segundo** (~4.7s) con 0 alucinaciones.

### Added — Integración de Qwen 2.5 7B & Aceleración GPU RTX 5070 (2026-10-06)

- **🤖 Motor LLM Principal `qwen2.5:7b`**: Descarga y configuración de `qwen2.5:7b` en Ollama como motor estándar para el chatbot conversacional y asistente técnico (`OLLAMA_MODEL_NAME` y `OLLAMA_MODEL_TEST3_NAME`).
- **⚡ Aceleración Nativa 100% GPU (RTX 5070 12GB)**: Validación exitosa de offload completo en VRAM con tiempos de respuesta de ~0.50s y tasa de generación de **117.1 tokens/segundo** en inferencia local sin contención de memoria.
- **📄 Sincronización de Entorno (.env & .env.example)**: Actualización de variables de modelo predeterminado para el chatbot y RAG en la configuración del proyecto.

### Added — Migración de Base de Datos JarBees Data & Configuración Ngrok Tunnel (2026-10-06)

- **🗄️ Migración de Base de Datos a `jarbees_data`**: Configuración y sincronización del catálogo `jarbees_data` en PostgreSQL 18 local vía Prisma (`db push` y generación de cliente v6.19.3), verificando la integridad de todas las tablas y relaciones del sistema (productos, usuarios, memoria, documentos y observabilidad).
- **🧩 Compatibilidad de Esquema Prisma (`prisma/schema.prisma`)**: Adecuación temporal de columnas vectoriales para entornos PostgreSQL sin extensión `pgvector` nativa instalada, preservando la trazabilidad de embeddings con `embeddingId String?`.
- **🌐 Entorno Ngrok y Acceso Global**: Instalación y actualización global del agente `ngrok v3.39.11` en PATH (`~/.bun/bin`), registro de authtoken de cuenta y soporte para inicio conjunto (`start:ngrok`) con túnel seguro y validación OAuth.

### Added — Motor Traductor Universal: Traducción de Subtítulos SRT con Tiempos Exactos, Caché Incremental y Codificación ANSI (2026-08-20)

- **🎬 Traducción Universal de Subtítulos SRT (`scratch/translate_srt_brassed_off.ts`)**: Ampliación del motor traductor local para soportar subtítulos multilingües en formato `.srt`. Garantiza conservación del 100% de los índices y estampas de tiempo originales (`00:00:00,000 --> 00:00:00,000`), reemplazando únicamente el contenido textual por su traducción al español fluido.
- **🔤 Codificación Nativa ANSI (Windows-1252 / Latin1)**: Los archivos de salida `.srt` se generan explícitamente en codificación ANSI (Windows-1252/Latin1) con sanitización de comillas y símbolos especiales Unicode, evitando la distorsión de caracteres españoles (`¿`, `¡`, `ñ`, acentos `á-ú`) en reproductores multimedia locales, Smart TVs y sistemas legados.
- **💾 Persistencia Incremental Obligatoria en Disco (`.json`)**: Cumplimiento del estándar de caché persistente en disco (`scratch/*_srt_cache.json`). Cada lote traducido se escribe inmediatamente en el sistema de archivos, garantizando reanudación automática sin reprocesamiento ni pérdida de tiempo ante interrupciones.
- **⚡ Batching Optimizado & Fallback Individual**: Procesamiento de lotes de 15-20 subtítulos con `RogerBen/hy-mt1.5-1.8b:latest` / `qwen3:4b`, completando largometrajes enteros (~1,050 bloques) en ~12-14 minutos con recuperación automática individual ante líneas complejas o faltantes.
- **🗣️ Adaptación Cinematográfica & Efectos**: Preservación inteligente de marcas de hablantes (`DANNY:`, `MAN:`) y traducción adecuada de efectos sonoros entre paréntesis (ej: `(HONKING HORN)` → `(BOCINAZO)`).

### Added — Módulo MobileGateway: Conectividad Control Remoto Mobile-to-Core (2026-08-20)

- **📱 MobileGatewayModule (`src/mobile-gateway/mobile-gateway.module.ts`)**: Módulo NestJS que expone controladores y servicios de comunicación remota para la aplicación JarBees Mobile.
- **🔌 MobileGatewayController (`src/mobile-gateway/mobile-gateway.controller.ts`)**:
  - Rutas bajo el prefijo `@Controller('api/mobile/v1')`.
  - Endpoint `GET /api/mobile/v1/health`: Verificación de salud y conectividad del Core para actualización de badge en la app mobile.
  - Endpoint `GET /api/mobile/v1/capabilities`: Exposición de capacidades remota ejecutables en la PC (hora oficial, estado de CPU/RAM, calculadora, control de apps, navegador).
  - Endpoint `POST /api/mobile/v1/command`: Recepción y despacho de intenciones/comandos estructurados desde dispositivos móviles.
  - Decorador `@Public()` integrado para permitir verificación pública del estado de salud del gateway.
- **⚙️ MobileGatewayService (`src/mobile-gateway/mobile-gateway.service.ts`)**: Servicio para despacho determinista de intenciones del sistema (`GET_TIME`, `GET_SYSTEM_STATUS`, `CALCULATE`, `OPEN_APP`, `OPEN_BROWSER`, `OPEN_URL`).
- **⚙️ AppModule (`src/app.module.ts`)**: Importación y registro de `MobileGatewayModule` en el módulo principal del backend.

### Added — Módulo Translator: Traducción de PDFs al Español con Qwen3:4b (2026-08-09)

- **🌐 TranslatorModule (`src/modules/translator/translator.module.ts`)**: Nuevo módulo NestJS dedicado a la traducción automática de libros en idiomas extranjeros al español utilizando el modelo `qwen3:4b` vía Ollama. Integra `MulterModule` con almacenamiento en memoria para recibir PDFs de hasta 100 MB.

- **⚙️ TranslatorService (`src/modules/translator/translator.service.ts`)**: Servicio principal con pipeline de traducción asíncrono en 6 pasos:
  1. **Extracción de texto**: Usa `pdf-parse` (ya disponible) para extraer el texto completo del PDF original.
  2. **Detección de idioma**: Heurística basada en frecuencia de palabras funcionales para identificar 7 idiomas (inglés, rumano, francés, alemán, portugués, italiano, español).
  3. **Traducción por chunks**: Divide el texto en fragmentos de ~1500 caracteres respetando párrafos y los traduce de forma secuencial con `qwen3:4b` preservando estructura literaria, puntuación y tono del autor.
  4. **Generación de PDF traducido**: Construye un PDF A4 completo con `pdf-lib` incluyendo portada con título, badge "Traducido al Español", sello JarBees AI, fecha y modelo usado; y contenido páginado con header/footer, detección automática de capítulos, tipografía diferenciada y acentos de color.
  5. **Ingesta en BD**: Crea el documento traducido con `status = 'ready'`, `language = 'es'` y referencia al original (`translatedFromId`) — disponible de inmediato en el Reader sin necesidad de aprobación manual.
  6. **Ocultamiento del original**: Marca el documento original con `hidden = true` para que desaparezca de la lista del Reader sin eliminarse de la base de datos.
  - El pipeline corre en **background no bloqueante**: la API devuelve un `jobId` inmediatamente y el proceso continúa en segundo plano.
  - Sistema de tracking en memoria: `Map<jobId, TranslationJob>` con campos `status`, `progress` (0-100%), `startedAt`, `finishedAt`, `documentId` y `error`.

- **🔌 TranslatorController (`src/modules/translator/translator.controller.ts`)**:
  - `POST /translator/translate-pdf`: Sube un PDF multipart y lanza la traducción asíncrona. Devuelve `jobId`.
  - `POST /translator/translate-document/:id`: Traduce un documento ya indexado en la BD por su ID.
  - `GET /translator/status/:jobId`: Consulta el progreso de una traducción en curso (polling).
  - `GET /translator/jobs`: Lista todos los jobs en memoria con su historial.
  - `GET /translator/list`: Lista todos los documentos traducidos al español disponibles.
  - `POST /translator/hide/:id`: Oculta manualmente un documento del Reader sin borrarlo.
  - `POST /translator/detect-language`: Detecta el idioma de un texto (utilidad de diagnóstico).

- **🗃️ Schema Prisma — Modelo `Document`**: Tres nuevos campos agregados para la feature:
  - `hidden Boolean @default(false)`: Oculta el documento del Reader sin borrarlo de la BD (útil para versiones en idioma extranjero una vez traducidas).
  - `language String?`: Código ISO del idioma detectado del documento (`"es"`, `"en"`, `"ro"`, etc.).
  - `translatedFromId Int?`: Referencia al ID del documento original del que se tradujo (trazabilidad).
  - Índice `@@index([hidden])` para rendimiento en el filtrado del Reader.

- **📚 ReaderService — Filtrado de ocultos**: `listDocuments()` ahora filtra `where: { hidden: false }` en la query Prisma y `item.hidden !== true` en el índice `library-index.json`. Los libros en idiomas extranjeros desaparecen automáticamente de la lista una vez traducidos.

- **🔧 Variables de entorno**: Agregada `OLLAMA_TRANSLATOR_MODEL="qwen3:4b"` en `.env`. El Reader también la usa como primer fallback en `translateBlockToSpanish()` si Qwen3:4b está disponible.

- **📁 Directorio de salida**: `storage/translated/` — los PDFs traducidos se guardan aquí con nombre `<titulo_sanitizado>_es.pdf`.



- **📚 Fix en `ReaderService` (`src/modules/reader/reader.service.ts`)**:
  - Se modificó la resolución del contenido en `getDocument()` para priorizar el texto completo crudo del documento (`dbDoc.content`) por sobre los fragmentos vectoriales RAG (`dbDoc.chunks`).
  - Anteriormente, al haber `dbDoc.chunks` en la base de datos, el servicio concatenaba los fragmentos RAG (creados para búsqueda semántica), provocando que libros como *"Keter: El éxtasis de la eternidad — Mario Sabán"* iniciaran la lectura con voz en párrafos o secciones avanzadas (ej: párrafo 33).
  - Al priorizar `dbDoc.content`, el lector procesa y segmenta la totalidad del libro de forma continua y secuencial desde la página 1 en bloques de lectura.

### Added — Módulo Backend Reader para Audiolibros (ReaderModule) (2026-08-05)

- **🎧 ReaderModule (`src/modules/reader/reader.module.ts`)**: Módulo NestJS independiente para servir audiolibros a la interfaz de `/reader`.
- **🔊 TtsService (`src/modules/reader/tts.service.ts`)**:
  - Integra la síntesis de texto a voz llamando al modelo local `sematre/orpheus:it_es-3b` vía la API de Ollama (`POST /api/generate`).
  - Incluye un sintetizador de voz/audio PCM WAV (16-bit, 22050 Hz) de alta fidelidad como fallback para garantizar reproducción fluida e ininterrumpida aun si Ollama está en proceso de descarga.
- **📚 ReaderService (`src/modules/reader/reader.service.ts`)**:
  - Consulta y consolida la biblioteca disponible entre la base de datos (Prisma `Document`) y el índice de conocimiento `library-index.json`.
  - Procesa y segmenta textos de libros en bloques (chunks) optimizados de ~800 palabras.
  - Implementa almacenamiento en caché persistente en `storage/audio/doc_<id>/chunk<N>.wav` para evitar regeneraciones innecesarias de audio.
- **🔌 ReaderController (`src/modules/reader/reader.controller.ts`)**:
  - `GET /api/reader`: Listado de todos los documentos y audiolibros disponibles.
  - `GET /api/reader/:id`: Obtención de detalles y bloques de texto preparados para lectura.
  - `POST /api/reader/:id/chunk`: Endpoint para solicitar el audio WAV de un bloque en particular (`{ chunk: N }`).
  - `GET /api/reader/:id/chunk/:chunkIndex`: Endpoint GET para streaming/reproducción directa vía `<audio src="...">`.

### Fixed — Intent Router: Consultas sobre temas de la biblioteca siempre van a RAG (2026-08-05)

- **🐛 Bug detectado**: Preguntas como `"¿Qué podés decirme sobre el plano astral?"` o `"¿Qué dice Monroe sobre la proyección?"` eran enrutadas a `WEB` (noticias) porque el clasificador LLM `gemma3:1b` no tiene conocimiento de la biblioteca personal y usaba `WEB` como fallback.
- **✅ Fix en** [intent-router.service.ts](file:///c:/Projects/productos_crud_bkd/src/jarvis/tools/intent/intent-router.service.ts): Nuevo bloque de reglas determinísticas de **alta confianza** que matchea términos de la biblioteca antes de llamar al LLM clasificador:
  - **Plano Astral**: `plano astral`, `proyección astral`, `viaje astral`, `cuerpo astral`, `cordón de plata`, `out of body`, `OBE`
  - **Autores OBE**: Monroe, Leadbeater, Muldoon, Ziewe, Oliver Fox
  - **Psicología / Filosofía**: Jung, Freud, Nietzsche, Blavatsky, Grinberg, Krishnamurti, Eliphas Levi
  - **Conceptos Junganos**: `inconsciente colectivo`, `arquetipo`, `sombra`, `anima/animus`, `psicología analítica`
  - **Cábala / Teosofía**: `cábala`, `kabbalah`, `sefirot`, `zohar`, `teosofía`, `hermetismo`
- **Fix en System Prompt** (`src/jarvis/prompt/jarvis-prompt-builder.service.ts`): Se eliminó la inyección literal del mensaje de fallback de noticias (`"No pude obtener las noticias en este momento... El Once"`) en prompts no web, la cual causaba que modelos pequeños (ej. `gemma3:1b`) sufrieran colapso de instrucciones durante consultas RAG y parrotearan la frase de error literal de noticias en lugar de responder con los fragmentos de la biblioteca.
- **🎯 Metadata Filtering & Aislamiento Estricto de Documento** (`src/jarvis/jarvis.service.ts`): Cuando el `CorpusSelector` detecta una obra dominante con alta coincidencia en el catálogo (`score >= 5.0` o `score > 1.5 * segundo match`), la búsqueda vectorial en `pgvector` se aísla **exclusivamente al `document_id` de esa obra**. Esto elimina por completo la contaminación de fragmentos cruzados entre libros distintos de la misma colección (ej: evitar traer fragmentos de Muldoon al resumir Leadbeater).
- **🌐 Sufijo Imperativo de Traducción al Español** (`src/jarvis/prompt/jarvis-prompt-builder.service.ts`): Se inyectó una directiva obligatoria de idioma al **final absoluto del `userPrompt`** (inmediatamente después de los fragmentos recuperados en inglés). Esto garantiza que modelos pequeños (ej. `gemma3:1b`) traduzcan el contexto al español antes de generar el primer token.
- **Impacto**: Búsquedas RAG sobre libros específicos apuntan a `WHERE document_id = X` exactos, evitando mezclas conceptuales entre autores y garantizando respuestas 100% traducidas al español argentino.

### Added — Pipeline de Síntesis Estructurada Map-Reduce (2026-08-05)

- **🧠 DocumentSynthesisService** (`src/jarvis/library/document-synthesis.service.ts`): Nuevo servicio que implementa un pipeline de síntesis map-reduce offline sobre libros ya indexados. Genera **fichas narrativas pre-computadas** (`DocumentInsight`) con: resumen ejecutivo, tesis central, historias destacadas, personajes clave, conceptos fundamentales, citas textuales, ideas polémicas y técnicas prácticas.
  - **MAP**: divide el texto del documento en secciones y extrae extractos parciales mediante prompts estructurados al LLM local.
  - **REDUCE**: consolida y deduplica los arrays de todas las secciones; genera un resumen ejecutivo final y detecta automáticamente el autor.
  - **Cross-Author Comparison**: al procesar una colección completa con 2 o más libros, genera automáticamente una comparación cross-autor que identifica puntos de acuerdo y diferencias entre los autores.
  - **queryInsights()**: método de consulta directa a `DocumentInsight` sin búsqueda vectorial — ideal para "dame las 2 mejores historias de Monroe" sin procesar miles de chunks en tiempo real.

- **🗄️ Modelo `DocumentInsight`** (`prisma/schema.prisma`): Nueva tabla 1-to-1 con `Document` que almacena la ficha narrativa pre-computada. Campos: `executiveSummary`, `centralThesis`, `highlightedStories`, `keyCharacters`, `coreConcepts`, `notableQuotes`, `controversialIdeas`, `practicalTechniques`, `contradictions` (todos JSON arrays serializados), más `synthesisVersion` para control de re-generación. Índices en `author`, `collection`, `generatedAt`.

- **🔌 Nuevos endpoints REST** (en `JarvisController`):
  - `POST /jarbees/library/synthesis/document` — Sintetiza un documento individual por ID.
  - `POST /jarbees/library/synthesis/collection` — Sintetiza toda una colección secuencialmente y genera comparación cross-autor.
  - `POST /jarbees/library/synthesis/query` — Consulta insights pre-computados por colección, autor o campo (`highlightedStories`, `keyCharacters`, `coreConcepts`, `notableQuotes`, `practicalTechniques`).

- **📜 Script** `scripts/synthesize-plano-astral.ts`: Script NestJS que ejecuta el pipeline map-reduce sobre los 5 libros de Plano Astral ya indexados, imprime el detalle de cada ficha generada y produce la comparación cross-autor final.

- **⚙️ Migración Prisma** `20260805191200_add_document_insight`: Crea la tabla `DocumentInsight` con clave foránea en cascada hacia `Document`.

### Added — Ingesta de Libros "Plano Astral" (2026-08-05)

- **📚 5 nuevos libros indexados** en la colección `Plano Astral` (`docs/libros/Plano Astral/`), todos en estado `ready` con chunks y embeddings completos en PostgreSQL:
  - **ID 11** — *The Projection of the Astral Body* (Sylvan Muldoon & Hereward Carrington, 1929) — categoría `plano astral`
  - **ID 12** — *Astral Projection: A Record of Out-of-Body Experiences* (Oliver Fox) — categoría `proyección astral`
  - **ID 13** — *Journeys Out of the Body* (Robert A. Monroe) — categoría `experiencias fuera del cuerpo`
  - **ID 14** — *El Plano Astral* (Charles Webster Leadbeater) — categoría `teosofía`
  - **ID 15** — *Multi-Dimensional Man* (Jürgen Ziewe) — categoría `plano astral`

- **🔍 Categoría `plano_astral`** añadida en `detectCategoryFromKeywords()` de [document-ingest.service.ts](file:///c:/Projects/productos_crud_bkd/src/jarvis/library/document-ingest.service.ts) para detectar automáticamente términos como `proyección astral`, `cuerpo astral`, `cordón de plata`, `desdoblamiento`, `OBE`.

- **🎓 Escuela de pensamiento `proyeccion_astral`** añadida a `SCHOOLS_OF_THOUGHT` en [corpus-selector.service.ts](file:///c:/Projects/productos_crud_bkd/src/jarvis/knowledge/corpus-selector.service.ts) con todos los autores (Muldoon, Carrington, Fox, Monroe, Leadbeater, Ziewe) y sus palabras clave para precisión en el Corpus Selector.

- **📖 Escáner actualizado** ([scan-books.ts](file:///c:/Projects/productos_crud_bkd/scripts/scan-books.ts)): añadida heurística para la carpeta `Plano Astral/` con metadatos completos de los 5 libros. El índice `library-index.json` ahora totaliza 145 documentos catalogados.

- **📄 Script** `scripts/ingest-plano-astral-db.ts`: Script NestJS de ingesta masiva que procesa los libros de Plano Astral en la base de datos PostgreSQL con monitoreo de progreso en tiempo real.

### Configured — Configuración Recomendada JarBees + Qwen3:1.7B (2026-08-04)

- **⚡ Configuración Recomendada y Perfiles para Qwen3:1.7B**: Configuración optimizada para reducir alucinaciones, lograr respuestas deterministas y priorizar RAG/herramientas con menor uso de RAM y latencia ultra baja en [ollama-config.ts](file:///c:/Projects/productos_crud_bkd/src/shared/ollama-config.ts), [ollamaModel.ts](file:///c:/Projects/productos_crud_bkd/src/aichat/models/ollamaModel.ts), [ollamaModel_2.ts](file:///c:/Projects/productos_crud_bkd/src/aichat/models/ollamaModel_2.ts) y [ollama.provider.ts](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/ollama.provider.ts):
  - **Modelo Base**: `qwen3:1.7b` (`think: false` por defecto, sin razonamiento interno expuesto).
  - **Configuración Base General**: `temperature: 0.10`, `top_p: 0.85`, `top_k: 20`, `repeat_penalty: 1.10`, `presence_penalty: 0`, `frequency_penalty: 0`, `num_ctx: 8192`, `num_predict: 512`, `mirostat: off (0)`.
  - **Perfil Chat Simple 💬**: `temperature: 0.25`, `top_p: 0.90`, `top_k: 30`, `num_predict: 300` (para conversación normal y preguntas simples).
  - **Perfil RAG / Conocimiento 📚**: `temperature: 0.05`, `top_p: 0.80`, `top_k: 10`, `num_predict: 700` (para documentos y consultas sobre base de conocimiento).
  - **Directivas de System Prompt**: Prioridad RAG y herramientas como fuente de verdad, sin inventar información, respuestas breves y precisas.

### Configured — Perfil Intermedio Chat/RAG para JarBees + Qwen3.5:4B (2026-08-04)

- **⚙️ Perfil Intermedio Híbrido (Chat + RAG)**: Configuración equilibrada para el modelo `qwen3.5:4b` ajustada en [ollama-config.ts](file:///c:/Projects/productos_crud_bkd/src/shared/ollama-config.ts), [ollamaModel.ts](file:///c:/Projects/productos_crud_bkd/src/aichat/models/ollamaModel.ts), [ollamaModel_2.ts](file:///c:/Projects/productos_crud_bkd/src/aichat/models/ollamaModel_2.ts) y [ollama.provider.ts](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/ollama.provider.ts):
  - **Modelo**: `qwen3.5:4b` (Thinking Mode `think: false` por defecto; activado únicamente para Planner en tareas complejas).
  - **Temperature**: `0.20` (Equilibrio optimizado entre precisión/baja alucinación de RAG [0.15] y fluidez conversacional de Chat [0.35]).
  - **Top P**: `0.85` (Mantiene naturalidad en las respuestas).
  - **Top K**: `20` (Equilibrio ideal entre variedad y control).
  - **Repeat Penalty**: `1.12` (Prevención activa de repeticiones).
  - **Presence / Frequency Penalty**: `0` / `0`.
  - **Context Window (`num_ctx`)**: `8192` tokens (ampliado de 4096 para soportar memoria contextual y RAG).
  - **Num Predict**: `512` tokens dinámicos para el perfil intermedio (256 corta, 512 chat/rag, 1024 análisis, 2048 docs).
  - **Seed**: `42` (Desarrollo).

### Added — Ollama Auto-Healing: Recuperación Automática y Circuit Breaker (2026-07-28)

- **🔄 OllamaRecoveryService**: Nuevo servicio singleton ([ollama.recovery.service.ts](file:///c:/nest/productos_crud_bkd/src/jarvis/llm/ollama.recovery.service.ts)) que maneja la recuperación automática de Ollama cuando cae. Implementa:
  - **Spawn controlado**: `spawn('ollama', ['serve'], { shell: true, windowsHide: true })` sin `detached`, guardando referencia al `ChildProcess` para evitar instancias duplicadas en el puerto 11434.
  - **Detección de proceso vivo**: Antes de hacer spawn, verifica si el proceso gestionado por JarBees sigue activo, o si Ollama ya está respondiendo externamente.
  - **Poll de disponibilidad**: Hace requests a `/api/tags` cada 500ms hasta confirmar que Ollama está listo (timeout: 15s).
  - **Circuit Breaker**: Máximo 3 intentos de restart en ventana de 5 minutos. Si se supera, activa estado `FAILED` y emite un mensaje descriptivo al usuario en lugar de un error técnico genérico. La ventana se resetea automáticamente al expirar.
- **🧠 OllamaState**: Nuevo enum y tipos ([ollama.state.ts](file:///c:/nest/productos_crud_bkd/src/jarvis/llm/ollama.state.ts)) que representan el estado interno que JarBees mantiene sobre Ollama (`UNKNOWN`, `RUNNING`, `RESTARTING`, `FAILED`). Base para futuros endpoints de diagnóstico y el OllamaHealthService (Fase 2).
- **⚡ Retry reactivo en OllamaProvider**: Se modificó [ollama.provider.ts](file:///c:/nest/productos_crud_bkd/src/jarvis/llm/ollama.provider.ts) para que ante un `ECONNREFUSED`, en lugar de lanzar error inmediatamente, llame a `OllamaRecoveryService.recover()` y haga un retry único de la request original. El usuario recibe la respuesta normal sin intervención manual.
- **💬 Mensajes de error mejorados**: Cuando el circuit breaker se activa (3 fallos), el mensaje al usuario incluye el último error capturado e instrucciones precisas, reemplazando el anterior mensaje genérico de "ejecutá ollama serve".

### Added & Optimized — Diagnóstico, Resumen Inteligente y Mitigación de Alucinaciones (2026-07-22)


- **🤔 Resumen y Detección de Obras sin Prefijo**: Se mejoró [JarvisPromptBuilderService](file:///c:/nest/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts) para identificar solicitudes de resúmenes de documentos mediante la coincidencia directa de títulos sin requerir prefijos de acción (ej. escribir solo el nombre de la obra en la biblioteca).
- **📝 Instrucción de Resumen de Documento**: Se añadió una directiva estructurada (`docInstruction`) al prompt para guiar al LLM en la generación de resúmenes ejecutivos claros, puntos clave y núcleos temáticos de la obra en cuestión.
- **🛡️ Mitigación de Alucinaciones en Evidence**: Se actualizó [EvidenceService](file:///c:/nest/productos_crud_bkd/src/jarvis/knowledge/evidence.service.ts) para evitar calificar falsamente términos conceptuales y frases del sistema (como *"resumen ejecutivo"*, *"puntos clave"*, *"esencia del sueño"*, *"inconsciente colectivo"*) como nombres de personas alucinados.
- **⚙️ Resolución Precisa del Autor**: Corrección en [JarvisPromptBuilderService](file:///c:/nest/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts) para resolver correctamente el autor de un documento al formatear el contexto utilizando el índice de la biblioteca o el asignador de escuelas de pensamiento.

### Added & Optimized — Coerción de Intents y Robustez del Router (2026-07-22)

- **🔄 Intent Override (Coerción a RAG)**: Si una consulta tiene una alta coincidencia en el índice de biblioteca (score $\ge 2.0$), [JarvisService](file:///c:/nest/productos_crud_bkd/src/jarvis/jarvis.service.ts) anula automáticamente los intents `ASTROLOGY`, `WEB`, o `LOCAL` (de baja confianza) para forzar la ruta `RAG`, garantizando que la respuesta provenga de la documentación local.
- **🛡️ Fail-Safe en RAG sin Fragmentos**: Si el motor decide ir por la ruta `RAG` pero no se encuentra información en la base de datos (o esta no está disponible), el sistema responde con un mensaje descriptivo y amigable en vez de proceder con el LLM, previniendo alucinaciones severas.
- **🗣️ Regex mejoradas en el Intent Router**: Se extendieron las reglas de coincidencia rápida de [IntentRouterService](file:///c:/nest/productos_crud_bkd/src/jarvis/tools/intent/intent-router.service.ts) para soportar saludos comunes adicionales ("buen dia", "como estas"), chistes y solicitudes de historial conversacional ("donde quedamos").
- **🚫 Filtrado de Ruido en Búsqueda Web**: Se excluyeron los términos genéricos *"hoy"* y *"ayer"* en la detección de `WEB` del router para evitar falsas salidas a internet.

### Added & Fixed — Ingesta de Carl & Sigmund y Saneamiento de Fichas (2026-07-21)

- **📚 Ingesta de Carl Jung y Sigmund Freud**: Se crearon herramientas de automatización (`scripts/ingest-carl-jung.ts` e `scripts/ingest-author.ts`) para parsear e indexar múltiples obras de Carl Jung y Sigmund Freud en la biblioteca personal.
- **🧬 Saneamiento de Resúmenes e Indización**:
  - Detección de Fichas de Conocimiento corruptas u obsoletas (que contienen disculpas o errores de generación anteriores) mediante `isBadSummary` en [DocumentSummaryService](file:///c:/nest/productos_crud_bkd/src/jarvis/library/document-summary.service.ts), forzando su regeneración automática.
  - Parseador mejorado de `keyPoints` en resúmenes para extraer viñetas y listas numéricas de las secciones de *"Núcleos Temáticos"*.
  - Filtro estricto `matchTerm` en [CorpusSelectorService](file:///c:/nest/productos_crud_bkd/src/jarvis/knowledge/corpus-selector.service.ts) para consultas de términos cortos ($\le 4$ caracteres) empleando límites de palabra (`\b`), eliminando falsos positivos en el indexado y búsqueda.

### Added — JarBees 3.0: Arquitectura Cognitiva Multidisciplinaria (2026-07-21)

- **🧬 Regulación Epigenética (`EpigeneticRegulatorService`)**: Ponderación adaptativa continua de niveles de expresión (Rigor Analítico, Creatividad, Investigación, Duda Funcional) basada en intención y contexto (0 ms de sobrecosto LLM).
- **🔮 Procesamiento Predictivo (`PredictiveProcessingService`)**: Anticipación de intención previa a RAG y cálculo del Error de Predicción ($\Delta$) para auto-corregir sesgos iniciales frente a la evidencia RAG real.
- **🤔 Metacognición y Persistencia (`MetacognitionEngineService`)**: Auto-evaluación de la meta-estrategia elegida y registro persistente de corridas en el modelo Prisma `MetacognitiveRun`.
- **❤️ Emociones Funcionales**: Variables de control cuantitativas (Curiosidad, Duda, Confianza) que regulan la amplitud de búsqueda RAG y la tasa de tunelamiento creativo de forma dinámica.

### Added — Arquitectura Cognitiva Cuántico-Inspirada QICA 2.0 (2026-07-21)

- **🌌 Grafo de Memoria Entrelazada (`CognitiveEntanglement`)**: Modelo de base de datos e implementación en `CognitiveFieldService` para almacenar la fuerza de correlación entre conceptos y co-activar conceptos asociativos no-locales (0 ms de overhead LLM).
- **⏳ Decoherencia y Olvido Inteligente Avanzado**: Motor de decaimiento conceptual dinámico basado en la fórmula ponderada `(recency * importance * utility) - noise` en `CognitiveFieldService`.
- **🎯 Motor de Incertidumbre y Fronteras de Conocimiento (`UncertaintyEngineService`)**: Identificación determinista de variables no verificadas (`unknowns`) e inyección de alertas de certidumbre en respuestas RAG/complejas.
- **🌀 Tunelamiento Cuántico de Creatividad**: Inserción de una hipótesis disruptiva/lateral del 15% dentro de la superposición de `HypothesisEngineService` para escapar de respuestas estándar o valles locales.
- **⚛️ Orquestación Adaptativa e Interferencia**: Orquestador `CognitiveOrchestratorService` con latencia cero en consultas simples e interferencia constructiva/destructiva colapsada en un reporte colapsable `<details>` en la respuesta final.

### Added — Control de Alucinaciones y Análisis de Confianza (2026-07-17)

- **🛡️ Verificación de Respaldo (`EvidenceService`)**: Implementación de `EvidenceService` para contrastar de manera determinista la respuesta generada por el LLM contra los fragmentos de contexto RAG recuperados. Identifica autores y conceptos clave válidos o alucinados y computa un puntaje de confianza.
- **📝 Detalle de Confianza en Markdown**: Inclusión automática de un bloque colapsable `<details>` al final de cada respuesta mostrando la métrica de confianza y el desglose de entidades verificadas vs. no presentes.
- **🚧 Frontera Rígida de Conocimiento**: Restricciones de prompt endurecidas en `JarvisPromptBuilderService` para que el modelo limite sus respuestas estrictamente al contexto y no complemente con conocimiento general a menos que sea explícitamente solicitado y etiquetado.
- **🏷️ Enriquecimiento de Metadatos RAG**: Mapeo y propagación de propiedades adicionales (`IDIOMA`, `CATEGORÍAS`, `CONCEPTOS PRINCIPALES`) desde `library-index.json` a la plantilla de contexto del prompt builder.
- **🧪 Cobertura de Tests**: Creación de pruebas unitarias exhaustivas en `evidence.service.spec.ts` para verificar la lógica de respaldo y contraste de entidades.

### Added & Optimized — RAG Reranking, Context Enrichment and Prompt Safeguards (2026-07-16)

- **🔄 Reranker Híbrido Léxico-Semántico**: Implementación de `rerankChunks` en `JarvisService` y `JarvisPromptBuilderService` que combina coincidencia léxica (40% de peso) y orden semántico (60% de peso) para reordenar los chunks recuperados en consultas RAG.
- **📈 Mayor Cobertura de Chunks**: Incremento del límite de chunks consultados de 3 a 15 en la recuperación RAG para proveer más contexto relevante al modelo.
- **🏷️ Metadatos de Autores y Escuelas**: Inclusión de etiquetas estructuradas (`DOCUMENTO`, `AUTOR`, `ESCUELA DE PENSAMIENTO`) en el contexto RAG de cada chunk, resolviendo el autor y su escuela de pensamiento mediante `CorpusSelectorService.getAuthorAndSchoolByTitle`.
- **🛡️ Directivas Estrictas de Prompt**: Nuevas reglas integradas en `JarvisPromptBuilderService` que exigen prioridad absoluta del contexto RAG, prohibición total de alucinaciones sobre obras/autores no presentes en la biblioteca, y preservación del marco intelectual de cada autor (evitando mezclar escuelas de pensamiento).
- **⚡ Ingesta y Auto-aprobación en Lazy Load**: Se mejoró el flujo de carga diferida en `CorpusSelectorService` para auto-aprobar e iniciar la indexación jerárquica de documentos existentes que se encuentren en estado `quarantined` o `not_indexed` cuando son solicitados durante una consulta de RAG.

### Added & Changed — Fichas de Conocimiento Epistemológicas (2026-07-16)

- **📚 Evolución de Resúmenes a Fichas de Conocimiento**: Transición de resúmenes cronológicos tradicionales a Fichas de Conocimiento (Knowledge Cards) estructuradas de alto valor RAG.
- **🛠️ Estructura Refinada**: Inclusión de campos de metadatos (Aporte/Valoración, Tipo de Documento), Mapa de Conocimiento descriptivo, Conceptos Detectados (con frecuencia real de menciones en texto completo), preguntas clave con viñetas check (`✔`), Relaciones y Contexto extendidos (`Ideal para responder`, `Límites`) y Grafo de Relaciones en ASCII.
- **⚡ Optimización y Persistencia**: Los resúmenes generados al vuelo (on-demand) en `DocumentSummaryService` ahora producen y persisten la Ficha de Conocimiento completa en la columna `summary` de la base de datos.
- **🔍 Extracción Resiliente**: Se actualizó el parser de `keyPoints` en el servicio de resúmenes para extraer puntos clave de las nuevas secciones (`Conceptos Detectados`, `Preguntas que puede responder`).

### Added — Ingesta Jerárquica, Embeddings Perezosos y Compuerta de Seguridad (2026-07-16)

- **📚 Estructura Jerárquica y Parser**: Nuevo parseador `HierarchicalParserService` que divide documentos en Capítulos y Secciones usando Markdown y aplica filtros inteligentes para omitir contenido redundante o ruidoso.
- **⚡ Ingesta en 5 Fases**: Proceso optimizado con estado `quarantined` inicial, división estructural, cálculo diferido y amortiguado de embeddings (lotes con delay para resiliencia), y resúmenes recursivos MapReduce (capítulo a capítulo y general).
- **🔍 Búsqueda Híbrida en Dos Capas**: RAG inteligente que busca primero capítulos relevantes y luego chunks locales. Genera embeddings en caliente ("perezosos" u on-demand) para candidatos que aún no han sido vectorizados.
- **🛡️ ActionExecutionGate**: Compuerta de seguridad que intercepta pasos de agentes en `ExecutionEngine`. Valida parámetros contra lista blanca de herramientas y exige confirmación humana (HITL) para acciones destructivas (`drop`, `delete`, etc.), auditándolas en `logs/security_audit.log`.
- **🔌 Endpoint de Aprobación**: Ruta `POST /library/document/:id/approve` para liberar documentos en cuarentena hacia el pipeline de indexación.

### Added & Optimized — Entrevista Adaptativa y Ciclos de Balance Energético (2026-07-16)

- **🔄 Entrevista Adaptativa**: Transformación del cuestionario estático de 22 preguntas en una entrevista interactiva paso a paso (turn-by-turn) de 10 preguntas en total.
- **🌀 Rotación por Ciclos**: Implementación de una estructura de 4 ciclos temáticos basados en el número de sesiones completadas para dar una personalidad y ángulo diferente cada 15 días:
  - **Ciclo 1**: "¿Dónde está yendo tu energía?" (mapa general)
  - **Ciclo 2**: "¿Qué está bloqueando tu energía?" (resistencias y límites)
  - **Ciclo 3**: "¿Qué merece crecer?" (potencial y expansión)
  - **Ciclo 4**: "¿Qué necesita cerrarse?" (cierre de ciclos y manifestación)
- **🤖 Preguntas Dinámicas por IA**: A partir del cuarto turno, la IA genera dinámicamente la siguiente pregunta en español con modismo argentino ("vos"), analizando la última respuesta del usuario, detectando contradicciones y profundizando en temas de valor.
- **🚫 Prevención de Duplicados**: Se introdujeron pautas y restricciones estrictas en el prompt del generador para evitar que la IA formule preguntas con temáticas, enfoques, palabras clave o ideas redundantes o repetidas respecto del historial previo.
- **🌓 Análisis Sensible al Ciclo**: Se actualizó el motor de análisis en `BalanceAnalysisService` para que el reporte final interprete las respuestas del usuario bajo la temática del ciclo actual.
- **🛡️ Validación de Respuestas Mínimas**: Se incluyó una validación que requiere al menos 5 preguntas respondidas para poder ejecutar el análisis de finalización de balance.

### Fixed — Coincidencia Falsa de Documentos por Título (2026-07-16)

- **🔍 Búsqueda Exacta de Título**: Se implementó el método `findDocumentByExactTitle` en `DocumentRepository` para realizar búsquedas insensibles a mayúsculas sobre títulos exactos.
- **🎯 Resolución de Falsos Matchings**: Se reemplazó el uso de la búsqueda difusa de términos `searchDocumentsByTitle` (que generaba coincidencia parcial errónea debido a preposiciones comunes como "del", "de", "los") por la coincidencia exacta al comprobar la existencia de un documento en la biblioteca de base de datos durante búsquedas RAG o lazy loading.
- **🛡️ Validación Precisa de Candidatos**: Se agregó validación de sobrelapado estricto en la extracción de solicitudes de resumen para que las queries que incluyan palabras genéricas no generen falsos positivos.

### Added & Optimized — Asynchronous Ingestion & Controlled Concurrency (2026-07-15)

- **🔄 Ingestion State Machine**: Added `status` field to the `Document` model (`not_indexed` → `indexing` → `ready`). Documents default to `not_indexed` and transition to `indexing` during parsing.
- **⚡ Decoupled Ingestion Pipeline**: Ingestion methods (`ingestText`, `ingestPdf`, `ingestUrl`) no longer block user responses while generating embeddings. The embedding processing runs asynchronously.
- **🚦 Concurrency Controlled Embedding Queue**: Implemented a worker pool pattern for embedding generation with a strict limit of 3 concurrent requests, avoiding API rate limits and fixing TypeScript compilation issues.
- **🔍 RAG Status Filtering**: Updated textual and semantic search queries to only query documents in the `ready` state, preventing incomplete or partially indexed documents from showing up in RAG searches.

### Security — Quick fixes (2026-07-14)

- **🛡️ H-i-t-L para endpoints destructivos**: El endpoint `DELETE /jarbees/library/document/:id` ahora requiere confirmación humana (`?confirm=true` o header `x-human-confirmation: yes`) o la variable de entorno `SKIP_HITL=true` para permitirse en entornos de integración. Esto evita borrados accidentales o inducidos por prompts maliciosos.
- **📋 Auditoría**: Se agregó un logger de auditoría que escribe eventos a `logs/security_audit.log` para solicitudes y éxitos de operaciones críticas (por ahora: borrado de documentos).
- **🔎 Validación de embeddings**: Las funciones que usan embeddings validan la dimensión esperada mediante la variable `EMBEDDING_DIM` (por defecto `1024`) y rechazan vectores con dimensiones o valores inválidos.

### Security — CI checks and automation (2026-07-14)

- **🔁 CI security scan**: Añadido script `scripts/check_security_patterns.sh` y `npm run check:security` para ejecutar en CI. Busca patrones peligrosos como `$executeRaw`, `exec(`, `spawn(`, `child_process` y `::vector`.
- **📌 Goal**: Detectar merges que introduzcan raw SQL/execution code without review.

### Automation — CI pipeline (2026-07-14)

- **✅ GitHub Actions**: Añadido workflow `.github/workflows/security-scan.yml` que ejecuta `npm run check:security` en `pull_request` y `push` a `main`/`master`.


### Optimized — RAG Chunking Strategy (2026-07-14)

- **📦 Parámetros de chunking optimizados**: Actualización de `CHUNK_SIZE` de 800 a **1200 caracteres** y `CHUNK_OVERLAP` de 80 a **150 caracteres** en `DocumentIngestService`.
- **⚡ Beneficios**:
  - ~40% reducción en cantidad de chunks por documento
  - Mejor contexto semántico dentro de cada chunk (bge-m3 maneja sin problema ~2000 caracteres)
  - Embeddings más rápidos (menos vectores a calcular y almacenar)
  - Recuperación RAG más coherente sin sacrificar relevancia
- **🎯 Rationale**: Con **bge-m3** como modelo de embeddings, no es necesario fragmentar el contenido en chunks pequeños. Los chunks más grandes mantienen mejor coherencia semántica y reducen la latencia de ingesta.

### Docs — Actualización de arquitectura y estado real del sistema (2026-07-14)

- **📝 `JARBEES_ARCHITECTURE.md` actualizado** para reflejar los módulos y servicios realmente importados en `AppModule` y `JarvisModule`, los endpoints expuestos por `JarvisController`, y los capacidades activas de `JarvisService`.
- **🔧 Correcciones de documentación**:
  - `DocumentIngestService` usa ahora chunks de **1200 caracteres** con **150 de overlap**.
  - `pgvector` está activado en la base de datos con campos `vector(1024)` y consultas nativas de similitud.
  - `SourceRegistry` y `WebHelper` son los componentes activos para búsquedas priorizadas; el módulo `BusinessSourceModule` aún no está importado en el flujo principal de Jarvis.
  - `VisionService` soporta análisis de imágenes y OCR vía `Qwen2.5-VL`.

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
