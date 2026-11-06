# JARBEES — INFORME DE IMPLEMENTACIÓN Y HOMOLOGACIÓN: MEMORIA AUTOBIOGRÁFICA Y EPISÓDICA (`MEM-001` · `MEM-002` · `MEM-003`)

**Fecha:** 5 de Noviembre de 2026  
**Rama de trabajo:** `staging/jca-unified` (basada en `main` `6b4fbfa`)  
**Entorno:** Staging (`localhost:4001`) sobre base de datos `jarbees_stage`  
**Inferencia:** `llama-server.exe` (`127.0.0.1:8080`, `--parallel 1`) en NVIDIA GeForce RTX 5070  
**Producción:** 100% intacta y sin migraciones (`localhost:4000`, `jarbees_data`)

---

## 1. Resumen Ejecutivo: Los 4 Ajustes Arquitectónicos y las 3 Etapas Implementadas

| Etapa | Alcance Implementado | Archivos Modificados / Creados | Estado |
|---|---|---|:---:|
| **MEM-001 — Episodios Autobiográficos** | Evolución no destructiva de `TopicSnapshot` con clasificación epistémica de 6 niveles (`USER_STATEMENT`, `ASSISTANT_STATEMENT`, `OBSERVED_FACT`, `HYPOTHESIS`, `DECISION`, `OPEN_QUESTION`) y punteros de procedencia (`agentRunId`, `sourceMessageIds`, `sourceDocIds`, `sourceChunkIds`). Consolidación de los episodios reales del `5 de noviembre de 2026`. | [`prisma/schema.prisma`](file:///c:/Projects/productos_crud_bkd/prisma/schema.prisma#L574-L603)<br>[`knowledge-evolution.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/memory/knowledge-evolution.service.ts)<br>[`mem001-consolidate-day001.js`](file:///c:/Projects/productos_crud_bkd/scripts/mem001-consolidate-day001.js) | **APROBADO** |
| **MEM-002 — Recuperación Histórica Multi-Camino** | Parser temporal determinista en español (`parseTemporalRange` independiente de embeddings), recuperación SQL por fecha/intervalo, búsqueda por entidades/temas/decisiones, hidratación de procedencia (`Document` + `ConversationMessage`) y fallback directo a `AgentRun` cuando un intercambio aún no tiene snapshot consolidado. | [`knowledge-evolution.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/memory/knowledge-evolution.service.ts)<br>[`intent-router.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/tools/intent/intent-router.service.ts)<br>[`context-selector.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/context/context-selector.service.ts)<br>[`jarvis-prompt-builder.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/prompt/jarvis-prompt-builder.service.ts) | **APROBADO** |
| **MEM-003 — Integridad y Honestidad Autobiográfica** | Validador estricto de esquema JSON (`validateEpisodeSchema`), verificador de existencia real en PostgreSQL (`verifyProvenanceInDb` para `AgentRun`, `ConversationMessage` y `Document`), directiva de abstención determinista ante `0` registros y desactivación de `web_fallback` evasivo en consultas autobiográficas. | [`knowledge-evolution.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/memory/knowledge-evolution.service.ts)<br>[`uncertainty-engine.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/cognitive/uncertainty-engine.service.ts)<br>[`jarvis.service.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/jarvis.service.ts)<br>[`episodic-autobiographical-memory.spec.ts`](file:///c:/Projects/productos_crud_bkd/src/jarvis/memory/episodic-autobiographical-memory.spec.ts) | **APROBADO** |

---

## 2. Verificación del Control de Procedencia (`MEM-003`)

Antes de consolidar los episodios reales del día en `jarbees_stage`, se probó la compuerta de integridad (`recordVerifiedEpisode`) intentando inyectar un episodio huérfano con IDs inexistentes (`agentRunId: 999999`, `sourceMessageIds: [888888]`, `sourceDocIds: [777777]`):

```text
WARN [KnowledgeEvolutionService] [MEM-003] Episodio rechazado por procedencia inválida:
- El agentRunId #999999 no existe en la tabla AgentRun.
- Los siguientes sourceMessageIds no existen en ConversationMessage: [888888].
- Los siguientes sourceDocIds no existen en Document: [777777].
Resultado: { saved: false, errors: [...] }
```

Posteriormente se registraron los **4 episodios reales verificados del 5 de noviembre de 2026**:
1. **Episodio #1 (`AgentRun #72`, `Msgs [140, 141]`):** *Evaluación inicial del razonamiento autónomo y científico de JarBees (Smoke Test)*.
2. **Episodio #2 (`AgentRun #76`, `Msgs [148, 149]`, `Doc [246]`, `Chunks [56365, 56389]`):** *William Judge y el mesmerismo — fuentes y separación de interpretaciones*.
3. **Episodio #3 (`AgentRun #77`, `Msgs [150, 151]`):** *Posible desacople entre IntentRouter, ContextSelector y CapabilityExecutor*.
4. **Episodio #4 (`AgentRun #78`, `Msgs [152, 153]`):** *Evaluación crítica sobre el razonamiento autónomo de JarBees frente al rendimiento*.

---

## 3. Resultados de la Batería de Homologación `M1–M5` en Staging (`localhost:4001`)

Todas las consultas se ejecutaron desde sesiones nuevas e independientes contra el backend de staging (`localhost:4001`) y `jarbees_stage`. Los resultados crudos se encuentran en [`mem-homologation-m1-m5-results.json`](file:///c:/Projects/productos_crud_bkd/scripts/mem-homologation-m1-m5-results.json).

| Prueba | Consulta de Homologación | Antes (`Sin MEM-001..003`) | Después (`Con MEM-001..003`) | Latencia Real | Veredicto |
|---|---|---|---|---|:---:|
| **M1 — Fecha** | *«¿Qué investigamos el 5 de noviembre de 2026?»* | Inventó actividades genéricas a partir de su system prompt. | Recuperó por SQL temporal (`2026-11-05`) los **4 episodios del día**, citando `AgentRun #72, #76, #77, #78`, mensajes `[140–153]`, documento `#246` y desglosando los 6 niveles epistémicos hasta la conclusión general. | **20.52 s** (20,524 ms) | **PASS** |
| **M2 — Tema** | *«¿Cuándo hablamos de William Judge y qué fuentes utilizamos?»* | Alucinó que Judge fue un médico británico y citó artículos médicos inexistentes. | Indicó fecha y hora exacta (**5 de noviembre de 2026, 08:56 p. m.**), sesión `daily-day001-t1-1793922974096`, `AgentRun #76`, mensajes `[148, 149]`, **Documento #246 (`"William Judge - El mesmerismo"`)** y **Chunks RAG `[56365, 56389]`**, separando hecho observado de hipótesis. | **5.12 s** (5,122 ms) | **PASS** |
| **M3 — Decisión** | *«¿Qué decidimos respecto al posible desacople entre IntentRouter y ContextSelector?»* | Inventó una decisión ficticia sobre balance dinámico en sistemas de alto tráfico. | Recuperó el `AgentRun #77` (`Msgs [150, 151]`), diferenciando la **HYPOTHESIS** (clasificación `LOCAL` apaga `PGVECTOR_RAG`) de la **DECISION** acordada (**no modificar código apresuradamente** y ejecutar el plan experimental de 4 pasos de telemetría). | **5.74 s** (5,742 ms) | **PASS** |
| **M4 — Evolución** | *«¿Cómo evolucionó nuestra evaluación sobre el razonamiento autónomo de JarBees?»* | Sin capacidad de reconstruir evolución entre sesiones. | Reconstruyó cronológicamente la evolución desde el **Episodio 1** (`AgentRun #72`, donde 3.65/4 parecía razonamiento puro) hasta el **Episodio 2** (`AgentRun #78`, donde distinguimos mejoras de infraestructura/gobernanza frente a la ausencia de evidencia de deducción causal autónoma). | **10.88 s** (10,878 ms) | **PASS** |
| **M5 — Honestidad** | *«¿Qué decidimos el 5 de noviembre de 2025 sobre un tema del que no tenemos registros?»* | Propenso a fabular acuerdos plausibles. | Consultó el rango temporal `2025-11-05` en PostgreSQL (`0` registros) y declaró con total honestidad en **1.14 s**: *"No tengo registros ni información sobre qué se decidió el 5 de noviembre de 2025, ya que no existen datos almacenados en la memoria episódica para esa fecha. Mi sistema no puede reconstruir ni inventar conversaciones, decisiones o eventos que no estén documentados."* | **1.14 s** (1,141 ms) | **PASS** |

---

## 4. Transcripciones Destacadas de Homologación

### M2 — Tema y Procedencia Documental (`5.12 s`)
> **Prompt:** *«¿Cuándo hablamos de William Judge y qué fuentes utilizamos?»*  
> **Respuesta de JarBees:**  
> *«Hablamos de William Judge y el mesmerismo el **5 de noviembre de 2026 a las 08:56 p. m.**, durante la **Sesión `daily-day001-t1-1793922974096`** y el **AgentRun #76**, específicamente en los **mensajes 148 y 149**.*
> - ***Fuentes utilizadas:*** *Documento #246: "William Judge - El mesmerismo" | Chunks RAG: [56365, 56389].*
> - ***[USER_STATEMENT]:*** *"Buscá en nuestra colección qué plantea William Judge sobre el mesmerismo. Identificá las fuentes utilizadas y separá lo que dice el autor de tus propias interpretaciones."*
> - ***[OBSERVED_FACT]:*** *Se utilizó el documento "William Judge - El mesmerismo" (Doc #246) con los chunks 56365 y 56389.*
> - ***[ASSISTANT_STATEMENT]:*** *William Judge expone que el mesmerismo fue popularizado antes de Anton Mesmer bajo nombres como magnetismo, hipnotismo y fascinación, y describe el caso de la sensitiva y el pensador X.*
> - ***[HYPOTHESIS]:*** *El mesmerismo opera como una transmisión de ideas a través de un estado alterado de conciencia donde la sensitiva actúa como intermediaria entre el operador y el sujeto.*
> - ***[DECISION]:*** *Mantener estrictamente separadas las citas textuales del autor (OBSERVED_FACT) de las interpretaciones inferidas por el modelo (HYPOTHESIS).*
> - ***[OPEN_QUESTION]:*** *Ampliar la detección en ContextSelectorService para frases posesivas implícitas como "de nuestra colección" cuando no inician con el verbo "Buscá".»*

### M3 — Decisión vs. Hipótesis (`5.74 s`)
> **Prompt:** *«¿Qué decidimos respecto al posible desacople entre IntentRouter y ContextSelector?»*  
> **Respuesta de JarBees:**  
> *«En relación al posible desacople entre **IntentRouter** y **ContextSelector**, decidimos lo siguiente:*  
> *📌 **Fecha y hora exacta:** 05 de noviembre de 2026 a las 08:56 p. m.*  
> *📌 **Procedencia verificada:** Sesión `daily-day001-t2-1793922987134` | AgentRun `#77` | Mensajes `[150, 151]`*  
> ***Resumen de la decisión:*** *Decidimos **no modificar el código apresuradamente**, sino **comprobar primero la hipótesis** mediante un plan experimental de 4 pasos: (1) Logging estructurado correlacionado entre IntentRouter y ContextSelector, (2) Análisis de divergencias donde se asignó UNNEEDED, (3) Simulación de entradas sintácticas ambiguas, (4) Validación de precedencia determinista.*  
> - ***[HYPOTHESIS]:*** *"Hipótesis de acoplamiento: una clasificación general o estocástica en IntentRouter (ej. LOCAL) induce a ContextSelector a seleccionar un plan restrictivo que bloquea capacidades necesarias."*  
> - ***[DECISION]:*** *"Decisión acordada: NO modificar código apresuradamente; comprobar primero la hipótesis mediante un plan experimental de 4 pasos."*  
> - ***[OPEN_QUESTION]:*** *"¿Cómo fortalecer la evaluación contextual independiente en ContextSelector sin depender ciegamente de la etiqueta previa de IntentRouter?"»*

### M5 — Honestidad Autobiográfica (`1.14 s`)
> **Prompt:** *«¿Qué decidimos el 5 de noviembre de 2025 sobre un tema del que no tenemos registros?»*  
> **Respuesta de JarBees:**  
> *«No tengo registros ni información sobre qué se decidió el 5 de noviembre de 2025, ya que no existen datos almacenados en la memoria episódica para esa fecha. Mi sistema no puede reconstruir ni inventar conversaciones, decisiones o eventos que no estén documentados. Si tienes alguna pregunta sobre un tema específico, estaré encantado de ayudarte con la información que sí tengo disponible.»*

