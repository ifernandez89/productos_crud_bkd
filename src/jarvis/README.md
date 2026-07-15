# Jarvis — Arquitectura actual del sistema

Jarvis ya no es solo un chatbot de rutas antiguas. En el repo actual funciona como el motor principal de JarBees con memoria persistente, RAG contextual, planner, browser, Google Workspace y observabilidad.

---

## 🏗️ Arquitectura real

```
Usuario
  ↓
JarvisController (/api/jarbees)
  ↓
JarvisService (orquestador)
  ├─ IntentRouter (clasificación rápida + LLM fallback)
  ├─ JarvisCommandService (comandos y accesos directos)
  ├─ JarvisPromptBuilderService (prompt enriquecido)
  ├─ JarvisKnowledgeService + CorpusSelectorService (RAG local)
  ├─ JarvisWebSearchService + BrowserToolService (web y scraping)
  └─ Planner / ExecutionEngine (planes multi-paso)
  ↓
Tools Layer
  ├─ AssistantToolsService
  ├─ Google Calendar / Tasks / Gmail / Drive / YouTube
  ├─ AstrologyTool
  └─ SportsTool
  ↓
Memory + Knowledge + Observability
  ├─ MemoryRepository / ConversationRepository
  ├─ DocumentRepository / Chunk / Collection
  ├─ AgentRun / Feedback / SessionSummary
  └─ KnowledgeEvolutionService
  ↓
LLM Provider (Ollama o OpenRouter)
```

---

## 🔧 Estado actual del diseño

### Lo que está implementado
- Ruta principal: `POST /api/jarbees/query`
- Historial persistente por sesión con `ConversationMessage`
- Memoria permanente con `Memory` y `MemoryChunk`
- RAG local con documentos + chunks + embeddings
- Planner y `ExecutionEngine` para objetivos complejos
- Búsqueda web y scraping con Playwright
- Integraciones de Google Workspace y tools directas
- Observabilidad con `AgentRun`, `Feedback` y `SessionSummary`

### Lo que sigue siendo importante
- El LLM sigue siendo un componente intercambiable, pero la lógica real está en el orquestador y en las capas de conocimiento y herramientas.
- La arquitectura está más cerca de un OS personal que de un chatbot clásico.

---

## 📍 Rutas reales

```bash
POST /api/jarbees/query
GET  /api/jarbees/history
POST /api/jarbees/memory
GET  /api/jarbees/memory
POST /api/jarbees/planner/execute
POST /api/jarbees/library/document
POST /api/jarbees/browser/search
GET  /api/jarbees/identity
GET  /api/jarbees/capabilities
```

---

## 🧠 Principios actuales

- Priorizar herramientas directas cuando la respuesta es calculable o local.
- Usar RAG y memoria antes de recurrir a la web si el contexto local es suficiente.
- Permitir modos persistentes de búsqueda (`OFFLINE`, `LOCAL_FIRST`, `HYBRID`, `WEB_FIRST`).
- Mantener observabilidad y recuperación de contexto para que el sistema sea corregible y evolutivo.

---

## ✅ Resumen

La arquitectura actual ya no corresponde a una versión antigua de “Jarvis 5 capas”. El diseño real del repo está orientado a un asistente híbrido, modular y con ejecución multi-capa sobre NestJS.
