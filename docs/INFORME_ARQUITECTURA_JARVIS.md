# Informe completo del sistema actual de Jarvis

## 1. Visión general

El sistema actual implementa un asistente conversacional con arquitectura en capas sobre NestJS + Prisma + SQLite. La pieza central es Jarvis, que recibe preguntas por HTTP, clasifica la intención, decide si debe usar herramientas externas, contexto local (memoria/documentos), búsqueda web o un LLM, y finalmente persiste la interacción para observabilidad y continuidad conversacional.

La arquitectura actual está orientada a:
- responder de forma rápida cuando la consulta es local o calculable,
- usar herramientas externas cuando la pregunta lo requiere,
- mantener memoria y RAG para personalización,
- registrar trazas de ejecución para observabilidad y mejora.

---

## 2. Arquitectura general

### Patrón de diseño dominante

- Orquestador principal: `JarvisService`
- Controlador HTTP: `JarvisController`
- Repositorios de persistencia: `Prisma` + repositorios tipo DAO
- Servicios especializados: intent router, tools, web, astrology, browser, google, sports
- Proveedores de LLM: Ollama y OpenRouter

### Capas del sistema

1. Capa de entrada
   - `JarvisController` expone endpoints REST.
   - La ruta principal es `POST /jarbees/query`.

2. Capa de orquestación
   - `JarvisService.query()` coordina la ejecución.
   - Decide qué camino tomar según la intención detectada.

3. Capa de clasificación
   - `IntentRouterService` determina si la pregunta es:
     - `REPEAT`
     - `TOOL`
     - `CALENDAR`
     - `TASKS`
     - `ASTROLOGY`
     - `URL`
     - `SPORTS`
     - `WEB`
     - `LOCAL` / `RAG`

4. Capa de herramientas y fuentes externas
   - Google Calendar / Tasks
   - AstrologyTool
   - SportsTool
   - AssistantToolsService
   - WebHelper + ContentCacheService
   - BrowserToolService

5. Capa de contexto y generación
   - `buildJarvisContext()` arma el prompt del LLM con:
     - identidad del asistente,
     - perfil del usuario,
     - habilidades relevantes,
     - memoria,
     - documentos,
     - historial o resumen de sesión,
     - contexto web si existe.

6. Capa de persistencia
   - Prisma + SQLite.
   - Guarda conversaciones, memoria, documentos, chunks, runs, feedback, tareas, etc.

---

## 3. Flujo de una pregunta desde el ingreso hasta la respuesta

### 3.1 Entrada HTTP

El request entra por:
- `POST /jarbees/query`

El cuerpo puede incluir:
- `message`: texto de la pregunta
- `sessionId`: sesión opcional
- `provider`: `ollama` o `openrouter`

El controlador delega en `JarvisService.query()`.

### 3.2 Persistencia inmediata del mensaje de usuario

Al recibir la pregunta, el sistema crea un registro en `ConversationMessage` con rol `user`.

### 3.3 Detección de “repetir”

Antes de cualquier procesamiento, se verifica si la consulta es una orden de repetición (por ejemplo “repetí la última respuesta”).

Si es así, el sistema:
- recupera la última respuesta del asistente en la sesión,
- la devuelve al usuario,
- y registra el evento como `repeat`.

### 3.4 Clasificación de intención

La clasificación se hace en `IntentRouterService`.

#### Estrategia actual
- Primero usa reglas determinísticas rápidas (sin LLM).
- Si la confianza es baja, intenta un clasificador LLM vía Ollama.

#### Reglas principales
- Palabras de deportes => `SPORTS`
- Palabras de calendario => `CALENDAR`
- Palabras de tareas => `TASKS`
- Consultas sobre astrología => `ASTROLOGY`
- URLs => `URL`
- Clima/matemática/economía/hora => `TOOL`
- Preguntas de actualidad o noticias => `WEB`
- Conversación general => `LOCAL` o `RAG`

#### Importante
La clasificación astrológica está cubierta principalmente por reglas rápidas, no por el LLM.

### 3.5 Ruta según intención

#### A. `REPEAT`
- Reutiliza la última respuesta de la sesión.

#### B. `TOOL`
- Usa `AssistantToolsService.resolve()`.
- Esto cubre herramientas directas como clima, hora, economía, matemáticas, etc.

#### C. `CALENDAR`
- Usa Google Calendar.
- Si hay datos, se envía al LLM con contexto suplementario.

#### D. `TASKS`
- Usa Google Tasks.
- El flujo es similar a Calendar.

#### E. `ASTROLOGY`
- Usa `AstrologyTool` con `astronomy-engine`.
- Calcula:
  - fase lunar,
  - posición de la luna,
  - posición del sol,
  - planetas visibles,
  - interpretaciones básicas.
- Luego envía el resultado al LLM como contexto para que lo convierta en una respuesta natural.

#### F. `URL`
- Dispara scraping y contexto de navegador.
- Luego se usa el LLM para responder con ese contexto.

#### G. `SPORTS`
- Usa `SportsTool`.
- Si no encuentra datos, hace fallback a búsqueda web automática.

#### H. `WEB`
- Usa `autoWebSearch()`.
- Primero intenta caché inteligente.
- Si falla, usa `WebHelper` con fuentes priorizadas.
- Si no hay resultados, se evita inventar datos.

#### I. `LOCAL` / `RAG`
- Usa memoria, documentos y contexto de sesión.
- Si el sistema considera que la pregunta necesita información actual, puede hacer búsqueda web antes.

### 3.6 Generación de la respuesta

Una vez armado el contexto, `respondWithLLM()` envía:
- un `system prompt` con identidad, reglas, perfil y contexto,
- un `user prompt` con memoria/documentos/skills/web/historial.

Luego se genera una respuesta a partir del proveedor LLM configurado.

### 3.7 Persistencia final

El resultado se guarda en:
- `ConversationMessage` como respuesta del asistente,
- `AgentRun` como ejecución de la tarea,
- `SessionSummary` como resumen de sesión si corresponde.

---

## 4. Qué dispara cada tipo de flujo

| Intención | Qué dispara | Fuente de datos | Velocidad esperada |
|---|---|---|---|
| `REPEAT` | Repetir última respuesta | Conversación previa | Muy rápida |
| `TOOL` | Herramientas directas | Servicio de herramientas | Muy rápida |
| `CALENDAR` | Google Calendar | API externa | Media |
| `TASKS` | Google Tasks | API externa | Media |
| `ASTROLOGY` | Cálculos locales | `astronomy-engine` | Muy rápida |
| `URL` | Scraping/browser | Web externa | Lenta |
| `SPORTS` | API deportiva/scraping | APIs y web | Media/Lenta |
| `WEB` | Búsqueda web / scraping | Web externa | Lenta |
| `LOCAL` / `RAG` | Memoria + documentos + LLM | Base local + LLM | Media |

---

## 5. Qué procesos son más lentos y cuáles son más rápidos

### Más rápidos

1. `ASTROLOGY`
   - Usa cálculo local sin red.
   - Muy adecuado para respuestas instantáneas.

2. `TOOL`
   - Herramientas directas sin necesidad de LLM intermedio.
   - Normalmente llegan en pocos cientos de ms o segundos.

3. `REPEAT`
   - Solo consulta el último mensaje de la sesión.

### Medios

1. `LOCAL` / `RAG`
   - Busca en documentos y memoria local.
   - Puede tardar más según el tamaño del dataset y el número de chunks.

2. `CALENDAR` / `TASKS`
   - Dependen del acceso a APIs externas y del tiempo de respuesta de Google.

### Más lentos

1. `WEB` / `SPORTS`
   - Requieren scraping o búsqueda externa.
   - La ruta más costosa es la búsqueda web real con scraping.

2. `URL`
   - El scraping + extracción de contenido puede ser muy costoso.

3. LLM remoto
   - Ollama/OpenRouter pueden ser el cuello de botella si el modelo está cargado o el servidor está ocupado.

### Timeouts y protección de latencia

El sistema incorpora límites explícitos:
- caché: timeout de 15s,
- WebHelper: timeout de 25s,
- se evita esperar indefinidamente por scraping si ya es demasiado tarde.

Esto evita que una consulta web bloquee todo el flujo general.

---

## 6. Persistencia en base de datos y uso real

El sistema usa Prisma con PostgreSQL/SQLite en el modelo actual, aunque el esquema está configurado para SQLite por defecto.

### Modelos principales y uso

#### 6.1 `ConversationMessage`
- Guarda mensajes de usuario, asistente y sistema.
- Sirve para historial conversacional y contexto de sesión.
- Se usa para:
  - recuperar el historial reciente,
  - repetir respuestas,
  - construir contexto del LLM,
  - armar resúmenes de sesión.

#### 6.2 `SessionSummary`
- Resume la sesión para no enviar todo el historial al modelo.
- Reduce el tamaño del prompt y mejora la eficiencia.

#### 6.3 `Memory`
- Guarda hechos o preferencias del usuario.
- Sirve para personalización y continuidad.
- La recuperación se hace por texto y ranking de importancia.

#### 6.4 `MemoryChunk`
- Fragmentos de memoria con soporte futuro para embeddings.
- Diseñado para una futura búsqueda semántica más sofisticada.

#### 6.5 `Document` / `Chunk`
- Documentos cargados en la biblioteca.
- Se usan para RAG.
- `Chunk` permite recuperar fragmentos relevantes por contenido.

#### 6.6 `AgentRun`
- Registra cada ejecución del agente.
- Guarda:
  - pregunta,
  - respuesta,
  - herramientas usadas,
  - modelo/proveedor,
  - duración,
  - éxito/error,
  - tokens usados (si existen).
- Es la base de observabilidad del sistema.

#### 6.7 `Feedback`
- Permite recibir retroalimentación del usuario sobre respuestas.
- Es importante para futuras mejoras del sistema y tuning.

#### 6.8 `Task` / `TaskStep`
- Implementa un planner de tareas.
- Se usa para descomponer objetivos en pasos.

#### 6.9 `Tool`
- Registro general de herramientas habilitadas.
- Sirve para mantenimiento y exposición de capacidades.

#### 6.10 `Source`, `ScrapedPage`, `ScrapedContent`, `Query`
- Son el layer de web scraping y caché.
- Permiten:
  - priorizar fuentes por categoría,
  - guardar páginas scrapeadas,
  - evitar repetir scraping innecesario,
  - medir hit rate de caché,
  - trackear latencia por consulta.

---

## 7. Cómo se usa la memoria y el contexto

El LLM no recibe solo la pregunta. Recibe un prompt enriquecido que incluye:
- identidad del asistente,
- perfil del usuario,
- fecha/hora,
- contexto local (Paraná, Entre Ríos),
- skills relevantes,
- memoria recuperada,
- documentos recuperados,
- resumen de sesión,
- historial reciente,
- contexto web si aplica.

Esto hace que la respuesta sea más contextual y personalizada.

### Qué aporta cada componente

- `skills`: guía de comportamiento y especialidades
- `memory`: hechos persistidos del usuario
- `documents`: conocimiento local / RAG
- `history`: continuidad conversacional
- `web context`: información actualizada

---

## 8. Rol de las skills

El sistema tiene un registrador de skills que carga contenido desde la carpeta `skills`.

Cada skill tiene:
- nombre,
- descripción,
- keywords,
- prioridad,
- contenido completo.

Durante la construcción del contexto, el sistema selecciona las más relevantes para la consulta actual.

### Valor actual
- Son un mecanismo de guía de comportamiento y especialidades.
- Ayudan a que el modelo responda de forma más alineada al dominio del usuario.

### Limitación actual
- La selección es relativamente simple y basada en coincidencias de texto y prioridad.
- No existe un sistema de embeddings o ranking sofisticado para skills todavía.

---

## 9. Qué pasa con la web y la caché

La búsqueda web tiene un pipeline bien pensado:

1. Detectar categoría de la pregunta.
2. Intentar caché inteligente.
3. Si no hay caché útil, usar `WebHelper`.
4. Si falla, evitar responder con inventos.

### Ventaja
- Reduce tiempos y evita repetir scraping innecesario.

### Riesgo
- El tiempo total puede crecer si las fuentes externas responden lento.
- El fallback de 25s previene que una consulta se vuelva demasiado lenta.

---

## 10. Puntos fuertes del diseño actual

- Separación clara entre orquestación y especialización.
- Soporte para rutas rápidas y rutas externas.
- Memoria, historial y RAG integrados.
- Observabilidad robusta vía `AgentRun` y `ConversationMessage`.
- Capacidad de hacer fallback y no inventar datos cuando no hay contexto real.
- Diseño modular y extensible para sumar nuevas tools.

---

## 11. Debilidades / riesgos / oportunidades de mejora

### 11.1 Duplicación de lógica
- El flujo de Calendar y Tasks parece repetir bloqueos similares en `JarvisService`.
- Esto puede simplificarse con una abstracción común.

### 11.2 Clasificación algo rígida
- La intención se decide con reglas determinísticas y un fallback LLM.
- El diseño funciona, pero podría mejorarse con un router más explícito por dominios.

### 11.3 Latencia de web
- El componente más lento sigue siendo el web scraping / búsqueda externa.

### 11.4 Persistencia muy útil, pero aún bastante “manual”
- El sistema guarda mucho, pero la recuperación no siempre está optimizada para búsqueda semántica.
- El uso de embeddings está planteado pero no totalmente explotado.

### 11.5 Dependencia del proveedor LLM
- La respuesta final depende mucho de la disponibilidad del proveedor y del tamaño del modelo.

### 11.6 Posible mejora de seguridad y control
- Faltan más límites en prompts y control de herramientas sensibles.

---

## 12. Resumen ejecutivo

El sistema actual es un asistente conversacional híbrido bastante completo:
- acepta consultas por HTTP,
- clasifica intención,
- decide entre herramientas locales, externas, memoria, documentos, web y LLM,
- construye un prompt rico con contexto,
- y persiste todo para observabilidad y continuidad.

### Lo más importante de su diseño
- Es modular.
- Tiene un motor de orquestación claro.
- Está pensado para combinar respuesta rápida con respuestas contextuales y con datos actuales.
- Tiene una base sólida de persistencia y observabilidad.

### Lo más costoso del sistema
- Búsqueda web, scraping y llamadas a modelos remotos.

### Lo más valioso para el usuario
- La memoria, el historial, el RAG y las skills mejoran mucho la calidad de las respuestas con el tiempo.

---

## 13. Conclusión

El sistema está bien encaminado como asistente inteligente de propósito general con capacidad de personalización, web, documentos, herramientas y observabilidad. La combinación de orquestación + repositorios + tools + LLM lo convierte en una arquitectura sólida para evolucionar hacia un agente más robusto, más rápido y más contextual.
