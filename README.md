# 🧠 JarBees 3.2 — Sistema Operativo Cognitivo y Asistente Personal Inteligente

Backend modular en **NestJS + TypeScript** con arquitectura de memoria multi-capa, **Gateway de Inferencia local sobre GPU (NVIDIA RTX 5070 12GB)**, **Laboratorio de Evolución Cognitiva con Aprobación Humana (HITL)**, **RAG vectorial nativo en PostgreSQL (pgvector bge-m3 1024D)**, **Grafo de Conocimiento Semántico** y **Pipeline de Audio Neuronal**.

---

## 🏛️ Visión General y Arquitectura

JarBees no es un simple chatbot ni un wrapper de modelos externos. Es un **sistema cognitivo autónomo y auditable** donde el LLM es un componente de razonamiento desacoplado e intercambiable, y la inteligencia persistente reside en sus capas de memoria, ontología y validación empírica:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ENTRADA DE USUARIO                              │
│              HTTP REST (/api/jarbees/query) | Audio WAV / MP3          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     CANAL DE VOZ DE ALTA FIDELIDAD                     │
│    STT: faster-whisper (int8 + VAD) │ TTS: edge-tts (Tomas/Elena 24kHz)│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ORQUESTACIÓN COGNITIVA                          │
│   IntentRouterService (clasificación semántica) │ QICA 2.0             │
│   TaskReminderService │ AstrologyTool (VSOP87) │ InvestigationService   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        CAPA DE CONOCIMIENTO (RAG)                      │
│   • pgvector (bge-m3 1024D HNSW) — 57.700+ fragmentos semánticos       │
│   • Knowledge Graph (KGraph v1): KnowledgeEntity + KnowledgeRelation   │
│   • DialecticReasoningService (Tesis / Antítesis / Síntesis)           │
│   • EvidenceGatekeeperService (Verificación contra fuentes primarias)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 COGNITIVE EVOLUTION LAB & HITL GATEKEEPER              │
│   EvolutionSession (Máquina de estados: CREATED → COMMITTED)           │
│   CandidateKnowledge (Buffer aislado de RAG) │ Aprobación Humana Oblig.│
│   Rollback Verificable │ Evaluación Doble Ciego (Grupos A / B / C)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      INFERENCE GATEWAY (RTX 5070)                      │
│   Runtime local GPU: Qwen 3:8B (llama-server / CUDA 13 / Ollama)       │
│   Circuit Breaker │ Timeouts adaptativos │ Auto-healing en crash       │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Capacidades Principales

### 1. Cognitive Evolution Lab & Compuerta Humana (HITL)
- **Máquina de Estados Formal:** `CREATED → BASELINE → AUDITING → DELIBERATION → CANDIDATE_KNOWLEDGE → VALIDATION → PENDING_APPROVAL → COMMITTED`.
- **Aislamiento Estricto:** Todo conocimiento propuesto reside en `CandidateKnowledge` y permanece completamente invisible para el RAG general hasta su aprobación formal.
- **Firma Humana Obligatoria:** Ningún cambio puede alcanzar el estado `COMMITTED` sin la autorización explícita del operador humano.
- **Rollback Transaccional Verificable:** Capacidad de revertir cualquier versión previa, purgando los documentos y vectores vinculados sin dejar inconsistencias.
- **Protocolo de Control Independiente:** Evaluación científica ciega comparando tres grupos de control independientes:
  - **Grupo A:** Base Vanilla (sin RAG ni memoria).
  - **Grupo B:** RAG Semántico Puro (pgvector `bge-m3`).
  - **Grupo C:** Ecosistema Completo (RAG + Subgrafo de Entidades + TopicSnapshot).

### 2. Capa de Conocimiento y RAG Híbrido
- **PostgreSQL 18 + pgvector:** Búsqueda semántica nativa de 1024 dimensiones generada por `bge-m3:latest`.
- **Grafo de Conocimiento (KGraph v1):** Modelos `KnowledgeEntity` y `KnowledgeRelation` respaldados por `PendingRelation` (filtro de mitigación de alucinaciones).
- **TopicSnapshot:** Historial longitudinal de cómo evoluciona la comprensión conceptual y las conclusiones a lo largo del tiempo.
- **Biblioteca Estructurada:** Más de 225 documentos y 57.700 chunks estructurados por capítulos, secciones y jerarquía semántica.

### 3. Pipeline de Audio de Alta Fidelidad
- **Transcripción (STT):** Motor `faster-whisper` (1.2.1, cuantización `int8`, filtro VAD y detección automática de preguntas dobles/secuenciales).
- **Síntesis (TTS):** Generación neuronal mediante `edge-tts` (`es-AR-TomasNeural` y `es-AR-ElenaNeural`), emitiendo audio WAV a 24 kHz mono PCM sin artefactos robóticos.

### 4. Herramientas y Determinismo
- **Astronomía y Tiempo:** `AstrologyTool` y `DateMathTool` basados en algoritmos matemáticos deterministas (VSOP87 de `astronomy-engine`).
- **Traductor Universal:** Procesamiento por lotes de libros y subtítulos `.srt` con preservación de marcas temporales y salida en codificación ANSI (Windows-1252).
- **Procedural 3D & Blender:** Automatización headless de Blender (v5.x/4.x) y renderizado procedural.

---

## 🛠️ Stack Tecnológico y Hardware

- **Hardware de Producción:**
  - **GPU:** NVIDIA GeForce RTX 5070 (12 GB VRAM dedicada, CUDA 13.1).
  - **CPU:** Intel Core i7 12ª Gen (12700K).
  - **RAM:** 32 GB DDR4.
  - **Almacenamiento de Respaldo:** Unidad dedicada `G:\Backups\jarbees_data`.
- **Backend Core:** NestJS 10.x, TypeScript 5.x, Node.js 20+.
- **Base de Datos y Vectores:** PostgreSQL 18, `pgvector`, Prisma ORM 6.x.
- **Modelos de Inferencia Local:**
  - Razonamiento y Chat: `qwen3:8b` (GPU local vía `llama-server` / Ollama).
  - Embeddings: `bge-m3:latest` (1024 dimensiones nativas).
  - Traducción: `RogerBen/hy-mt1.5-1.8b` / `qwen3:4b`.

---

## 🚀 Puesta en Marcha

### 1. Variables de Entorno (`.env`)
```env
# Base de datos PostgreSQL con pgvector
DATABASE_URL="postgresql://postgres:password@localhost:5432/jarbees_data?schema=public"

# Gateway de Inferencia Local (RTX 5070)
INFERENCE_GATEWAY_URL="http://127.0.0.1:8080"
INFERENCE_DEFAULT_PROVIDER="gateway"
OLLAMA_HOST="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen3:8b"
OLLAMA_EMBEDDING_MODEL="bge-m3:latest"

# Servidor HTTP
PORT=4000
```

### 2. Instalación y Migraciones
```bash
# Instalar dependencias
npm install

# Sincronizar esquema Prisma y extensiones pgvector
npx prisma generate
npx prisma db push

# Compilar el proyecto
npm run build
```

### 3. Ejecución de Pruebas con Seguridad de Recursos (Anti-OOM)
Por directiva estricta de estabilidad del entorno, las suites de pruebas deben ejecutarse siempre en modo serial:
```bash
# Ejecución serial estricta
npm test -- --runInBand
```

---

## 💾 Política de Respaldos (Backups)

El sistema cuenta con un respaldo automatizado hacia la unidad `G:\`:
- **Script:** [scripts/backup-db.ps1](file:///c:/Projects/productos_crud_bkd/scripts/backup-db.ps1)
- **Frecuencia:** Día 1 de cada mes mediante el Programador de Tareas de Windows (`JarBees_Database_Monthly_Backup`).
- **Política de Retención:** Conservación de los últimos 12 volcados binarios (`.dump`), con purga automática de copias antiguas.
- **Ejecución manual bajo demanda:**
  ```powershell
  powershell.exe -ExecutionPolicy Bypass -File scripts\backup-db.ps1
  ```
