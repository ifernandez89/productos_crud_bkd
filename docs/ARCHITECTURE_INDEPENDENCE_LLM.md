# 🏛️ Arquitectura Crítica de Independencia de Inferencia LLM (RTX 5070 12GB)
**JarBees AI System Architecture — Documento de Estrategia e Infraestructura**
*Fecha de Registro: 10 de Octubre de 2026*

---

## 1. Declaración de Principios y Visión

> *"Si mañana Ollama desapareciera, no perderíamos nuestros modelos locales ni abandonaríamos JarBees. Lo que perderíamos sería una de las herramientas que actualmente utilizamos para ejecutarlos."*

JarBees no es un wrapper de Ollama. JarBees es un sistema cognitivo completo:
- Capa de Aplicación y API en NestJS con TypeScript.
- Memoria episódica y semántica.
- RAG híbrido vectorial con PostgreSQL + pgvector (`bge-m3:latest` 1024D).
- Catálogos locales de conocimiento personal (música en `I:\Musica`, videojuegos en `I:\Juegos`, obras de Carl Jung y biblioteca).
- Hardware dedicado: **Intel Core i7 12ª Gen, 32 GB RAM, NVIDIA GeForce RTX 5070 (12 GB VRAM)**.

### Los Dos Riesgos Identificados:
1. **Dependencia Tecnológica**: Riesgo de que una herramienta de terceros (Ollama) altere licencias, cambie su protocolo o quede discontinua.
2. **Dependencia Operativa (Single Point of Failure)**: Si el servicio local de Ollama se actualiza, reinicia o bloquea un subproceso, el backend de NestJS no debe quedar esperando indefinidamente ni caerse.

---

## 2. Hoja de Ruta de Motores Alternativos en RTX 5070

| Motor / Runtime | Rol en JarBees | Aceleración Hardware | Protocolo / API | Formato de Pesos |
| :--- | :--- | :--- | :--- | :--- |
| **Ollama** *(actual)* | Motor de desarrollo ágil y servidor local multipropósito | CUDA / cuDNN (RTX 5070) | HTTP REST (`/api/chat`, `/api/embeddings`) | Blobs empaquetados internos |
| **llama.cpp / llama-server** *(independencia central)* | Motor de producción principal desacoplado | CUDA nativo | HTTP compatible OpenAI (`/v1/chat/completions`) | **GGUF** cuantizado |
| **LM Studio** | Banco de pruebas, diagnóstico y verificación rápida de modelos | CUDA / Vulkan | HTTP local (`/v1/chat/completions`) | GGUF descargable |
| **vLLM** | Servidor de alta concurrencia y batching continuo | PagedAttention / CUDA | OpenAI-compatible server | Safetensors / Hugging Face |
| **Transformers / ONNX** | Embeddings dedicados y micro-servicios aislados | PyTorch / DirectML | In-process o microservicio gRPC/HTTP | PyTorch / ONNX / Safetensors |

---

## 3. Arquitectura del Gateway de Inferencia (`InferenceGateway`)

Para desacoplar el código de negocio (`JarvisService`, `AIChatService`, `DocumentIngestService`) de cualquier puerto o motor específico:

```
┌─────────────────────────────────────────────────────────────────┐
│                    JarBees Core (NestJS API)                    │
│   (Controladores, RAG, Memoria, Herramientas, Reglas de Negocio) │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                InferenceGateway (Gateway Central)               │
│  - Timeout adaptativo (Chat: 15s | RAG: 60s | Síntesis: 120s)   │
│  - Circuit Breaker (Corta tras 3 fallos consecutivos)           │
│  - Reintentos exponenciales con jitter (máx. 2 reintentos)       │
│  - Health-check proactivo en background                         │
│  - Degradación controlada (HTTP 503 sin voltear el backend)     │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                               │
        [Proveedor A]                   [Proveedor B]
                ▼                               ▼
    ┌───────────────────────┐       ┌───────────────────────┐
    │     OllamaProvider    │       │   LlamaCppProvider    │
    │ (http://localhost:11434)│       │(http://localhost:8080) │
    │      - qwen2.5:7b     │       │      - qwen2.5-7b.gguf│
    │      - bge-m3:latest  │       │      - bge-m3.gguf    │
    └───────────────────────┘       └───────────────────────┘
```

### Contrato Lógico (`InferenceProvider.ts`):
```typescript
export interface ChatInput {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatOutput {
  text: string;
  tokensUsed: number;
  durationMs: number;
  model: string;
}

export interface InferenceProvider {
  name: string;
  chat(input: ChatInput): Promise<ChatOutput>;
  embeddings(texts: string[]): Promise<number[][]>;
  healthCheck(): Promise<boolean>;
}
```

---

## 4. Salvaguardas y Resiliencia Operativa

1. **Timeouts Específicos por Caso de Uso**:
   - `Chat Conversacional`: Timeout estricto de **25 segundos**. Si el modelo no empieza a responder, cortar y responder con mensaje de degradación.
   - `Ingesta RAG / Embeddings`: Timeout de **120 segundos** en cola asíncrona dedicada (BullMQ o worker pool), sin bloquear el event loop principal.
2. **Circuit Breaker Activo**:
   - Estados: `CLOSED` (Normal) ➔ `OPEN` (Motor caído, responder 503 inmediato) ➔ `HALF-OPEN` (Probar una petición tras 30s).
   - Previene que el backend sature sockets de red contra un proceso colgado.
3. **Preservación de Modelos e Independencia de Pesos**:
   - Conservar los pesos originales en formato **GGUF** (Q4_K_M o Q5_K_M para la RTX 5070 con 12 GB VRAM).
   - Versionar sistemáticamente en el repositorio:
     * System prompts y plantillas de chat (chat templates de Jinja / ChatML).
     * Parámetros de muestreo (`top_p`, `top_k`, `repeat_penalty`, `temperature`).
     * Dimensiones de vectores de embeddings (1024D para `bge-m3`).

---

## 5. Plan de Ejecución en 3 Etapas

### Etapa 1 — Blindaje y Estabilización (Completada / En curso)
- [x] Corregir falsos positivos en herramientas del chatbot (evitar secuestros por palabras clave o números).
- [x] Prevenir bloqueos en detectores de documentos cuando el usuario hace preguntas conversacionales abiertas.
- [x] Implementar backups automáticos y rotación de base de datos relacional y vectorial hacia `G:\`.
- [ ] Incorporar `timeout` estricto de 30s y manejo de errores con fallback en todas las llamadas HTTP de `OllamaProvider`.

### Etapa 2 — Salida de Emergencia Paralela con `llama.cpp`
- [ ] Descargar binarios de `llama-server` compilados con soporte CUDA para Windows.
- [ ] Descargar `qwen2.5-7b-instruct-q5_k_m.gguf` y alojarlo en una carpeta de modelos local independiente (`I:\Modelos_GGUF\`).
- [ ] Levantar `llama-server` en el puerto `8080` de prueba y verificar que NestJS pueda comunicarse vía API compatible OpenAI.

### Etapa 3 — Desacoplamiento Total vía `InferenceGateway`
- [ ] Implementar la interfaz unificada `InferenceProvider`.
- [ ] Desarrollar `InferenceGateway` con selector de motor configurable vía `.env` (`INFERENCE_ENGINE=ollama|llamacpp|lmstudio`).
- [ ] Aislar el servicio de embeddings de `bge-m3` para que la vectorización continúe operativa incluso si el motor de chat cambia.
