# Informe Técnico — Chatbot con Ollama + RAG → **Jarvis 2026**

---

## 1. Visión General

**Evolución completa:** de chatbot transaccional a asistente personal inteligente.

El sistema ahora implementa una **arquitectura de 5 capas** con memoria persistente, RAG contextual, y herramientas especializadas. El LLM (Ollama) pasa a ser un componente reemplazable, mientras que la inteligencia real reside en:

- **Memoria permanente** — recordar hechos sobre el usuario entre sesiones
- **RAG multi-capa** — conocimiento estructurado en documentos + chunks
- **Historial conversacional** — sesiones independientes con contexto
- **Tools pre-LLM** — 8 herramientas especializadas (clima, astronomía, matemáticas, etc)
- **Perfil de usuario** — adaptación a país, timezone, idioma, preferencias

---

## 2. Arquitectura Jarvis (5 Capas)

```
┌─────────────────────────────────────────────────────────────────┐
│                           Usuario                               │
│                   POST /jarvis/query                            │
│                  { message, sessionId }                         │
└────────────────────────┬────────────────────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │   JarvisController      │
            └────────────┬────────────┘
                         │
            ┌────────────▼────────────┐
            │    JarvisService        │
            │  (orquestador)          │
            └─────┬──────┬─────┬──────┘
                  │      │     │
        ┌─────────┘      │     └─────────────┐
        │                │                   │
        ▼                ▼                   ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ UserProfile  │  │   Memory     │  │ Conversation │
│ Repository   │  │  Repository  │  │  Repository  │
└──────────────┘  └──────────────┘  └──────────────┘
        │                │                   │
        └────────────────┴───────────────────┘
                         │
            ┌────────────▼────────────┐
            │  AssistantToolsService  │
            │  (8 tools pre-LLM)      │
            └────────────┬────────────┘
                         │
                    ┌────┴────┐
                    │ null?   │
                    └─┬────┬──┘
               tool   │    │  null
             answer   │    │  (no match)
                      │    │
                      │    ▼
                      │ ┌──────────────────────┐
                      │ │ buildJarvisPrompt()  │
                      │ │  - Perfil usuario    │
                      │ │  - Memoria (search)  │
                      │ │  - Documentos (RAG)  │
                      │ │  - Historial sesión  │
                      │ └──────────┬───────────┘
                      │            │
                      │            ▼
                      │ ┌──────────────────────┐
                      │ │ OllamaModelService   │
                      │ │ llama3.2:3b          │
                      │ │ temp: 0.2, ctx: 4096 │
                      │ └──────────┬───────────┘
                      │            │
                      └────────────┴─────┐
                                         │
                      ┌──────────────────▼─────┐
                      │ ConversationRepository │
                      │ .create(assistant msg) │
                      └──────────────────┬─────┘
                                         │
                      ┌──────────────────▼─────┐
                      │   HTTP Response        │
                      │   { answer, sessionId }│
                      └────────────────────────┘
```

---

## 2. Modelo de Lenguaje

### Modelo principal — Ollama (local)

| Parámetro       | Valor             | Justificación (Jarvis 2026) |
|-----------------|-------------------|------------------------------|
| `model`         | `llama3.2:3b`     | Rápido, liviano, instrucción-tuneado |
| `temperature`   | `0.2`             | **Bajado de 0.3** → más determinista y consistente para asistente personal |
| `topP`          | `0.85`            | Filtra tokens de baja probabilidad |
| `topK`          | `15`              | Vocabulario de muestreo reducido |
| `numPredict`    | `400`             | Evita corte en respuestas largas |
| `repeatPenalty` | `1.1`             | Penaliza repeticiones |
| `numCtx`        | `4096`            | **Subido de 2048** → mejor comprensión de memoria + docs + historial largo |
| `stop`          | `['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:']` | Corta antes de simular diálogos ficticios |

**Cambios clave para Jarvis:**
- `temperature: 0.2` → respuestas más predecibles (ideal para asistente)
- `numCtx: 4096` → puede procesar más memoria + documentos + historial sin perder coherencia

### Modelo alternativo — OpenRouter (externo, legacy)

- **Modelo:** `mistralai/mistral-7b-instruct:free`
- **Temperatura:** `0.7`
- **Max tokens:** `512`
- Activado en el endpoint legacy `/aichat/preguntar` con `agente: true`

---

## 3. Sistema de Memoria (Nuevo en Jarvis)

Jarvis implementa **3 tipos de memoria** que trabajan en conjunto:

### 3.1 Memoria Permanente (tabla `Memory`)

**Propósito:** Recordar hechos sobre el usuario entre sesiones (lo que diferencia Jarvis de ChatGPT básico).

**Estructura:**
```typescript
{
  key: string              // "favorite_language", "backend_framework"
  value: string            // "TypeScript", "NestJS"
  category: string         // "preference" | "fact" | "context" | "skill"
  importance: number       // 1-10, para rankear recuperación
}
```

**Algoritmo de recuperación:**
1. Tokeniza la pregunta (palabras 3+ chars)
2. Busca coincidencias en `key` y `value` (case-insensitive)
3. Ordena por `importance` DESC y `updatedAt` DESC
4. Retorna top-3 o top-5 según contexto

**Ejemplo de uso:**
```
Usuario: "Preferís usar TypeScript"
Jarvis guarda: { key: "favorite_language", value: "TypeScript", category: "preference", importance: 8 }

Más tarde...
Usuario: "¿Qué lenguaje me recomendás para el backend?"
Jarvis recupera la memoria y responde: "Ya que preferís TypeScript, te recomiendo NestJS..."
```

### 3.2 Historial Conversacional (tabla `ConversationMessage`)

**Propósito:** Mantener contexto de la conversación actual.

**Estructura:**
```typescript
{
  sessionId: string        // UUID de sesión
  role: "user" | "assistant" | "system" | "tool"
  content: string
  metadata?: JSON          // { model, tokens, latency, toolCalls }
}
```

**Flujo:**
- Cada pregunta del usuario → `role: "user"`
- Cada respuesta de Jarvis → `role: "assistant"`
- Múltiples sesiones independientes por `sessionId`
- Recupera últimos 6-10 mensajes para contexto (configurable)

**Reemplaza completamente la tabla `Pregunta`** con un sistema multi-sesión moderno.

### 3.3 RAG de Documentos (tablas `Document` + `Chunk`)

**Propósito:** Conocimiento estructurado y actualizable.

**Estructura:**
```typescript
Document {
  title: string
  content: string          // texto completo original
  category?: string        // "tech", "personal", "reference", "api-doc"
  source?: string          // URL, file path, manual
  chunks: Chunk[]
}

Chunk {
  documentId: number
  content: string          // fragmento de ~200-500 palabras
  embeddingId?: string     // futuro: referencia a pgvector
  metadata?: JSON          // { page, section, language }
}
```

**Chunking actual:** división por párrafos (mínimo 50 chars).  
**Futuro:** ventanas deslizantes con overlap para no perder contexto.

**Recuperación:**
1. Tokeniza la pregunta
2. Busca chunks con coincidencias textuales (preparado para búsqueda semántica con pgvector)
3. Retorna top-3 chunks con metadata del documento padre
4. Inyecta en el prompt como `### DOCUMENTOS`

---

## 4. Sistema RAG

El RAG combina **dos fuentes de contexto** construidas dinámicamente en cada request:

### 4.1 RAG de Historial (PostgreSQL)

Fuente: tabla `Pregunta` con registros de todas las interacciones exitosas.

**Algoritmo de recuperación (`findRelevant`):**

1. Tokeniza la pregunta actual: palabras de 4+ caracteres, normalizadas (sin tildes)
2. Busca en DB usando `OR` sobre `texto` y `respuesta` (case-insensitive) con hasta 8 términos
3. Recupera hasta `limit × 4` candidatos y los **rankea por score**:
   - `+2` por coincidencia en el texto de la pregunta original
   - `+1` por coincidencia en la respuesta
4. Retorna los top-3 más relevantes
5. Fallback: últimas preguntas exitosas si no hay coincidencias

Las respuestas del historial se truncan a 250 chars para no saturar el contexto.

### 4.2 RAG de Catálogo (Caché en memoria)

Fuente: tabla `Product` (PostgreSQL), con **caché en memoria de 30 segundos** para evitar roundtrips repetidos a la DB.

**Filtrado inteligente:**
- Detecta si la pregunta es sobre productos con regex: `/(producto|precio|stock|oferta|marca|comprar|...)/`
- Si aplica: filtra el catálogo por keywords de la pregunta (marca o nombre)
- Si no hay coincidencias específicas: retorna los primeros 15 productos con stock > 0
- Máximo 15 ítems en el catálogo inyectado al prompt

---

## 5. Capa de Tools (Pre-LLM)

Antes de invocar a Ollama, el servicio `AssistantToolsService` intenta resolver la pregunta directamente con herramientas especializadas. Si tiene respuesta, la retorna **sin consumir el LLM**.

| Tool              | Trigger (regex)                                    | API externa                  |
|-------------------|----------------------------------------------------|------------------------------|
| 🌤 Clima          | clima, temperatura, lluvia, viento...              | Open-Meteo + Nominatim (OSM) |
| 📅 Feriados       | feriado, asueto, puente...                         | Nager.Date API (AR)          |
| 🕐 Hora           | hora, zona horaria, hora actual...                 | WorldTimeAPI                 |
| 🌍 Países         | país, capital, moneda, idioma, población...        | REST Countries v3.1          |
| 🔭 Astronomía     | luna, fase lunar, eclipse, solsticio, planeta...   | astronomy-engine (local)     |
| 🗓 Calendario Maya | maya, tzolkin, haab, cuenta larga...              | Cálculo matemático propio    |
| ✡️ Calendario Hebreo | hebreo, judío, fecha hebrea...                  | jewish-date (local)          |
| ➕ Matemáticas    | calcula, deriva, integral, raíz, cuánto es...      | mathjs (local) + Newton API  |

**Detección de queries mixtas:** si la pregunta activa 2+ dominios distintos, la lógica deriva todo al LLM para una respuesta cohesiva.

---

## 6. Arquitectura y Diseño

```
┌──────────────────────────────────────────────────────────────────┐
│                         HTTP Request                             │
│                    POST /aichat/preguntar                        │
│                  { pregunta, agente?: bool }                     │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  AichatController   │
              │  (validación DTO,   │
              │   manejo de errores)│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │   AichatService     │
              │  preguntarOllama    │
              │  Oexternal()        │
              └──────┬──────┬───────┘
                     │      │
          ┌──────────┘      └──────────────┐
          ▼                                ▼
 ┌──────────────────┐             ┌────────────────────┐
 │ AssistantTools   │             │   promptAgente()   │
 │ Service          │             │   (RAG Builder)    │
 │                  │             └────────┬───────────┘
 │ resolve(query)   │                      │
 │  ↳ weather       │              ┌───────┴────────┐
 │  ↳ holidays      │              │                │
 │  ↳ time          │              ▼                ▼
 │  ↳ countries     │   ┌──────────────┐  ┌──────────────────┐
 │  ↳ astronomy     │   │  Preguntas   │  │  Products        │
 │  ↳ mayan cal.    │   │  Repository  │  │  Repository      │
 │  ↳ hebrew cal.   │   │  (RAG hist.) │  │  (RAG catálogo   │
 │  ↳ math          │   │             │  │   + caché 30s)   │
 └─────────┬────────┘   └──────┬───────┘  └───────┬──────────┘
           │                   │                   │
           │ null              └────────┬──────────┘
           │ (no match)                 │ StructuredPrompt
           │                           │ { system, user }
           ▼                           ▼
           └──────────────┬────────────┘
                          │
              ┌───────────┴────────────┐
              │    agente: false       │    agente: true
              ▼                        ▼
   ┌───────────────────┐    ┌─────────────────────────┐
   │ OllamaModelService│    │  callExternalAI()        │
   │ llama3.2:3b       │    │  OpenRouter              │
   │ invokeWithMessages│    │  mistral-7b-instruct     │
   │ (System + Human)  │    │  temperature: 0.7        │
   └─────────┬─────────┘    └───────────┬─────────────┘
             │                          │
             └────────────┬─────────────┘
                          │ respuesta: string
                          ▼
             ┌────────────────────────┐
             │ validateAnswerContent  │
             │ (anti-placeholder)     │
             └────────────┬───────────┘
                          │
                          ▼
             ┌────────────────────────┐
             │  PreguntasRepository   │
             │  .create() → persist  │
             │  (estado + respuesta) │
             └────────────┬───────────┘
                          │
                          ▼
             ┌────────────────────────┐
             │  HTTP Response         │
             │  { respuesta: string } │
             └────────────────────────┘
```

### Flujo resumido

```
Request → Validación → Tools? → [Respuesta directa]
                           ↓ no
                         RAG Build (historial + catálogo)
                           ↓
                    Ollama / OpenRouter
                           ↓
                    Validar → Persistir → Response
```

---

## 7. Persistencia

**Base de datos:** PostgreSQL vía Prisma ORM

**Tabla `Pregunta`:**
```
id           Int      — autoincrement
texto        String   — pregunta del usuario
respuesta    String   — respuesta del modelo
estado       String   — "success" | "error"
errorMessage String?  — detalle del error si aplica
errorStatus  Int?     — HTTP status code del error
createdAt    DateTime — timestamp automático
```

Cada interacción se persiste, tanto exitosa como fallida. Esto alimenta el RAG de historial progresivamente.

---

## 8. Manejo de Errores y Robustez

- **Timeout:** 60 segundos via `Promise.race()` para proteger contra inferencia colgada
- **Validación de respuesta:** detecta respuestas vacías o placeholder (`"hola"`, `"sin respuesta"`, `"hello"`) y las rechaza como inválidas, salvo que la pregunta sea un saludo
- **Detección de saludos:** normaliza tildes antes de evaluar para evitar falsos positivos (`"hola"` vs `"hóla"`)
- **Errores persistidos:** aun cuando falla la inferencia, se guarda el registro del error en DB para trazabilidad
- **Tool fallback:** si Newton API (derivadas/integrales) no responde, cae silenciosamente a mathjs local

---

## 9. Endpoints disponibles

| Método | Ruta                  | Descripción                          |
|--------|-----------------------|--------------------------------------|
| POST   | `/aichat/preguntar`   | Pregunta al chatbot                  |
| GET    | `/aichat/listar`      | Historial de preguntas               |
| GET    | `/aichat`             | findAll (placeholder)                |
| GET    | `/aichat/:id`         | findOne por id                       |
| PATCH  | `/aichat/:id`         | update por id                        |
| DELETE | `/aichat/:id`         | remove por id                        |

**Body de `/aichat/preguntar`:**
```json
{
  "pregunta": "¿Qué productos tienen oferta?",
  "agente": false
}
```

---

## 10. Stack tecnológico

| Capa              | Tecnología                          |
|-------------------|-------------------------------------|
| Framework         | NestJS 10                           |
| LLM local         | Ollama + llama3.2:3b                |
| LLM externo       | OpenRouter (Mistral-7B)             |
| LLM client        | @langchain/ollama + LangChain       |
| ORM               | Prisma 6                            |
| Base de datos     | PostgreSQL                          |
| Validación        | class-validator                     |
| Documentación API | Swagger (@nestjs/swagger)           |
| HTTP client       | axios                               |
| Astronomía        | astronomy-engine (local, sin clave) |
| Matemáticas       | mathjs (local) + Newton API         |
| Calendario hebreo | jewish-date                         |
