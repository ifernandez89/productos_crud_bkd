# 📋 Plan de Implementación: JarBees Dynamic Specialist Swapping & Benchmarks (RTX 5070 - 12 GB)

**Fecha:** 2026-10-27 / 2026-10-28  
**Objetivo:** Implementar la orquesta y conmutación dinámica de modelos especialistas en VRAM (12 GB) sobre `llama.cpp` + NestJS, con control de ciclo de vida (`DrainQueue`), verificación por ejecución y batería de evaluación real.

---

## 🎯 Arquitectura de Modelos & Roles

```mermaid
graph TD
    User([Solicitud de Usuario / Misión]) --> IntentRouter[SpecialistCapabilityRouter]
    IntentRouter --> BudgetCheck{Presupuesto VRAM<br/>~10.5 GB neta}
    
    BudgetCheck -->|Código / RAG / Instrucción Estricta| QwenFast[Qwen 3 4B Q4_K_M<br/>~2.8 GB VRAM]
    BudgetCheck -->|Redacción / Síntesis / Estilo| GemmaSpec[Gemma 3 4B Q4_K_M<br/>~3.0 GB VRAM]
    
    QwenFast --> ExecutionVerify{Validación Determinista<br/>tsc / linter / tests}
    ExecutionVerify -->|Pasa con éxito| Done([Respuesta / Checkpoint])
    ExecutionVerify -->|Fallo semántico / Complejidad| Escalate[Escalar a Especialista Avanzado]
    
    Escalate --> DrainQueue[DrainQueue: Drenar peticiones activas]
    DrainQueue --> Swapper[LlamaServer Dynamic Swap]
    Swapper --> QwenHeavy[Qwen 3 8B Q4_K_M<br/>~5.5 GB VRAM]
    Swapper --> DeepSeekR1[DeepSeek-R1 8B Q4_K_M<br/>Auditor de Premisas]
```

---

## 🗓️ Fases de Implementación para Mañana

### Fase 1: Supervisor de Ciclo de Vida y Drenaje (`ModelLifecycleSupervisor`)
- [ ] **Estado del Slot y Drenaje Seguro (`DrainQueue`)**:
  - Evitar el corte abrupto de streams o conexiones SSE cuando se solicite conmutar de modelo.
  - Marcar el modelo activo como `DRAINING` hasta que las peticiones en vuelo terminen (o timeout de 15s con salvaguarda).
- [ ] **Gestión de Procesos `llama-server`**:
  - Implementar el comando de arranque optimizado con soporte para KV Cache cuantizada:
    `llama-server -m <path-to-gguf> -c 16384 --ctk q8_0 --ctv q8_0 -ngl 99 --port 8080`
  - Control de VRAM en caliente antes de levantar un nuevo especialista.

### Fase 2: Escalamiento por Retroalimentación de Ejecución (`ExecutionFeedbackLoop`)
- [ ] **Canalización Directa 4B ➔ 8B**:
  - Intento 1: **Qwen 3 4B** genera la solución inicial (alta velocidad: ~120-140 t/s).
  - Verificación: Ejecución aislada de sintaxis TypeScript / Prisma / SQL.
  - Intento 2 (Si falla): Se pasa el diagnóstico exacto de error a **Qwen 3 8B** o auditor **DeepSeek-R1 8B**.

### Fase 3: Batería de Validación Empírica en RTX 5070 (Checklist de 6 Puntos)
- [ ] **1. Inferencia Base**:
  - Medir TTFT (Time To First Token) y tokens/segundo con contextos de 2K, 8K, 16K y 32K para Qwen 4B y 8B.
- [ ] **2. Latencia de Swapping en NVMe**:
  - Medir el tiempo real de descarga y recarga entre modelos en disco NVMe PCIe 4.0.
- [ ] **3. Auditoría Epistemológica**:
  - Pruebas RAG con `EvidenceGatekeeperService` evaluando atribuciones vs. inferencias y abstenciones cuando no hay fuentes.
- [ ] **4. Estrés de VRAM y Anti-OOM**:
  - Ejecución continuada de misiones largas verificando que el consumo nunca sobrepase los 10.8 GB en la RTX 5070.
- [ ] **5. Aislamiento de Red (Data Privacy Gate)**:
  - Validar que ante la pérdida de conexión externa o corte de red, el sistema opere al 100% en local sin degradar tareas privadas.
- [ ] **6. Calidad Comparativa Gemma 3 4B vs Qwen 3 4B**:
  - Evaluación a ciegas en tareas de redacción y síntesis de documentos extensos.

---

## 🛠️ Archivos a crear/modificar mañana:
1. `src/jarvis/llm/model-lifecycle.service.ts`: Orquestación de arranque, parada y cambio de modelos con `llama-server`.
2. `src/jarvis/llm/drain-queue.service.ts`: Cola de retención y drenaje de peticiones concurrentes.
3. `scripts/benchmark/vram_inference_suite.ts`: Script automatizado para medir tokens/s, TTFT y memoria en la RTX 5070.
