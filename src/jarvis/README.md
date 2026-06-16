# Jarvis — Arquitectura de 5 Capas

Jarvis es la evolución del chatbot transaccional a un **asistente personal inteligente** con memoria persistente, RAG contextual y arquitectura modular.

---

## 🏗️ Arquitectura

```
Usuario
  ↓
Memoria Permanente
  ↓
Planner (futuro)
  ↓
Tools (pre-LLM)
  ↓
RAG (Documents + Chunks)
  ↓
LLM (Ollama / OpenRouter)
```

---

## 📊 Modelos de Datos

### 1. **UserProfile** — Perfil del usuario
```typescript
{
  name?: string
  timezone: string         // "America/Argentina/Buenos_Aires"
  country: string          // "Argentina"
  language: string         // "es-AR"
  preferences?: JSON       // customizaciones libres
}
```

### 2. **Memory** — Memoria permanente
```typescript
{
  key: string              // "favorite_language", "backend_framework"
  value: string            // "TypeScript", "NestJS"
  category: string         // "preference" | "fact" | "context" | "skill"
  importance: number       // 1-10, para rankear recuperación
}
```

**Diferencia clave:** Esto es lo que hace que Jarvis recuerde hechos sobre ti entre sesiones.

### 3. **ConversationMessage** — Historial conversacional
```typescript
{
  sessionId: string        // UUID de sesión
  role: string             // "user" | "assistant" | "system" | "tool"
  content: string
  metadata?: JSON          // { model, tokens, latency, toolCalls }
}
```

**Reemplaza `Pregunta`** con un sistema multi-sesión moderno.

### 4. **Document** — Conocimiento estructurado
```typescript
{
  title: string
  content: string
  category?: string        // "tech", "personal", "reference", "api-doc"
  source?: string          // URL, file path, manual
  chunks: Chunk[]
}
```

### 5. **Chunk** — Fragmentos embeddables
```typescript
{
  documentId: number
  content: string
  embeddingId?: string     // referencia a vector store (futuro pgvector)
  metadata?: JSON          // { page, section, language }
}
```

**Preparado para pgvector:** cuando se active, agregar `embedding vector(768)` directamente.

### 6. **Task** — Planner (futuro)
```typescript
{
  sessionId?: string
  objective: string
  status: string           // "pending" | "in_progress" | "completed" | "failed"
  steps?: JSON             // [{ step, action, status }]
  result?: string
}
```

### 7. **Feedback** — Aprendizaje continuo
```typescript
{
  sessionId?: string
  question: string
  answer: string
  score: number            // 1-5 stars o -1/+1 thumbs
  comment?: string
}
```

---

## 🚀 Endpoints

### Consulta principal
```
POST /jarvis/query
{
  "message": "¿Qué temperatura hace en Paraná?",
  "sessionId": "uuid-opcional"
}
```

### Memoria
```
POST /jarvis/memory
{ "key": "backend", "value": "NestJS", "category": "preference", "importance": 8 }

GET /jarvis/memory/:key
GET /jarvis/memory
```

### Documentos
```
POST /jarvis/document/ingest
{
  "title": "Guía Ollama",
  "content": "...",
  "category": "tech",
  "source": "https://ollama.com/docs"
}

GET /jarvis/document/search?q=ollama
```

### Perfil
```
GET /jarvis/profile
PATCH /jarvis/profile
{
  "name": "Juan",
  "timezone": "America/Argentina/Buenos_Aires",
  "preferences": { "theme": "dark" }
}
```

---

## 🔧 Configuración del LLM (Jarvis Optimizada)

```typescript
model: 'llama3.2:3b'
temperature: 0.2       // más determinista para asistente
numCtx: 4096           // contexto largo (antes 2048)
numPredict: 400
topP: 0.85
topK: 15
repeatPenalty: 1.1
stop: ['\n\n\n', 'User:', 'Usuario:', 'Pregunta:', 'Q:', 'Human:']
```

**Cambios clave:**
- `temperature: 0.2` → más consistente, menos creativo
- `numCtx: 4096` → mejor comprensión de contexto largo (memoria + docs + historial)

---

## 🧠 Flujo de Consulta

```
1. Usuario envía mensaje
   ↓
2. Guardar en ConversationMessage (role: user)
   ↓
3. ¿Hay tool que resuelva directo? (clima, feriados, etc)
   ├─ SÍ → responder desde tool
   └─ NO → continuar
   ↓
4. Construir prompt estructurado:
   - System: rol + reglas + perfil usuario
   - User: memoria + documentos + historial + pregunta
   ↓
5. Invocar LLM (Ollama)
   ↓
6. Guardar respuesta en ConversationMessage (role: assistant)
   ↓
7. Retornar al usuario
```

---

## 🛠️ Tools Pre-LLM (sin cambios)

Jarvis hereda las 8 herramientas especializadas del chatbot anterior:

- 🌤 **Clima** — Open-Meteo + Nominatim
- 📅 **Feriados** — Nager.Date API (Argentina)
- 🕐 **Hora** — WorldTimeAPI
- 🌍 **Países** — REST Countries
- 🔭 **Astronomía** — astronomy-engine (local)
- 🗓 **Calendario Maya** — cálculo matemático
- ✡️ **Calendario Hebreo** — jewish-date
- ➕ **Matemáticas** — mathjs + Newton API

**Regla:** si una tool puede resolver sin el LLM, lo hace. Ahorra tokens y latencia.

---

## 🇦🇷 Optimización para Argentina

### En el System Prompt
```
Idioma principal: Español de Argentina.
Reglas:
- Usar español rioplatense neutro.
- Priorizar contexto de Argentina.
- Usar pesos argentinos cuando corresponda.
- Utilizar sistema métrico.
- Timezone: America/Argentina/Buenos_Aires
```

### En el perfil por defecto
```typescript
timezone: 'America/Argentina/Buenos_Aires'
country: 'Argentina'
language: 'es-AR'
```

---

## 📈 Próximos pasos

### Corto plazo
- [ ] Implementar endpoint de Feedback
- [ ] Agregar más categorías de memoria
- [ ] Mejorar chunking (ventanas deslizantes en vez de párrafos)

### Mediano plazo
- [ ] **pgvector** — embeddings nativos en PostgreSQL
- [ ] **Planner** — descomponer tareas complejas en pasos
- [ ] **Tools argentinas** — dólar, inflación, cotizaciones, noticias

### Largo plazo
- [ ] Fine-tuning específico (solo si RAG + Memory no alcanza)
- [ ] Multi-modal (imágenes, PDFs)
- [ ] Agente autónomo con acceso a APIs externas

---

## 🔄 Migración desde el chatbot anterior

**Compatibilidad temporal:** los modelos `Product` y `Pregunta` siguen existiendo en el schema.

**Rutas:**
- `/aichat/*` → chatbot legacy (mantener hasta migración completa)
- `/jarvis/*` → nueva arquitectura

**Estrategia:**
1. Probar Jarvis en paralelo
2. Migrar historial de `Pregunta` a `ConversationMessage`
3. Deprecar `/aichat` progresivamente
4. Convertir productos a `Document` chunks si es necesario

---

## 💡 Filosofía de diseño

> **El LLM es un componente reemplazable.**

La inteligencia real de Jarvis está en:
- **Memoria** — recordar hechos sobre el usuario
- **RAG** — conocimiento estructurado y actualizable
- **Tools** — datos del mundo real (clima, feriados, etc)
- **Planner** — descomponer problemas complejos

Mañana podrías cambiar `llama3.2:3b` por `Qwen 3.5 8B`, `Gemma 4`, o `Llama 4` sin tocar casi nada de la arquitectura.

---

**Bienvenido a Jarvis 2026.** 🚀
