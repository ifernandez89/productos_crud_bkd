# JarBees (Jarvis) - Architecture & Design Report

**Project:** JarBees AI Assistant  
**Location:** `C:\Projects\productos_crud_bkd`  
**Last Updated:** July 2026  
**Report Generated:** Based on comprehensive codebase analysis

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technology Stack](#technology-stack)
3. [Project Structure](#project-structure)
4. [Core Architecture](#core-architecture)
5. [Database Schema](#database-schema)
6. [Memory System](#memory-system)
7. [Intent & Domain Routing](#intent--domain-routing)
8. [LLM Integration](#llm-integration)
9. [Tools & Capabilities](#tools--capabilities)
10. [Library & RAG System](#library--rag-system)
11. [Planner System](#planner-system)
12. [Skills Framework](#skills-framework)
13. [Authentication & Security](#authentication--security)
14. [Scheduled Jobs](#scheduled-jobs)
15. [API Endpoints](#api-endpoints)
16. [Configuration](#configuration)
17. [Data Flow](#data-flow)

---

## Executive Summary

JarBees is a **self-hosted, privacy-focused AI personal assistant** designed for a single user (the owner) in Paraná, Entre Ríos, Argentina. It combines:

- **Local LLM inference** (Ollama) with cloud fallback (OpenRouter)
- **Multi-model routing** for specialized tasks
- **Persistent memory** across conversations
- **Web scraping** for real-time information
- **RAG (Retrieval-Augmented Generation)** for knowledge management
- **Domain-specific tools** (sports, astrology, tasks, calendar)
- **Spanish (es-AR) locale** with Argentine cultural context

The system operates as a NestJS backend with PostgreSQL + pgvector for vector storage, implementing a sophisticated intent-routing pipeline that classifies user queries and routes them to appropriate handlers.

---

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Runtime** | Node.js | ≥18 | JavaScript runtime |
| **Framework** | NestJS | 10.x | Backend framework |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Database** | PostgreSQL | 15+ | Primary data store |
| **Vector DB** | pgvector | 0.7+ | Vector similarity search |
| **ORM** | Prisma | 6.x | Database access |
| **LLM (Local)** | Ollama | 0.6+ | Local model inference |
| **LLM (Cloud)** | OpenRouter | - | Cloud model fallback |
| **Embeddings** | nomic-embed-text | 1.5 | Vector embeddings |
| **Web Scraping** | Playwright + Cheerio | - | Dynamic/static scraping |
| **Auth** | Passport-JWT | - | JWT authentication |
| **Logging** | Winston | - | Structured logging |
| **Rate Limiting** | @nestjs/throttler | - | API rate limiting |
| **Validation** | class-validator + class-transformer | - | Input validation |

### LLM Models Used

| Model | Purpose | Provider |
|-------|---------|----------|
| `llama3.2:3b` | General conversation | Ollama (local) |
| `qwen3:4b` | Technical/code queries | Ollama (local) |
| `qwen2.5-vl` | Image/vision analysis | Ollama (local) |
| `mistralai/mistral-small-3.1-24b-instruct:free` | Cloud fallback | OpenRouter |

---

## Project Structure

```
productos_crud_bkd/
├── config/
│   ├── business-sources.json        # 30+ business source definitions
│   ├── capabilities.json            # Feature flags
│   └── jarvis.identity.json         # Identity configuration
├── prisma/
│   ├── migrations/                  # Database migrations
│   └── schema.prisma                # Database schema (15+ models)
├── skills/                          # Runtime skills (filesystem-based)
│   ├── assistant-behavior/          # Behavior rules
│   └── general-info/                # General information skills
├── src/
│   ├── app.module.ts                # Root NestJS module
│   ├── main.ts                      # Bootstrap, Swagger, CORS
│   ├── prisma/
│   │   └── prisma.service.ts        # Database connection
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts          # JWT authentication
│   │   ├── jwt.strategy.ts          # JWT validation
│   │   └── jwt.guard.ts             # Route protection
│   ├── users/
│   │   └── users.service.ts         # User management
│   ├── jobs/
│   │   └── daily-jobs.service.ts    # Cron jobs (8:00 AM briefing)
│   ├── productos/                   # Products CRUD (original codebase)
│   ├── personas/                    # Persons CRUD (original codebase)
│   └── jarvis/                      # *** CORE JARVIS MODULE ***
│       ├── jarvis.module.ts         # Dependency injection root
│       ├── jarvis.service.ts        # Main orchestrator (2084 lines)
│       ├── jarvis.controller.ts     # REST API (736 lines)
│       ├── config/
│       │   ├── jarvis-identity.service.ts
│       │   ├── capabilities.service.ts
│       │   └── business-sources/
│       │       └── business-sources.service.ts
│       ├── llm/
│       │   ├── llm-provider.interface.ts  # Unified interface
│       │   ├── ollama.provider.ts         # Local LLM (LangChain)
│       │   ├── openrouter.provider.ts     # Cloud LLM (HTTP)
│       │   └── llm-provider.factory.ts    # Provider selection
│       ├── memory/
│       │   ├── memory.service.ts           # Memory CRUD
│       │   ├── memory-extractor.service.ts # Auto-extract facts
│       │   └── knowledge-evolution.service.ts
│       ├── tools/
│       │   ├── intent/
│       │   │   ├── intent-router.service.ts   # Intent classification
│       │   │   ├── intent.classifier.ts       # Regex patterns
│       │   │   └── domain-router.service.ts   # Domain routing
│       │   ├── browser/
│       │   │   └── browser-tool.service.ts    # Web scraping
│       │   ├── web/
│       │   │   ├── web-helper.ts              # DuckDuckGo + scraping
│       │   │   ├── source-registry.ts         # Source catalog
│       │   │   ├── investigation.service.ts   # URL investigation
│       │   │   ├── investigation.utils.ts     # Command parsing
│       │   │   └── content-cache.service.ts   # TTL cache
│       │   ├── sports/
│       │   │   ├── sports-tool.service.ts
│       │   │   └── sports-scraper.helper.ts
│       │   ├── astrology/
│       │   │   └── astrology-tool.service.ts
│       │   ├── vision/
│       │   │   └── vision.service.ts          # Image analysis
│       │   ├── tasks/
│       │   │   └── task-reminder.service.ts
│       │   ├── google/
│       │   │   ├── google-calendar.service.ts
│       │   │   └── google-tasks.service.ts
│       │   └── registry/
│       │       └── tool-registry.service.ts   # Tool registration
│       ├── library/
│       │   ├── library.module.ts
│       │   ├── document-ingest.service.ts     # PDF/text/URL ingestion
│       │   ├── embeddings.service.ts          # Vector embeddings
│       │   ├── document-enrichment.service.ts # Auto-enrich docs
│       │   ├── category-summary.service.ts    # Category summaries
│       │   ├── document-summary.service.ts    # Doc summaries
│       │   ├── document-compare.service.ts    # Doc comparison
│       │   ├── knowledge-test.service.ts      # RAG validation
│       │   ├── dashboard.service.ts           # System stats
│       │   ├── rss-ingest.service.ts          # RSS feed ingestion
│       │   ├── sitemap-crawler.service.ts     # Sitemap crawling
│       │   └── business-source.service.ts     # Business sources
│       ├── planner/
│       │   ├── planner.service.ts             # Task decomposition
│       │   └── execution-engine.service.ts    # Step execution
│       ├── skills/
│       │   ├── skill-registry.service.ts      # Filesystem skills
│       │   ├── skill.interface.ts
│       │   └── skill-loader.service.ts
│       └── repositories/
│           ├── agent-run.repository.ts
│           ├── conversation.repository.ts
│           ├── memory.repository.ts
│           ├── document.repository.ts
│           ├── user-profile.repository.ts
│           ├── task.repository.ts
│           └── session-summary.repository.ts
└── test/                           # Jest test files
```

---

## Core Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer (REST)                         │
│                  jarvis.controller.ts (736 lines)               │
│           POST /jarbees/query | GET /jarbees/history            │
├─────────────────────────────────────────────────────────────────┤
│                     Orchestration Layer                         │
│                jarvis.service.ts (2084 lines)                   │
│   Intent Router → Domain Router → Handler → Response Builder    │
├─────────────────────────────────────────────────────────────────┤
│                        LLM Layer                                │
│         Ollama (local) ◄──► OpenRouter (cloud)                 │
│         Multi-model routing with fallback                       │
├─────────────────────────────────────────────────────────────────┤
│                      Tools Layer                                │
│   Browser | Sports | Astrology | Tasks | Google | Vision       │
├─────────────────────────────────────────────────────────────────┤
│                    Library Layer (RAG)                          │
│   Ingestion | Embeddings | Search | Summarization | Enrichment │
├─────────────────────────────────────────────────────────────────┤
│                    Memory Layer                                 │
│   Extraction | Knowledge Evolution | Session Summaries         │
├─────────────────────────────────────────────────────────────────┤
│                    Data Layer                                   │
│           Prisma ORM ◄──► PostgreSQL + pgvector                │
└─────────────────────────────────────────────────────────────────┘
```

### Core Query Pipeline

```
User Input
    │
    ▼
┌──────────────────┐
│ Normalize Input  │ (lowercase, trim, normalize accents)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Intent Router   │ (regex patterns first, then LLM fallback)
│  12 Intent Types │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Domain Router   │ (20+ domains with prioritized sources)
│  Regex-based     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Handler         │ (intent-specific processing)
│  - Tool execution│
│  - Web scraping  │
│  - RAG search    │
│  - LLM generation│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Post-Processing │
│  - Store memory  │
│  - Save conversation
│  - Build response│
└────────┬─────────┘
         │
         ▼
      Response
```

---

## Database Schema

### Core Models (Prisma)

```prisma
// Identity & Auth
model User {
  id        Int      @id @default(autoincrement())
  username  String   @unique
  password  String   // bcrypt hashed
  createdAt DateTime @default(now())
}

// User Context
model UserProfile {
  id            Int      @id @default(autoincrement())
  name          String?
  timezone      String   @default("America/Argentina/Buenos_Aires")
  country       String   @default("Argentina")
  language      String   @default("es-AR")
  preferences   Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Persistent Memory
model Memory {
  id            Int      @id @default(autoincrement())
  category      String   // "preference", "fact", "habit", "context"
  key           String   // "nombre", "deporte_favorito"
  value         String   // "Nacho", "fútbol"
  confidence    Float    @default(0.8)
  source        String?  // "conversation", "explicit"
  lastConfirmed DateTime?
  timesConfirmed Int     @default(1)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Conversation History
model ConversationMessage {
  id            Int      @id @default(autoincrement())
  sessionId     String
  role          String   // "user", "assistant", "system"
  content       String
  intent        String?  // "GENERAL", "LOCAL", "WEB", etc.
  domain        String?  // "deportes", "astronomia", etc.
  tokensUsed    Int?
  responseTimeMs Int?
  modelUsed     String?  // "llama3.2:3b", "qwen3:4b", etc.
  createdAt     DateTime @default(now())
  
  @@index([sessionId])
}

// Knowledge Base (RAG)
model Document {
  id            Int      @id @default(autoincrement())
  title         String
  content       String   // Full text
  category      String?  // "general", "noticias", "tecnologia", etc.
  source        String?  // "manual", "rss", "web_scrape"
  sourceId      Int?     // FK to Source
  metadata      Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  chunks        Chunk[]
  summaries     DocumentSummary[]
  sourceRel     Source?  @relation(fields: [sourceId], references: [id])
}

model Chunk {
  id            Int      @id @default(autoincrement())
  documentId    Int
  content       String   // Chunk text
  embeddingId   String?  // Reference to vector embedding
  metadata      String?  // JSON string
  createdAt     DateTime @default(now())
  
  document      Document @relation(fields: [documentId], references: [id])
}

// Web Scraping Cache
model Source {
  id            Int      @id @default(autoincrement())
  name          String
  urlBase       String   @unique
  category      String
  priority      Int      @default(5) // 1=highest
  ttlHours      Int      @default(24)
  lastScraped   DateTime?
  createdAt     DateTime @default(now())
  
  pages         ScrapedPage[]
  documents     Document[]
}

model ScrapedPage {
  id            Int      @id @default(autoincrement())
  sourceId      Int
  url           String   @unique
  contentHash   String?
  scrapedAt     DateTime @default(now())
  expiresAt     DateTime
  status        String   @default("valid")
  cacheHits     Int      @default(0)
  lastAccessed  DateTime?
  
  source        Source   @relation(fields: [sourceId], references: [id])
  content       ScrapedContent?
}

model ScrapedContent {
  id            Int      @id @default(autoincrement())
  pageId        Int      @unique
  textExtracted String
  htmlRaw       String?
  metadata      Json?
  createdAt     DateTime @default(now())
  
  page          ScrapedPage @relation(fields: [pageId], references: [id])
}

// Task Planning
model Task {
  id            Int      @id @default(autoincrement())
  sessionId     String?
  objective     String
  status        String   @default("pending")
  priority      String   @default("normal")
  category      String?
  project       String?
  result        String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  steps         TaskStep[]
}

model TaskStep {
  id            Int      @id @default(autoincrement())
  taskId        Int
  stepNumber    Int
  description   String
  status        String   @default("pending")
  result        String?
  createdAt     DateTime @default(now())
  
  task          Task     @relation(fields: [taskId], references: [id])
}

// Session Management
model SessionSummary {
  id            Int      @id @default(autoincrement())
  sessionId     String   @unique
  summary       String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Knowledge Evolution Tracking
model TopicEvolution {
  id            Int      @id @default(autoincrement())
  topic         String
  summary       String
  mentionCount  Int      @default(1)
  firstMentioned DateTime @default(now())
  lastMentioned  DateTime @default(now())
  metadata      Json?
}

// RSS Feeds
model RSSFeed {
  id            Int      @id @default(autoincrement())
  name          String
  url           String   @unique
  category      String
  lastFetched   DateTime?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
}

model RSSItem {
  id            Int      @id @default(autoincrement())
  feedId        Int
  title         String
  link          String
  content       String?
  publishedAt   DateTime?
  ingestedAt    DateTime @default(now())
  
  feed          RSSFeed  @relation(fields: [feedId], references: [id])
}
```

---

## Memory System

### 5-Layer Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: UserProfile                                            │
│ - Name, timezone, country, language                            │
│ - Preferences (JSON)                                           │
│ - Single record per system                                      │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Memory (Persistent Facts)                              │
│ - Category: preference, fact, habit, context                   │
│ - Key-value pairs with confidence scoring                      │
│ - Auto-extracted from conversations                            │
│ - Tracks confirmation count                                    │
├─────────────────────────────────────────────────────────────────┤
│ Layer 3: ConversationMessage                                    │
│ - Full conversation history with metadata                      │
│ - Intent and domain labels                                     │
│ - Token usage and response time tracking                       │
├─────────────────────────────────────────────────────────────────┤
│ Layer 4: ScrapedContent                                         │
│ - Cached web content with TTL expiration                       │
│ - Source prioritization                                        │
│ - Content hashing for change detection                         │
├─────────────────────────────────────────────────────────────────┤
│ Layer 5: KnowledgeEvolution                                     │
│ - Topic mention tracking over time                             │
│ - Summary generation for evolving topics                       │
│ - Trend detection                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Extraction Pipeline

```typescript
// Automatic fact extraction from conversations
// File: memory-extractor.service.ts

interface ExtractedMemory {
  category: string;      // "preference", "fact", "habit", "context"
  key: string;           // "nombre", "deporte_favorito"
  value: string;         // "Nacho", "fútbol"
  confidence: number;    // 0.0 - 1.0
  source: string;        // "conversation", "explicit"
}

// Extraction triggers:
// - User explicitly states: "Mi nombre es Nacho"
// - User mentions preferences: "Me gusta el fútbol"
// - User describes habits: "Siempre tomo mate por la mañana"
// - Context inference: Location mentions, time patterns
```

### Memory Retrieval Strategy

1. **Explicit Memory Check**: Query `Memory` table for exact key matches
2. **Context Injection**: Prepend relevant memories to system prompt
3. **Confidence Scoring**: Filter memories by confidence threshold (≥0.5)
4. **Recency Weighting**: Prioritize recently confirmed memories

---

## Intent & Domain Routing

### Intent Classification (12 Types)

| Intent | Pattern Examples | Handler |
|--------|-----------------|---------|
| `LOCAL` | "clima en paraná", "noticias de entrerios" | Local web scraping |
| `WEB` | "buscar información sobre...", "qué es..." | DuckDuckGo + scraping |
| `URL` | Direct URL mentions | URL investigation pipeline |
| `RAG` | "resume el documento...", "compara..." | Library/RAG system |
| `TOOL` | "cuánto es 2+2", "hora actual" | Registered tools |
| `SPORTS` | "resultado de river", "partidos hoy" | Sports tool (TheSportsDB) |
| `ASTROLOGY` | "predicción hoy", "horóscopo" | Astronomy engine calculations |
| `REPEAT` | "repite", "dilo de nuevo" | Repeat last response |
| `CALENDAR` | "qué tengo mañana", "agrega evento" | Google Calendar API |
| `TASKS` | "mis tareas", "crea tarea pendiente" | Google Tasks API |
| `SITE_SEARCH` | "busca en el sitio...", "dentro del sitio" | Site-specific search |
| `MATH` | "cuánto es...", "calcula..." | Math.js evaluation |

### Classification Flow

```
User Input
    │
    ▼
┌──────────────────────┐
│ Regex Pattern Match  │ (Priority 1: Fast, deterministic)
│ 50+ regex patterns   │
└──────────┬───────────┘
           │ No match
           ▼
┌──────────────────────┐
│ LLM Classification   │ (Priority 2: Flexible, slower)
│ Prompt: "Classify..."│
└──────────┬───────────┘
           │
           ▼
      Intent + Domain
```

### Domain Classification (20+ Domains)

| Domain | Keywords | Source Priority |
|--------|----------|-----------------|
| `deportes` | "fútbol", "river", "boca", "partido" | ESPN, Olé, TheSportsDB |
| `astronomia` | "planeta", "estrella", "luna", "sol" | NASA, space.com |
| `tecnologia` | "computadora", "software", "app" | TechCrunch, MIT Tech Review |
| `ciencia` | "investigación", "estudio", "descubrimiento" | Nature, Science |
| `economia` | "dólar", "inflación", "Bolsa" | Ámbito Financiero |
| `salud` | "medicina", "ejercicio", "dieta" | OMS, MSal |
| `politica` | "gobierno", "elecciones", "leyes" | Infobae, La Nación |
| `entretenimiento` | "película", "serie", "música" | IMDB, Spotify |
| `educacion` | "curso", "tutorial", "aprender" | Coursera, Khan Academy |
| `cocina` | "receta", "comida", "cocinar" | Directo al Paladar |
| `viajes` | "destino", "hotel", "vuelo" | TripAdvisor |
| ... | ... | ... |

### Source Prioritization

```typescript
// File: source-registry.ts

interface SourceDefinition {
  name: string;
  urlBase: string;
  searchPath: string;
  category: string;
  priority: number;      // 1=highest (national), 10=lowest (general)
  selectors?: Record<string, string>;
  ttlHours: number;      // Cache duration
  requiresScraping: boolean;
}

// Priority levels:
// 1-2: National sources (La Nación, Infobae, Clarín)
// 3-4: Regional sources (El Diario, InfoBae Rosario)
// 5-6: Local sources (Municipalidad de Paraná)
// 7-8: Sector-specific (ESPN, Mercado Libre)
// 9-10: General (DuckDuckGo fallback)
```

---

## LLM Integration

### Multi-Model Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Provider Factory                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────┐              │
│  │  Ollama Provider │         │ OpenRouter Provider│             │
│  │  (Local)         │         │ (Cloud)           │             │
│  ├─────────────────┤         ├─────────────────┤              │
│  │ - llama3.2:3b   │         │ - mistral-small  │              │
│  │   (general)     │         │   3.1-24b        │              │
│  │ - qwen3:4b      │         │   (free tier)    │              │
│  │   (technical)   │         └─────────────────┘              │
│  │ - qwen2.5-vl    │                                           │
│  │   (vision)      │         Fallback Order:                   │
│  └─────────────────┘         1. Primary (selected model)       │
│                              2. Secondary (different model)     │
│                              3. Cloud (OpenRouter)              │
└─────────────────────────────────────────────────────────────────┘
```

### Model Selection Logic

```typescript
// File: llm-provider.factory.ts

interface ModelSelection {
  model: string;
  provider: 'ollama' | 'openrouter';
  purpose: 'general' | 'technical' | 'vision' | 'classification';
}

// Selection rules:
// - General conversation → llama3.2:3b (fast, local)
// - Technical/code queries → qwen3:4b (better at code)
// - Image analysis → qwen2.5-vl (multimodal)
// - Intent classification → llama3.2:3b (fast inference)
// - Complex reasoning → OpenRouter (mistral-small-3.1-24b)
// - Fallback → OpenRouter (cloud) if local fails
```

### Prompt Engineering

```typescript
// System prompt structure (simplified)
const systemPrompt = `
Eres JarBees, un asistente IA personal.
Ubicación: Paraná, Entre Ríos, Argentina.
Idioma: Español argentino (es-AR).
Hora actual: ${new Date().toISOString()}

Memoria del usuario:
${memoryContext}

Capacidades:
${capabilitiesList}
`;
```

---

## Tools & Capabilities

### Registered Tools

| Tool | Description | Implementation |
|------|-------------|----------------|
| `weather` | Current weather for Paraná | OpenWeatherMap API |
| `time` | Current date/time | Native Date API |
| `math` | Mathematical expressions | Math.js library |
| `web_search` | DuckDuckGo search | Web scraping |
| `sports` | Sports results/fixtures | TheSportsDB API |
| `astrology` | Astronomical calculations | astronomy-engine |
| `vision` | Image analysis | qwen2.5-vl model |
| `tasks` | Local task management | Prisma DB |
| `google_calendar` | Google Calendar events | Google API |
| `google_tasks` | Google Tasks | Google API |
| `investigate_url` | Deep URL analysis | Playwright scraping |
| `library` | Document management | RAG system |

### Browser Tool (Web Scraping)

```typescript
// File: browser-tool.service.ts

// Scraping pipeline:
// 1. Try axios + cheerio (fast, static pages)
// 2. Fallback to Playwright (dynamic, JS-rendered)
// 3. Extract content with CSS selectors
// 4. Clean HTML → plain text
// 5. Cache result with TTL

interface ScrapedResult {
  url: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  scrapedAt: Date;
  source: string;
}
```

### Sports Tool

```typescript
// File: sports-tool.service.ts

// Data sources:
// 1. TheSportsDB API (primary) - free, no key required
// 2. Web scraping fallback (ESPN, Olé)
// 3. Content cache (2-hour TTL)

// Capabilities:
// - Team search
// - Match results
// - Upcoming fixtures
// - League standings
// - Player information
```

### Vision Tool

```typescript
// File: vision.service.ts

// Uses qwen2.5-vl model via Ollama
// Supports: JPEG, PNG, WebP
// Max size: 10MB
// Features:
// - Image description
// - Text extraction (OCR)
// - Object detection
// - Scene analysis
```

---

## Library & RAG System

### Ingestion Pipeline

```
Input Sources
    │
    ├─► PDF Files ──────────────────┐
    ├─► Text Files ─────────────────┤
    ├─► URLs ───────────────────────┤
    ├─► RSS Feeds ──────────────────┤
    └─► Sitemaps ───────────────────┘
                                  │
                                  ▼
                    ┌──────────────────────────┐
                    │  Document Ingestion       │
                    │  (document-ingest.service)│
                    ├──────────────────────────┤
                    │  1. Extract text          │
                    │  2. Normalize encoding    │
                    │  3. Detect language       │
                    │  4. Extract metadata      │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │  Chunking                 │
                    │  - Split by paragraphs    │
                    │  - Overlap: 200 chars     │
                    │  - Max chunk: 1500 chars  │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │  Embeddings               │
                    │  Model: nomic-embed-text  │
                    │  Dimensions: 768          │
                    │  Storage: pgvector        │
                    └────────────┬─────────────┘
                                 │
                                 ▼
                    ┌──────────────────────────┐
                    │  Enrichment               │
                    │  - Auto-summary           │
                    │  - Key concepts           │
                    │  - Entities               │
                    │  - Category assignment    │
                    └──────────────────────────┘
```

### RAG Query Flow

```
User Query
    │
    ▼
┌──────────────────────────┐
│  Query Embedding          │
│  (nomic-embed-text)       │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Vector Similarity Search│
│  pgvector cosine search  │
│  Top-k: 10 results       │
│  Threshold: 0.7          │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Re-ranking              │
│  - Relevance scoring     │
│  - Diversity filtering   │
│  - Source prioritization │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  Context Assembly        │
│  - Top 5 chunks          │
│  - Document metadata     │
│  - Source attribution    │
└────────────┬─────────────┘
             │
             ▼
┌──────────────────────────┐
│  LLM Generation          │
│  - System prompt + ctx   │
│  - User query            │
│  - Response with sources │
└──────────────────────────┘
```

### Document Enrichment

```typescript
// File: document-enrichment.service.ts

// Auto-enrichment pipeline:
// 1. Generate summary (LLM)
// 2. Extract key concepts (LLM)
// 3. Identify entities (NER)
// 4. Assign category (classification)
// 5. Generate embedding (nomic-embed-text)
// 6. Store metadata in JSON
```

---

## Planner System

### Task Decomposition

```typescript
// File: planner.service.ts

interface Plan {
  id: string;
  objective: string;
  steps: PlanStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: Date;
}

interface PlanStep {
  stepNumber: number;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: string;
  tool?: string;
  dependsOn?: number[];
}

// Planning flow:
// 1. Analyze user objective
// 2. Decompose into steps (LLM)
// 3. Identify required tools
// 4. Determine dependencies
// 5. Execute step-by-step
// 6. Handle failures with retry
// 7. Aggregate final result
```

### Execution Engine

```typescript
// File: execution-engine.service.ts

// Execution strategy:
// - Sequential by default
// - Parallel when no dependencies
// - Retry on failure (max 2 attempts)
// - Timeout per step (30 seconds)
// - Rollback on critical failure
```

---

## Skills Framework

### Skill Interface

```typescript
// File: skill.interface.ts

interface Skill {
  name: string;
  description: string;
  version: string;
  triggers: string[];           // Regex patterns
  execute: (input: string) => Promise<SkillResult>;
  metadata: {
    author: string;
    category: string;
    tags: string[];
  };
}

interface SkillResult {
  success: boolean;
  output: string;
  data?: any;
  metadata?: Record<string, any>;
}
```

### Skill Registry

```typescript
// File: skill-registry.service.ts

// Skills loaded from filesystem:
// - skills/assistant-behavior/  → Behavior rules
// - skills/general-info/        → General knowledge
// - Runtime: skills/*.skill.json

// Loading process:
// 1. Scan skills directories
// 2. Parse skill.json manifests
// 3. Validate skill interface
// 4. Register with triggers
// 5. Hot-reload on file change
```

---

## Authentication & Security

### JWT Authentication

```typescript
// File: auth.service.ts

// Single-user model (owner only):
// - Username: configured in .env
// - Password: bcrypt hashed
// - JWT token: 7-day expiry
// - Secret: from JWT_SECRET env var

interface AuthToken {
  sub: number;        // User ID
  username: string;
  iat: number;        // Issued at
  exp: number;        // Expiry
}
```

### Security Features

- **Rate Limiting**: 60 requests/minute (configurable)
- **CORS**: Configurable allowed origins
- **Input Validation**: class-validator on all DTOs
- **SQL Injection**: Prisma parameterized queries
- **XSS**: Content sanitization on responses
- **Auth Guard**: JWT validation on protected routes

---

## Scheduled Jobs

### Daily Jobs

```typescript
// File: daily-jobs.service.ts

// Cron: 0 8 * * * (8:00 AM daily)
// Timezone: America/Argentina/Buenos_Aires

interface MorningBriefing {
  weather: string;           // Current weather in Paraná
  news: string[];            // Top 5 headlines
  tasks: string[];           // Pending tasks
  calendar: string[];        // Today's events
  sports: string[];          // Recent results
}

// Execution flow:
// 1. Fetch weather data
// 2. Scrape morning news (priority sources)
// 3. Query pending tasks
// 4. Check Google Calendar
// 5. Fetch sports results
// 6. Generate briefing summary (LLM)
// 7. Store as conversation message
```

---

## API Endpoints

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/jarbees/query` | Main chat interface |
| `GET` | `/jarbees/history` | Get conversation history |
| `GET` | `/jarbees/memory` | Get user memories |
| `POST` | `/jarbees/memory` | Add explicit memory |
| `DELETE` | `/jarbees/memory/:id` | Delete memory |
| `POST` | `/jarbees/ingest` | Ingest document to library |
| `GET` | `/jarbees/library` | List documents |
| `POST` | `/jarbees/library/search` | RAG search |
| `GET` | `/jarbees/stats` | System statistics |
| `POST` | `/jarbees/investigate` | Investigate URL |
| `POST` | `/auth/login` | Get JWT token |
| `GET` | `/auth/profile` | Get current user |

### Request/Response Examples

#### POST /jarbees/query

```json
// Request
{
  "message": "¿Qué tiempo hace en Paraná?",
  "sessionId": "abc-123",
  "context": {
    "location": "Paraná, Entre Ríos"
  }
}

// Response
{
  "response": "En Paraná actualmente hace 22°C con cielos parcialmente nublados...",
  "intent": "LOCAL",
  "domain": "clima",
  "model": "llama3.2:3b",
  "responseTimeMs": 1250,
  "sessionId": "abc-123"
}
```

#### POST /jarbees/ingest

```json
// Request (multipart/form-data)
{
  "file": "document.pdf",
  "category": "tecnologia",
  "metadata": {
    "author": "Nacho",
    "tags": ["typescript", "nestjs"]
  }
}

// Response
{
  "success": true,
  "documentId": 42,
  "title": "typescript-guide.pdf",
  "chunks": 15,
  "enrichment": {
    "summary": "Guía completa de TypeScript...",
    "concepts": ["generics", "decorators", "type-inference"]
  }
}
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/jarvis_db

# LLM
OLLAMA_BASE_URL=http://localhost:11434
DEFAULT_MODEL=llama3.2:3b
TECHNICAL_MODEL=qwen3:4b
VISION_MODEL=qwen2.5-vl

# OpenRouter (fallback)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=mistralai/mistral-small-3.1-24b-instruct:free

# Auth
JWT_SECRET=your-secret-key
JWT_EXPIRY=7d
OWNER_USERNAME=nacho
OWNER_PASSWORD_HASH=$2b$10$...

# APIs
OPENWEATHER_API_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Server
PORT=3000
CORS_ORIGINS=http://localhost:3001
RATE_LIMIT_TTL=60
RATE_LIMIT_MAX=60
```

### Feature Flags (capabilities.json)

```json
{
  "weather": true,
  "sports": true,
  "astronomy": true,
  "vision": true,
  "google_calendar": true,
  "google_tasks": true,
  "library": true,
  "planner": true,
  "skills": true,
  "memory_extraction": true,
  "web_scraping": true,
  "business_sources": true
}
```

### Identity (jarvis.identity.json)

```json
{
  "name": "JarBees",
  "personality": "Amigable, servicial, con humor argentino",
  "language": "es-AR",
  "timezone": "America/Argentina/Buenos_Aires",
  "location": {
    "city": "Paraná",
    "province": "Entre Ríos",
    "country": "Argentina"
  },
  "greetings": [
    "¡Hola! Soy JarBees, tu asistente personal.",
    "¡Buenas! ¿En qué puedo ayudarte?"
  ]
}
```

---

## Data Flow

### Complete Request Lifecycle

```
1. HTTP Request (POST /jarbees/query)
   │
   ▼
2. Auth Guard (JWT validation)
   │
   ▼
3. Rate Limiter (60 req/min)
   │
   ▼
4. Input Validation (class-validator)
   │
   ▼
5. Jarvis Controller (parse request)
   │
   ▼
6. Jarvis Service (orchestrator)
   │
   ├─► 6a. Normalize Input (lowercase, trim)
   │
   ├─► 6b. Intent Router (regex → LLM)
   │   │
   │   └─► Return: { intent: "LOCAL", domain: "clima" }
   │
   ├─► 6c. Domain Router (source selection)
   │   │
   │   └─► Return: { sources: ["openweather", "infobae"] }
   │
   ├─► 6d. Handler Execution
   │   │
   │   ├─► Web Scraping (if LOCAL/WEB intent)
   │   │   ├─► Check Content Cache
   │   │   ├─► Scrape if miss (Playwright)
   │   │   ├─► Cache result (TTL)
   │   │   └─► Return scraped content
   │   │
   │   ├─► RAG Search (if RAG intent)
   │   │   ├─► Query embedding
   │   │   ├─► Vector similarity search
   │   │   ├─► Re-rank results
   │   │   └─► Return context
   │   │
   │   ├─► Tool Execution (if TOOL intent)
   │   │   ├─► Weather API call
   │   │   ├─► Math evaluation
   │   │   └─► Return tool result
   │   │
   │   └─► LLM Generation (fallback)
   │       ├─► Build system prompt
   │       ├─► Inject memory context
   │       ├─► Call Ollama/OpenRouter
   │       └─► Return generated text
   │
   ├─► 6e. Memory Extraction
   │   ├─► Analyze conversation
   │   ├─► Extract new facts
   │   └─► Store/update Memory table
   │
   ├─► 6f. Knowledge Evolution
   │   ├─► Update topic mentions
   │   └─► Regenerate summaries
   │
   ├─► 6g. Conversation Storage
   │   ├─► Store user message
   │   ├─► Store assistant response
   │   └─► Update session summary
   │
   └─► 6h. Response Builder
       ├─► Format response
       ├─► Add metadata (intent, domain, model)
       └─► Calculate response time
   │
   ▼
7. HTTP Response (200 OK)
   │
   └─► {
         "response": "...",
         "intent": "LOCAL",
         "domain": "clima",
         "model": "llama3.2:3b",
         "responseTimeMs": 1250
       }
```

### Error Handling Flow

```
Error Occurs
    │
    ▼
┌──────────────────────┐
│  Catch Exception     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Log Error (Winston) │
│  - Stack trace       │
│  - Request context   │
│  - User ID           │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Classify Error      │
│  - Client error (4xx)│
│  - Server error (5xx)│
│  - LLM error         │
│  - Network error     │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Fallback Strategy   │
│  - Try backup model  │
│  - Use cached data   │
│  - Return error msg  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│  Error Response      │
│  { success: false,   │
│    error: "..." }    │
└──────────────────────┘
```

---

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| **Avg Response Time** | 1-3 seconds | Local LLM |
| **Cloud Fallback** | 3-5 seconds | OpenRouter |
| **Web Scraping** | 2-8 seconds | Per source |
| **RAG Search** | 200-500ms | Vector similarity |
| **Cache Hit Rate** | ~60-70% | TTL-based |
| **Memory Extraction** | ~500ms | Background |
| **Embedding Generation** | ~100ms | Per chunk |
| **Max Concurrent Users** | 1 (single-user) | By design |
| **Rate Limit** | 60 req/min | Configurable |

---

## Deployment

### Docker (Recommended)

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  jarvis:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/jarvis_db
      - OLLAMA_BASE_URL=http://ollama:11434
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      - db
      - ollama

  db:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=jarvis_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    ports:
      - "11434:11434"

volumes:
  postgres_data:
  ollama_data:
```

---

## Summary

JarBees is a sophisticated, self-hosted AI assistant that combines:

1. **Multi-layered architecture** with clear separation of concerns
2. **Hybrid LLM approach** (local + cloud) for reliability and privacy
3. **Persistent memory** across sessions with automatic extraction
4. **Domain-specific routing** for 20+ topics with prioritized sources
5. **RAG system** for document management and knowledge retrieval
6. **Extensible tool framework** with 12+ built-in tools
7. **Planner system** for complex task decomposition
8. **Skills framework** for runtime extensibility
9. **Argentine localization** with local news, weather, and cultural context

The system is designed for **single-user deployment** with emphasis on **privacy**, **performance**, and **extensibility**.

---

**Report Complete** ✓
