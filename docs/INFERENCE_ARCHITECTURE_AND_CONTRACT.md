# Contrato de Inferencia, Arquitectura y Tolerancia a Fallos de JarBees

> **Versión:** 1.0.0 (Consolidada y en Producción Local)  
> **Fecha de Cierre:** 27 de Octubre de 2026  
> **Hardware de Referencia:** NVIDIA GeForce RTX 5070 12GB (Arquitectura Blackwell, Compute Capability 12.0 sm_120, Driver 617.42, CUDA 13.4)  
> **Binario de Inferencia Principal:** `llama-server.exe` (build `b11935` `win-cuda-13.4-x64`)  
> **Motor de Fallback Secundario:** Ollama v0.3.x+ local (`http://127.0.0.1:11434`)  

---

## 1. Principio y Visión Arquitectónica

La inferencia en JarBees **no es el centro monolítico del sistema**, sino una **capacidad interna modular, autónoma e intercambiable**. 

El sistema desacopla la lógica cognitiva de JarBees (intención, agentes, RAG, planificación y herramientas) del motor físico de inferencia a través de la pasarela [`InferenceGatewayService`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/inference-gateway.service.ts).

### Jerarquía de Motores y Especialistas

```
                              [ Cliente / JarBees Core ]
                                          │
                                          ▼
                            [ InferenceGatewayService ]
                                          │
                    ┌─────────────────────┴─────────────────────┐
                    ▼                                           ▼
          [ LlamaCppProvider ]                         [ OllamaProvider ]
             (Motor Primario)                         (Fallback Autónomo)
         llama-server (CUDA 13)                         Daemon de Respaldo
                    │                                           │
       ┌────────────┴────────────┐                              │
       ▼                         ▼                              ▼
  [ qwen3:8b ]         [ qwen2.5-coder:7b ]             [ bge-m3:latest ]
 (Razonamiento /          (Programación /              (Embeddings RAG /
    General)                 Herramientas)             1024 dims pgvector)
```

---

## 2. Contrato de Interfaces Públicas

### 2.1 Generación de Inferencia (`LLMGenerateOptions`)

Definida en [`src/jarvis/llm/llm-provider.interface.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/llm-provider.interface.ts):

```typescript
export interface LLMTimeouts {
  connectMs?: number;      // Tiempo máx para conectar con el servidor (default: 3500ms)
  queueWaitMs?: number;    // Tiempo máx en cola de cambio de modelo (default: 15000ms a 60000ms)
  generationMs?: number;   // Tiempo máx para generar la respuesta completa (default: 30000ms a 60000ms)
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  model?: string;          // Ej: "qwen3:8b", "qwen2.5-coder:7b" o con prefijo "ollama:qwen3:8b"
  temperature?: number;    // Default: 0.1
  topP?: number;
  topK?: number;
  maxTokens?: number;      // Default: 512
  stopSequences?: string[];
  think?: boolean;         // false = suprime etiquetas <think> mediante chat_template_kwargs
  timeoutMs?: number;      // Timeout global para la petición
  timeouts?: LLMTimeouts;  // Timeouts desglosados por fase operativa
  abortSignal?: AbortSignal;// Soporte para cancelación temprana si el cliente se desconecta
}
```

### 2.2 Telemetría y Observabilidad (`GET /jarbees/inference/status`)

Expositor público en [`JarvisController`](file:///c:/Projects/productos_crud_bkd/src/jarvis/jarvis.controller.ts) con sanitización de seguridad (oculta rutas absolutas del disco local):

```typescript
export interface GatewayHealthStatus {
  activeProvider: string;    // "llamacpp" si está saludable, "ollama" si conmutó a fallback
  defaultModel: string;      // Modelo predeterminado configurado ("qwen3:8b")
  lastUsedModel: string;     // Último modelo solicitado por un cliente
  loadedModel: string;       // Modelo actualmente presente en la VRAM de la GPU
  serverHealthy: boolean;    // true si el servidor HTTP responde 200 en /health
  modelReady: boolean;       // true si el modelo está completamente cargado y listo para inferir
  modelLoading: boolean;     // true si la GPU está ocupada subiendo pesos ("loading model")
  fallbackAvailable: boolean;// true si Ollama está disponible para respaldo
  circuitBreaker: 'closed' | 'open'; // Estado del breaker ante fallos repetidos
  lastFailure: {
    timestamp: Date;
    provider: string;
    message: string;
  } | null;
  latencyMs?: number;        // Latencia de la última inferencia completada
  failoverCount: number;     // Contador acumulado de conmutaciones por fallo
  lastModelSwitch?: Date;    // Timestamp de la última alternancia de modelo en GPU
  primary: string;           // "llamacpp"
  fallback: string;          // "ollama"
  autoFallbackEnabled: boolean;
  providers: Record<string, { available: boolean; defaultModel: string }>;
  supervisor?: {
    status: 'RUNNING' | 'STOPPED' | 'STARTING' | 'FAILED';
    port: number;
    managedByJarBees: boolean;
    routerMode: boolean;
    restartAttempts: number;
    circuitBreakerTripped: boolean;
  };
}
```

---

## 3. Políticas Operativas y Tolerancia a Fallos

### 3.1 Política de Cancelación Temprana (`AbortSignal`)
- Si un cliente HTTP interrumpe o cancela la petición (navegador cerrado, timeout del cliente, cambio de pantalla):
  1. El `AbortSignal` cancela inmediatamente la petición HTTP de axios/fetch.
  2. En [`LlamaCppProvider`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/llamacpp.provider.ts), `llama-server` aborta el procesamiento de tokens liberando ciclos de computación de la GPU.
  3. En [`InferenceGatewayService`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/inference-gateway.service.ts), el cerrojo asíncrono (`AsyncMutex`) se libera en menos de **80 ms**, permitiendo que las peticiones encoladas continúen sin bloqueos.
  4. **Regla de idempotencia:** Las cancelaciones voluntarias del cliente **NO** disparan reintentos ni conmutación a Ollama.

### 3.2 Política de Conmutación por Fallo (Failover Matrix)

| Evento de Fallo | Momento | Acción del Sistema | Justificación |
| :--- | :--- | :--- | :--- |
| **`ECONNREFUSED` / Servidor apagado** | Previo al envío | Conmutación instantánea a `OllamaProvider`. Intento de auto-recuperación en segundo plano. | Disponibilidad 100% transparente para el usuario. |
| **Caída de proceso / `ECONNRESET`** | Pre-Token (0 tokens entregados) | Conmutación transparente a `OllamaProvider` desde el inicio. | No hubo efectos visibles para el usuario ni duplicidad. |
| **Caída de proceso / `ECONNRESET`** | Mid-Stream (tokens ya emitidos) | **Corte limpio del flujo con excepción.** ESTRICTAMENTE PROHIBIDO reintentar con Ollama en el mismo stream. | Reanudar con otro modelo mezclaría contextos semánticos y duplicaría texto en la interfaz. |
| **Timeout de cola (`queueWaitMs`)** | En espera de GPU | Rechazo con `HTTP 504 Gateway Timeout` controlado. | Evita acumulación infinita de peticiones si la GPU está saturada. |
| **Blackout Total (Ambos motores caídos)** | En cualquier momento | Respuesta inmediata con `HTTP 503 Service Unavailable` estructurado en < 10ms. | Prohibido dejar sockets colgados o simular respuestas vacías. Auto-recuperación autónoma al restaurar procesos. |

### 3.3 Regla Inviolable de Embeddings y pgvector
- El índice vectorial de `pgvector` de JarBees está construido con **1.024 dimensiones** mediante el modelo `bge-m3:latest`.
- Queda **estrictamente prohibido** dirigir solicitudes de embeddings a los modelos de chat o programación de `llama.cpp` (`qwen3:8b`, `qwen2.5-coder:7b`).
- [`LlamaCppProvider.embed()`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/llamacpp.provider.ts) arroja una excepción explícita ante cualquier intento de uso, y [`InferenceGatewayService.embed()`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/inference-gateway.service.ts) delega exclusivamente en `OllamaProvider` con `bge-m3`.

---

## 4. Gestión de Memoria GPU (NVIDIA RTX 5070 12GB)

### 4.1 Configuración de Router Mode (`models_presets.ini`)
`llama-server.exe` corre con:
- `--models-dir "C:\AI\models"`
- `--models-max 1`
- `--models-preset "src/jarvis/llm/models_presets.ini"`
- `-ngl 99` (offloading total de capas a VRAM)
- `-c 8192` (contexto estándar por especialista)
- `--parallel 1`

### 4.2 Presupuesto y Límites de VRAM
- **Límite físico de la GPU:** 12.227 MB.
- **VRAM con `qwen3:8b` activo:** ~6.727 MB (GPU al ~55%).
- **VRAM con `qwen2.5-coder:7b` activo:** ~5.485 MB (GPU al ~45%).
- **VRAM con Ollama `bge-m3:latest` paralelo:** +820 MB (VRAM combinada máxima: ~7.550 MB, GPU al ~61%).
- **Margen de seguridad libre:** > 4.600 MB de VRAM libres en todo momento para buffers del sistema, display y tareas auxiliares.
- **VRAM post-apagado:** VRAM liberada limpiamente a ~525 MB (11,4 GB libres).

---

## 5. Catálogo de Pruebas de Regresión Reproducibles

| Script de Prueba | Cobertura Validada |
| :--- | :--- |
| [`src/jarvis/llm/*.spec.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/llm/) | 25 pruebas unitarias automatizadas en Jest (mock de axios, spawn, Circuit Breaker, routing). |
| [`scratch/test_live_resilience.mjs`](file:///c:/Projects/productos_crud_bkd/scratch/test_live_resilience.mjs) | Caos real: `taskkill` en caliente a mitad de inferencia, conflicto de puerto 8080, 20 ciclos de ping-pong de VRAM, supresión de `<think>`. |
| [`scratch/test_final_four.mjs`](file:///c:/Projects/productos_crud_bkd/scratch/test_final_four.mjs) | 4 pruebas avanzadas: Soak test (VRAM varianza 4 MB), concurrencia de 6 peticiones con `AbortSignal` (liberación en 71ms), streaming mid-flight y blackout total con auto-recuperación 503. |
| [`scratch/bench_engines.mjs`](file:///c:/Projects/productos_crud_bkd/scratch/bench_engines.mjs) | Benchmark comparativo con métricas TTFT (360ms) y rendimiento sostenido (~104 tok/s). |
