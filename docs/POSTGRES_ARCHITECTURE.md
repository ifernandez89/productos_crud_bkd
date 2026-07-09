# Arquitectura de Base de Datos — JarBees (PostgreSQL)

## Contexto y decisión de migración

El proyecto nació sobre **SQLite** por simplicidad de desarrollo local. La migración a **PostgreSQL** (`prisma/migrations/20260709020840_init_postgres`) fue necesaria por tres razones concretas:

1. **Limitaciones de SQLite en producción**: SQLite no soporta `mode: 'insensitive'` en Prisma, operaciones concurrentes de escritura son serializadas (un lock por archivo), y no tiene soporte nativo para vectores (`pgvector`).
2. **Preparación para embeddings semánticos**: El schema ya tiene columnas `embeddingId` en `MemoryChunk`, `Chunk`, y `ScrapedPage` diseñadas para referenciar vectores. La extensión `pgvector` de PostgreSQL permite agregar `vector(768)` directamente como columna cuando se active.
3. **Concurrencia real**: Jarvis persiste historial, memoria, scraping, observabilidad y tareas en cada turno de conversación. Con SQLite eso generaba contención; con PostgreSQL cada tabla tiene su propio espacio de concurrencia.

El provider en `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## Arquitectura: 5 capas de memoria + infraestructura del agente

El schema está organizado en capas conceptuales que reflejan los niveles de memoria de Jarvis.

```
┌─────────────────────────────────────────────────────────┐
│                    REQUEST del usuario                   │
└──────────────────────────┬──────────────────────────────┘
                           │
              ┌────────────▼────────────┐
              │     IntentRouter        │  (en memoria, sin DB)
              └────────────┬────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐        ┌────▼────┐       ┌────▼────┐
   │  TOOL   │        │  WEB    │       │  LOCAL  │
   │(direct) │        │(scrape) │       │(RAG+mem)│
   └────┬────┘        └────┬────┘       └────┬────┘
        │                  │                  │
        └──────────────────▼──────────────────┘
                           │
              ┌────────────▼────────────┐
              │   buildJarvisContext    │
              │  memoria + docs + hist  │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │      LLM (Ollama /      │
              │      OpenRouter)        │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │    saveAndObserve       │
              │  ConversationMessage +  │
              │  AgentRun + Memory      │
              └─────────────────────────┘
```

---

## Tablas por capa

### Capa 0 — Legacy (compatibilidad temporal)

| Tabla | Descripción |
|-------|-------------|
| `Product` | Catálogo de productos. Origen del proyecto pre-Jarvis. Se mantiene por compatibilidad con `ProductsModule`. |
| `Pregunta` | Historial de chats del módulo `AichatModule` (pre-Jarvis). Reemplazado funcionalmente por `ConversationMessage` pero no eliminado para no perder datos históricos. |

---

### Capa 1 — Perfil de usuario

**`UserProfile`** — existe como fila única (singleton). Guarda nombre, timezone, idioma y preferencias del dueño del asistente. `JarvisService.buildJarvisContext()` lo lee en cada turno para personalizar el system prompt.

**`UserCredential`** — tokens OAuth por proveedor (Google, Microsoft, etc.). Relación 1:N con `UserProfile`. `onDelete: Cascade` garantiza que si se borra el perfil, los tokens se limpian. Índice en `provider` para lookup rápido al renovar tokens.

```sql
UNIQUE (userProfileId, provider)  -- un token por proveedor por usuario
INDEX  (provider)                 -- lookup por proveedor
```

---

### Capa 2 — Memoria permanente

**`Memory`** — el diferencial de Jarvis vs un chatbot. Guarda hechos sobre el usuario ("trabaja con NestJS", "prefiere respuestas cortas") extraídos automáticamente por `MemoryExtractorService` usando regex con 8 patrones (identidad, profesión, tecnologías, preferencias, ubicación, proyectos, intereses, comandos explícitos).

La búsqueda es textual (`contains` por términos) ordenada por `importance DESC, lastAccessed DESC`. Cuando se active `pgvector`, la búsqueda semántica reemplazará al `contains`.

```sql
INDEX (category)      -- filtro por tipo de hecho
INDEX (importance)    -- ranking de recuperación
INDEX (lastAccessed)  -- LRU: los más usados al tope
```

**`MemoryChunk`** — fragmentos vectorizables de cada memoria. Por ahora `embeddingId` es una referencia string a un vector store externo. Cuando se agregue `pgvector`:

```sql
-- Migración futura:
ALTER TABLE "MemoryChunk" ADD COLUMN embedding vector(768);
CREATE INDEX ON "MemoryChunk" USING ivfflat (embedding vector_cosine_ops);
```

---

### Capa 3 — Historial conversacional

**`ConversationMessage`** — cada mensaje (user/assistant/system/tool) de cada sesión. `sessionId` es un UUID generado por el frontend y persistido en `localStorage`, garantizando que el historial sobreviva recargas del browser.

El endpoint `GET /jarbees/session` valida o genera el `sessionId`. El endpoint `GET /jarbees/history` lo recupera para reconstruir el chat.

```sql
INDEX (sessionId)  -- lookup principal: "dame los últimos N mensajes de esta sesión"
INDEX (createdAt)  -- ordenamiento cronológico
```

**`SessionSummary`** — resumen progresivo de cada sesión. En lugar de enviar 100 mensajes al LLM, `buildJarvisContext()` verifica primero si existe un resumen. Si existe, lo usa en lugar del historial raw. Reduce tokens y latencia.

```sql
UNIQUE (sessionId)  -- una sola fila de resumen por sesión
```

---

### Capa 4 — Conocimiento (RAG)

**`KnowledgeSource`** — catálogo de orígenes de conocimiento: PDFs, Markdown, URLs, Notion, GitHub, PostgreSQL directo, APIs externas.

**`Collection`** — agrupa documentos en colecciones temáticas (Programación, Astronomía, etc.) para navegación y filtrado desde el frontend.

**`CollectionDocument`** — tabla pivote N:M entre `Collection` y `Document`.

```sql
UNIQUE (collectionId, documentId)  -- evita duplicados en la colección
```

**`Document`** — documento completo con título, contenido, categoría y fuente. Campos `timesUsed` y `lastUsed` permiten analytics de qué documentos se usan más en RAG, útil para optimizar la biblioteca.

**`Chunk`** — fragmentos de 500-1000 chars de cada documento, la unidad real del RAG. `embeddingId` apunta al vector store. La búsqueda actual es textual vía `documentRepo.searchChunks()`. Migración a semántica: igual que `MemoryChunk`.

```sql
INDEX (documentId)   -- joins rápidos Document → Chunk
INDEX (embeddingId)  -- lookup por vector cuando se active pgvector
```

---

### Capa 5 — Planner (tareas)

**`Task`** — objetivo que Jarvis debe resolver. Puede venir de un comando conversacional ("crea un pendiente: comprar leche") o del `ExecutionEngine` cuando recibe una investigación compleja. Campos `priority`, `category` y `project` se infieren automáticamente por keywords del mensaje.

**`TaskStep`** — pasos de ejecución de cada tarea. El `ExecutionEngine` crea los steps y actualiza su `status` (`pending → running → completed/failed`) conforme avanza. El contexto acumulado de pasos previos se pasa como input al siguiente.

```sql
INDEX (taskId)    -- "dame todos los pasos de esta tarea"
INDEX (status)    -- "dame todas las tareas pendientes"
INDEX (priority)  -- ordenamiento por urgencia
INDEX (project)   -- filtro por proyecto
```

---

### Infraestructura del agente

**`Feedback`** — puntuaciones 1-5 por sesión/pregunta/respuesta. Base para RLHF futuro o para detectar patrones de respuestas malas.

**`Tool`** — registro dinámico de tools disponibles. Permite habilitar/deshabilitar tools sin tocar código. Por ahora poblado manualmente; el objetivo es que el planner pueda consultar qué tools tiene disponibles en tiempo de ejecución.

**`AgentRun`** — observabilidad completa de cada ejecución:

| Campo | Propósito |
|-------|-----------|
| `sessionId` | Correlacionar con historial |
| `toolsUsed` | JSON array: `["memory", "rag", "domain:LOCAL_NEWS"]` |
| `modelUsed` | `"llama3.2:3b"`, `"qwen3:8b"`, etc. |
| `provider` | `"ollama"` \| `"openrouter"` |
| `durationMs` | Latencia total del turno |
| `tokensUsed` | Para calcular costo en OpenRouter |
| `success` | Boolean + `errorMsg` si falló |

```sql
INDEX (success)    -- "cuántas respuestas fallaron hoy?"
INDEX (modelUsed)  -- comparar latencia entre modelos
INDEX (createdAt)  -- series temporales de métricas
```

---

### Web scraping & caché inteligente

Esta es la capa más compleja del schema porque implementa un sistema de caché con TTL, priorización de fuentes y preparación para embeddings.

**`Source`** — catálogo de fuentes confiables (30+ activas). Cada fuente tiene:

- `priority` (1-10): orden de consulta. TyC Sports tiene 10 para deportes; Wikipedia tiene 10 para referencia.
- `ttlHours`: cuánto tiempo es válido el caché. Noticias: 1h. Clima: 1h. Ciencia: 24h. Wikipedia: 7 días.
- `scrapingConfig` (JSON): selectores CSS específicos por fuente, `searchPattern` para búsquedas.
- `successRate` y `avgResponseTimeMs`: métricas actualizadas tras cada scraping para detectar fuentes degradadas.
- `embeddingEnabled`: cuando sea `true`, el contenido scrapeado se vectorizará automáticamente.

```sql
UNIQUE (urlBase)    -- no duplicar fuentes
INDEX  (category)   -- "dame todas las fuentes de categoria 'deportes'"
INDEX  (priority)   -- top 3 fuentes por prioridad
INDEX  (active)     -- filtrar fuentes habilitadas
```

**`ScrapedPage`** — una página scrapeada con su TTL calculado como `scrapedAt + source.ttlHours`. El flujo del `ContentCacheService`:

```
1. ¿Existe ScrapedPage con esta URL y status='valid' y expiresAt > now()?
   → Cache HIT: servir ScrapedContent en milisegundos
2. No existe o expiró:
   → Scrapear → guardar ScrapedPage + ScrapedContent
   → Próxima consulta usará el caché
```

`contentHash` (SHA-256) detecta si el contenido cambió entre scrapings. `cacheHits` permite analytics de qué páginas se sirven más desde caché.

```sql
UNIQUE (url)         -- una entrada por URL
INDEX  (expiresAt)   -- "dame todas las páginas expiradas" (para cleanup cron)
INDEX  (status)      -- filtrar valid/expired/failed
INDEX  (cacheHits)   -- top páginas más consultadas
INDEX  (embeddingId) -- lookup vectorial futuro
```

**`ScrapedContent`** — relación 1:1 con `ScrapedPage`. Almacena:

- `htmlRaw`: opcional, solo para páginas importantes donde se necesite re-parsear.
- `textExtracted`: texto limpio, lo que se inyecta en el prompt del LLM.
- `jsonExtracted`: datos estructurados si la página tiene JSON-LD o API response.
- `metadata` (JSON): wordCount, titulares, links, imágenes detectadas.

```sql
UNIQUE (pageId)  -- relación 1:1 estricta
```

**`Query`** — analytics de patrones de uso:

```sql
INDEX (category)   -- "qué categorías consultan más?"
INDEX (cacheHit)   -- "cuál es el hit rate del caché?"
INDEX (createdAt)  -- series temporales
```

**`TopicSnapshot`** — evolución del pensamiento del usuario sobre temas a lo largo del tiempo. `KnowledgeEvolutionService` registra conclusiones, tags y sessionId cuando el usuario aprende algo nuevo o cambia de opinión sobre un tema. Permite reconstruir narrativas de evolución: "¿Qué pensabas de Qwen hace 2 semanas vs hoy?".

```sql
INDEX (topic)      -- buscar todos los snapshots de un tema
INDEX (sessionId)  -- snapshots de una sesión específica
INDEX (createdAt)  -- orden cronológico para narrativa
```

---

## Flujo de datos por turno de conversación

Cada vez que el usuario envía un mensaje, estas son las escrituras en PostgreSQL:

```
1. ConversationMessage.create (role: 'user')
   → persistir el mensaje inmediatamente

2. [si hay URL] ScrapedPage + ScrapedContent upsert
   → caché del contenido web scrapeado

3. [si hay task command] Task.create + TaskStep.create[]
   → plan de ejecución persiste antes de correr

4. [durante ExecutionEngine] TaskStep.update (status transitions)
   → cada paso se actualiza en tiempo real

5. ConversationMessage.create (role: 'assistant')
   → persistir respuesta final

6. AgentRun.create
   → observabilidad: tools, modelo, latencia, éxito

7. [async, no bloquea] Memory.create via MemoryExtractorService
   → hechos extraídos del mensaje del usuario

8. [async, si supera umbral] Document.create + Chunk.create[]
   → resultado guardado en Knowledge Library

9. [async, opcional] TopicSnapshot.create
   → evolución de conocimiento registrada
```

Los pasos 7, 8 y 9 corren en `.catch()` seguro — un error en ellos no afecta la respuesta al usuario.

---

## Índices: estrategia

Todos los índices están en columnas de lookup frecuente. Las decisiones clave:

- `Memory`: índice en `importance` porque el ranking `ORDER BY importance DESC, lastAccessed DESC` es el patrón de acceso más común.
- `ConversationMessage`: índice compuesto no definido explícitamente porque Prisma genera índice individual en `sessionId`. Considerar un índice compuesto `(sessionId, createdAt DESC)` si el historial crece mucho.
- `ScrapedPage`: índice en `expiresAt` es crítico para el job de limpieza (`cleanExpiredCache`) que corre via `@Cron`.
- `AgentRun`: índice en `createdAt` para las queries de métricas en ventana de tiempo.

---

## Lo que falta (roadmap técnico)

| Feature | Qué requiere |
|---------|--------------|
| Búsqueda semántica en `Memory` | `ALTER TABLE "MemoryChunk" ADD COLUMN embedding vector(768)` + extensión `pgvector` |
| Búsqueda semántica en `Chunk` (RAG) | Igual que arriba en tabla `Chunk` |
| Vectores en caché web | `ScrapedPage.embeddingId` ya existe, solo falta el pipeline de generación |
| Full-text search nativo | `CREATE INDEX USING GIN (content gin_trgm_ops)` en `Memory` y `Chunk` para búsqueda más robusta que `LIKE` |
| Índice compuesto historial | `CREATE INDEX ON "ConversationMessage" (sessionId, "createdAt" DESC)` para paginación eficiente |
| Particionado por fecha | `AgentRun` y `Query` crecen indefinidamente; `PARTITION BY RANGE (createdAt)` si se convierte en sistema de producción multi-usuario |

---

## Configuración

```env
DATABASE_URL="postgresql://user:password@localhost:5432/jarbees"
```

El `PrismaModule` es `@Global()`, por lo que `PrismaService` se inyecta en cualquier módulo sin reimportar. Los repositorios (`MemoryRepository`, `ConversationRepository`, etc.) son los únicos consumidores directos de `PrismaService` — ningún servicio de negocio accede a Prisma directamente.
