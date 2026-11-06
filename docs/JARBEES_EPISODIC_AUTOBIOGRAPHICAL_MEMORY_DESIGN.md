# JARBEES — AUDITORÍA READ-ONLY Y DISEÑO DE MEMORIA AUTOBIOGRÁFICA Y EPISÓDICA

**Fecha:** 5 de Noviembre de 2026  
**Rama:** `main` (commit `6b4fbfa`)  
**Modo:** Auditoría Forense `READ-ONLY` + Sonda Experimental sobre las Tareas del Día (`DAY 001`)  
**Entorno Evaluado:** Staging (`localhost:4001`, `jarbees_stage`) y Producción (`jarbees_data`, solo lectura)

---

## 1. Auditoría Forense (Read-Only): ¿Cuánto de esto ya existe en JarBees?

Antes de crear cualquier tabla o servicio nuevo, inspeccionamos `prisma/schema.prisma`, los servicios de `src/jarvis/memory/`, los repositorios de `src/jarvis/repositories/` y los registros reales almacenados hoy (**5 de noviembre de 2026**) en PostgreSQL.

### 1.1. Respuesta a las 5 Preguntas de Auditoría

| # | Pregunta de Auditoría | Estado Actual en Código y Base de Datos | Evidencia Exacta (`jarbees_stage` / `jarbees_data`) |
|---|---|---|---|
| **1** | **¿Las conversaciones originales quedan almacenadas íntegramente?** | **SÍ (100% íntegras).** Cada turno guarda el mensaje exacto del usuario y la respuesta completa del asistente en `ConversationMessage`, además del par `question`/`answer` en `AgentRun`. | Hoy (`2026-11-05`) hay **153 mensajes** en `ConversationMessage` y **78 ejecuciones** en `AgentRun` en `jarbees_stage` (y **910 mensajes / 490 runs** en `jarbees_data`). |
| **2** | **¿Cada mensaje conserva timestamps y session IDs?** | **SÍ.** `ConversationMessage` tiene `id`, `sessionId` (indexado), `role`, `content`, `metadata` (modelo, latencia, confianza) y `createdAt` (`@default(now())`, indexado). | Los 3 ejercicios de `DAY 001` quedaron grabados con timestamps precisos (`23:56:24Z`, `23:56:48Z`, `23:57:05Z`) y sus `sessionId` (`daily-day001-t1/t2/t3-*`). |
| **3** | **¿Existe alguna relación entre mensajes, conversaciones y documentos?** | **SÍ, en `AgentRun` y `ClaimEvidence` (pero no en `ConversationMessage`).** `AgentRun` guarda `chunksRetrievedIds` (JSON array) y tiene relación `1:N` con `ClaimEvidence` (`document`, `author`, `supportingChunkIds`, `status`) y `1:1` con `CognitiveExecutionTrace`. Por su parte, `TopicSnapshot` tiene FK opcional `sourceDocId -> Document.id`. | En la Tarea 1 de hoy (`AgentRun #76`, William Judge), quedaron guardados `chunksRetrievedIds: "[56365,56389]"`, `CognitiveTrace #3` y **8 filas en `ClaimEvidence`** apuntando a `"William Judge - El mesmerismo"`. |
| **4** | **¿`Memory` ya tiene entidades o mecanismos de consolidación?** | **SÍ, existen 4 piezas parciales pero desconectadas entre sí:**<br>1. `TopicSnapshot` + `KnowledgeEvolutionService` (extrae `{topic, conclusion, tags}` post-turno).<br>2. `TripartiteMemoryService` (Working + Episodic 50/30/20 + Associative KGraph con cuarentena epistémica en `PendingRelation`).<br>3. `MemoryConsolidationService` (rutina `sleep` que deduplica `Memory` y etiqueta `[DECISION_SUPERSEDED]`).<br>4. `SessionSummary` (resumen cada 10 mensajes por `sessionId`). | En `jarbees_data` existen **54 `TopicSnapshot`**, **8 `Memory`**, **10 `SessionSummary`** y **6 `KnowledgeEntity`**. Sin embargo, en `jarbees_stage` hoy se guardaron **0 `TopicSnapshot`** (ver hallazgo crítico abajo). |
| **5** | **¿Podemos incorporar memoria episódica sin duplicar datos?** | **SÍ, totalmente.** Como `ConversationMessage`, `AgentRun` y `ClaimEvidence` ya guardan el texto íntegro, los timestamps, los chunks RAG y las afirmaciones, un episodio autobiográfico **no debe copiar los mensajes ni los documentos**: solo necesita evolucionar `TopicSnapshot` (o vincularse a `AgentRun.id` y `sourceMessageIds`) actuando como **índice episódico estructurado**. | Un episodio del `DAY 001` puede referenciar `agentRunId: 76` y `sourceMessageIds: [148, 149]` sin duplicar un solo byte del texto conversacional ni de los chunks vectoriales. |

---

### 1.2. Dos Hallazgos Críticos Descubiertos en la Auditoría

1. **Por qué `KnowledgeEvolutionService` guardó `0` snapshots hoy en Staging (`snapshotsToday: 0`):**
   - En `src/jarvis/jarvis.service.ts` (línea 2001), `saveAndObserve()` invoca en background `this.knowledgeEvolution.extractAndSave(question, answer, sessionId)`.
   - Sin embargo, `KnowledgeEvolutionService` (`src/jarvis/memory/knowledge-evolution.service.ts`, línea 51) inyecta rígidamente `@Inject(OllamaProvider)` (que apunta al puerto `11434` buscando `qwen3:8b`), mientras que JarBees ejecuta su inferencia generativa en `LlamaServerProvider` (`127.0.0.1:8080`, `qwen3:4b` en la RTX 5070) y además con `--parallel 1` (single-flight).
   - Adicionalmente, `extractTopicSnapshot()` pide `maxTokens: 150` sin limpiar bloques `<think>...</think>` antes de `JSON.parse()`, cayendo silenciosamente en `catch { return null; }`.

2. **El "Agujero de Amnesia Inter-Sesión" en el Pipeline de Chat:**
   - En `JarvisPromptBuilderService` (`src/jarvis/prompt/jarvis-prompt-builder.service.ts`, líneas 361–381), el historial (`getRecentMessages`) y el resumen (`sessionSummaryRepo.get`) se filtran **exclusivamente por el `sessionId` actual**.
   - El método `ConversationRepository.searchAcrossSessions()` (línea 59) es **código muerto** (no se invoca en ningún lugar del proyecto).
   - `KnowledgeEvolutionService.getEvolution()` solo está expuesto en un endpoint REST aislado (`GET /jarbees/evolution?topic=X`), **nunca es consultado por `ContextSelector`, `CapabilityExecutor` ni `PromptBuilder` durante una conversación**.

---

## 2. Sonda Experimental Hoy (`2026-11-05`): ¿Qué responde JarBees hoy ante los 3 Niveles?

Para comprobar empíricamente el estado actual antes de tocar una sola línea de código, ejecutamos una sonda desde sesiones nuevas en staging (`localhost:4001`) preguntándole a JarBees por el trabajo que acabamos de realizar hoy en el **DAY 001** (William Judge, `IntentRouter`/`ContextSelector` y Razonamiento vs. Rendimiento):

| Nivel de Recuperación | Consulta Enviada a Staging (`localhost:4001`) | Latencia | Qué Respondió JarBees Hoy (Línea Base sin Memoria Episódica Conectada) | Diagnóstico Epistemológico |
|---|---|---|---|---|
| **Nivel 1: Fecha exacta** | *«¿Qué estuvimos investigando y probando hoy 5 de noviembre de 2026 en nuestras conversaciones anteriores?»* | **6.83 s** (6,828 ms) | Inventó una respuesta genérica basada en su system prompt: *"Hemos estado explorando la optimización de procesos de desarrollo de software, validación de algoritmos y gestión de credenciales..."* | **FALLO (Confabulación):** No consultó PostgreSQL por fecha (`createdAt >= 2026-11-05`) y rellenó el vacío con generalidades. |
| **Nivel 2: Semántica + Fecha** | *«¿Cuándo hablamos sobre William Judge y el mesmerismo en nuestras sesiones previas, qué concluimos y qué fuentes utilizamos?»* | **6.96 s** (6,959 ms) | Alucinó detalles falsos: *"Concluimos que William Judge fue un médico y filósofo británico del siglo XIX... Utilizamos biografías de William Judge y artículos de historiografía médica..."* | **FALLO CRÍTICO (Fabulación de Recuerdos):** A pesar de tener el `AgentRun #76` guardado hace 25 minutos con el libro `id=246`, al cambiar de `sessionId` perdió el rastro e inventó fuentes inexistentes. |
| **Nivel 3: Reconstrucción y Decisiones** | *«¿Qué hipótesis y decisiones discutimos hoy sobre el punto de fallo entre IntentRouter y ContextSelector, y qué preguntas quedaron pendientes sobre razonamiento vs rendimiento?»* | **8.66 s** (8,657 ms) | Inventó una decisión ficticia: *"Se planteó la Hipótesis de Priorización de Rendimiento vs Razonamiento en sistemas de alto tráfico y se decidió implementar un mecanismo de balance dinámico..."* | **FALLO CRÍTICO (Reconstrucción Falsa):** No accedió a los `AgentRun #77` y `#78` de hoy e inventó acuerdos que jamás ocurrieron. |

> **Conclusión de la Sonda:** Los datos crudos del `5 de noviembre de 2026` **están guardados en PostgreSQL**, pero JarBees sufre de **amnesia inter-sesión** y, al no tener una capacidad de recuperación temporal/episódica ni un guardrail de memoria autobiográfica, **fabula recuerdos cuando se le pregunta por conversaciones pasadas**.

---

## 3. Reconstrucción Real de los Episodios de Hoy (`DAY 001` — 5 de Noviembre de 2026)

Si mapeamos los registros que **ya existen hoy en `jarbees_stage`** (`ConversationMessage #148–153`, `AgentRun #76–78`, `CognitiveExecutionTrace #3` y `ClaimEvidence`) al esquema de **Memoria Episódica Autobiográfica** propuesto, así lucen los 3 episodios reales de hoy sin duplicar datos:

### Episodio 1 — Investigación Documental sobre Mesmerismo (`AgentRun #76`)
```json
{
  "event_type": "conversation_episode",
  "occurred_at": "2026-11-05T20:56:24-03:00",
  "topic": "William Judge y el mesmerismo — distinción entre fuente e interpretación",
  "summary": "Se investigó en la colección documental qué plantea William Judge sobre el mesmerismo, exigiendo separar las afirmaciones textuales del autor de las interpretaciones propias del modelo.",
  "entities": [
    "William Judge",
    "Anton Mesmer",
    "Mesmerismo",
    "El mesmerismo (Doc #246)"
  ],
  "hypotheses": [
    "El mesmerismo opera como transmisión de ideas a través de un estado alterado de conciencia donde la sensitiva actúa como intermediaria (interpretación del modelo)."
  ],
  "conclusions": [
    "Según el texto de William Judge, el mesmerismo es un arte de influencia anterior a Mesmer (conocido como magnetismo, hipnotismo o fascinación) donde el sujeto sigue al operador como limadura de hierro al imán, pudiendo alterar su comprensión pero no su convicción."
  ],
  "decisions": [
    "Validar que la formulación 'Buscá en nuestra colección...' activa RAG determinísticamente (10/10 en DAY 001 Tarea 1)."
  ],
  "open_questions": [
    "Ampliar el patrón de ContextSelectorService para detectar referencias posesivas implícitas ('de nuestra colección') sin requerir el verbo 'Buscá'."
  ],
  "source_conversation_id": "daily-day001-t1-1793922974096",
  "source_agent_run_id": 76,
  "source_message_ids": [148, 149],
  "source_document_ids": [246],
  "source_chunk_ids": [56365, 56389]
}
```

### Episodio 2 — Diagnóstico Arquitectónico de Orquestación (`AgentRun #77`)
```json
{
  "event_type": "conversation_episode",
  "occurred_at": "2026-11-05T20:56:48-03:00",
  "topic": "Punto de fallo entre IntentRouter, ContextSelector y CapabilityExecutor",
  "summary": "Se analizó en modo read-only la arquitectura cognitiva JCA-001 para identificar puntos de acoplamiento frágil entre la clasificación de intención y la selección de contexto.",
  "entities": [
    "JarBees",
    "IntentRouter",
    "ContextSelector",
    "CapabilityExecutor",
    "JCA-001"
  ],
  "hypotheses": [
    "Si IntentRouter clasifica una consulta ambigua en una categoría genérica (ej. LOCAL o SPORTS), ContextSelector puede derivar un ContextPlan restrictivo (UNNEEDED) que apaga capacidades legítimas como PGVECTOR_RAG."
  ],
  "conclusions": [
    "El selector de contexto no debe depender ciegamente de la etiqueta estocástica previa cuando existen señales semánticas o posesivas de consulta documental."
  ],
  "decisions": [
    "No modificar código impulsivamente; comprobar la hipótesis mediante logging correlacionado (Intent vs ContextPlan) y pruebas de precedencia determinista."
  ],
  "open_questions": [
    "¿Cómo desacoplar la evaluación de fuentes de ContextSelector cuando IntentRouter asigna LOCAL con confianza media?"
  ],
  "source_conversation_id": "daily-day001-t2-1793922987134",
  "source_agent_run_id": 77,
  "source_message_ids": [150, 151],
  "source_document_ids": [],
  "source_chunk_ids": []
}
```

### Episodio 3 — Reflexión Epistemológica: Razonamiento vs. Rendimiento (`AgentRun #78`)
```json
{
  "event_type": "conversation_episode",
  "occurred_at": "2026-11-05T20:57:05-03:00",
  "topic": "Evidencia de razonamiento real frente a mejoras de rendimiento e infraestructura",
  "summary": "Evaluación crítica sobre qué demuestran realmente las mejoras recientes en RAG y gobernanza de capacidades frente al razonamiento autónomo.",
  "entities": [
    "JarBees",
    "PGVECTOR_RAG",
    "Razonamiento Causal",
    "Gobernanza Cognitiva"
  ],
  "hypotheses": [],
  "conclusions": [
    "Existe evidencia sólida de mejora en infraestructura cognitiva (recuperación RAG más limpia, selección de herramientas deterministas y menor contaminación de contexto).",
    "No existe todavía evidencia definitiva de que JarBees resuelva problemas causales inéditos o formule hipótesis científicas originales de manera autónoma sin apoyo en el corpus."
  ],
  "decisions": [
    "Adoptar el formato JARBEES DAILY 5 MINUTE CHALLENGE para evaluar y entrenar estas capacidades en el uso diario real."
  ],
  "open_questions": [
    "¿Cómo dotar a JarBees de memoria autobiográfica y episódica para recordar cuándo discutimos cada tema, qué decidimos y cómo evolucionaron nuestras hipótesis en el tiempo?"
  ],
  "source_conversation_id": "daily-day001-t3-1793923011199",
  "source_agent_run_id": 78,
  "source_message_ids": [152, 153],
  "source_document_ids": [],
  "source_chunk_ids": []
}
```

---

## 4. Diseño Arquitectónico Propuesto (Sin Duplicar Datos)

Siguiendo el principio de **no crear tablas redundantes cuando la estructura ya existe**, proponemos evolucionar el modelo `TopicSnapshot` existente (que ya representa instantáneas temporales de evolución del pensamiento en `prisma/schema.prisma#L574-L593`) para convertirlo en el **Registro Episódico Autobiográfico** vinculado por clave foránea/IDs a `AgentRun` y `ConversationMessage`.

### 4.1. Arquitectura de Datos: Evolución de `TopicSnapshot` (Zero Data Duplication)

En lugar de duplicar el contenido de `ConversationMessage` o `AgentRun`, extendemos `TopicSnapshot` con campos episódicos estructurados y punteros a las tablas fuente:

```prisma
model TopicSnapshot {
  id               Int              @id @default(autoincrement())
  eventType        String           @default("conversation_episode") // "conversation_episode" | "decision" | "research" | "daily_challenge"
  topic            String           // Tema principal del episodio
  summary          String?          // Resumen de lo ocurrido en el intercambio
  conclusion       String           // Conclusiones alcanzadas (lo consolidado)
  hypotheses       String           @default("[]") // JSON: hipótesis discutidas (no confirmadas como hecho)
  decisions        String           @default("[]") // JSON: decisiones explícitas tomadas
  openQuestions    String           @default("[]") // JSON: preguntas que quedaron pendientes
  entities         String           @default("[]") // JSON: ["JarBees", "William Judge", "IntentRouter"]
  tags             String           @default("[]") // JSON: ["mesmerismo", "rag", "arquitectura"]

  // ── Punteros de Procedencia (Sin duplicar mensajes ni documentos) ──────────
  sessionId        String?          // ID de la sesión de origen
  agentRunId       Int?             // Puntero al AgentRun (que contiene latencia, intent, CognitiveTrace y ClaimEvidence)
  sourceMessageIds String           @default("[]") // JSON: [148, 149] -> IDs en ConversationMessage
  sourceDocId      Int?             // Documento principal si aplica
  sourceDocIds     String           @default("[]") // JSON: [246] -> Documentos utilizados en el episodio

  revocationStatus RevocationStatus @default(ACTIVE)
  revokedAt        DateTime?
  revocationReason String?
  createdAt        DateTime         @default(now()) // Fecha y hora exacta del episodio (occurred_at)

  document         Document?        @relation(fields: [sourceDocId], references: [id], onDelete: SetNull)

  @@index([topic])
  @@index([createdAt])
  @@index([sessionId])
  @@index([agentRunId])
  @@index([eventType])
  @@index([sourceDocId])
  @@index([revocationStatus])
}
```

**Ventaja clave:**
- El texto literal de lo que dijo el usuario y lo que respondió el modelo vive una sola vez en `ConversationMessage` (`sourceMessageIds: [148, 149]`).
- Los chunks vectoriales y las citas verificadas viven una sola vez en `AgentRun` (`agentRunId: 76`) y `ClaimEvidence`.
- `TopicSnapshot` actúa como el **índice episódico ligero y consultable por SQL (`createdAt`, `entities`, `topic`, `decisions`)**.

---

### 4.2. Los 3 Mecanismos de Recuperación (`EpisodicRetrievalService`)

Cuando el usuario formula una consulta autobiográfica o temporal, `ContextSelectorService` activa la fuente `EPISODIC_MEMORY` en uno de tres modos:

| Nivel | Tipo de Consulta del Usuario | Mecanismo SQL + Semántico |
|---|---|---|
| **Nivel 1: Fecha Exacta o Ventana Temporal** | *«¿Qué hablamos el 5 de noviembre de 2026?»*<br>*«¿Qué investigamos hoy / ayer / la semana pasada?»* | **Temporal SQL Puro + Join Ligero:**<br>1. Un extractor temporal determinista convierte `"5 de noviembre de 2026"`, `"hoy"`, `"ayer"` o `"hace 7 días"` en un rango `[startDate, endDate)`.<br>2. Consulta `TopicSnapshot` (y fallback directo a `AgentRun` si aún no se consolidó el snapshot) filtrando `WHERE createdAt >= startDate AND createdAt < endDate ORDER BY createdAt ASC`. |
| **Nivel 2: Búsqueda Semántica + Fechas** | *«¿Cuándo hablamos de William Judge o de memoria episódica?»* | **Híbrido (Léxico/Entidades + Vectorial + Fechas):**<br>1. Busca en `TopicSnapshot` por coincidencia en `topic`, `entities`, `tags`, `summary`, `conclusion` (y fallback en `AgentRun.question` / `ConversationMessage.content`).<br>2. Devuelve cada episodio con su timestamp exacto (`occurred_at`), documentos usados (`sourceDocIds`) y los mensajes originales (`sourceMessageIds`) si se requieren citas textuales. |
| **Nivel 3: Reconstrucción Longitudinal y Decisiones** | *«¿Qué decidimos sobre la arquitectura cognitiva y cómo evolucionó?»* | **Línea de Tiempo Multi-Episodio:**<br>1. Recupera todos los `TopicSnapshot` ordenados cronológicamente (`ORDER BY createdAt ASC`) que coincidan con el tema o contengan `decisions != "[]"`.<br>2. Reconstruye la secuencia temporal distinguiendo explícitamente en el prompt:<br>   - **Lo dicho literalmente** (respaldado por `ConversationMessage`).<br>   - **Lo concluido por el modelo** (`conclusion`).<br>   - **Las hipótesis abiertas** (`hypotheses`).<br>   - **Las decisiones tomadas** (`decisions`) y **preguntas pendientes** (`openQuestions`). |

---

### 4.3. Guardrail Epistémico Autobiográfico (Prohibición de Fabular Recuerdos)

Para evitar el fallo observado hoy en la sonda de línea base (donde JarBees inventó conversaciones pasadas al no tener episodios en el prompt), se incorpora una regla estricta en `UncertaintyEngineService` y `JarvisPromptBuilderService`:

> **REGLA DE HONESTIDAD AUTOBIOGRÁFICA:**
> - Cuando el usuario pregunta qué hablamos, cuándo discutimos un tema o qué decidimos en una fecha o sesión pasada, JarBees **solo puede afirmar como recuerdo aquello que figure explícitamente en el bloque `### MEMORIA EPISÓDICA Y AUTOBIOGRÁFICA VERIFICADA`** inyectado desde PostgreSQL.
> - Si la consulta temporal/episódica devuelve `0` registros para esa fecha o tema, JarBees debe responder con honestidad epistémica: *"No tengo registros en mi memoria episódica de haber conversado sobre ese tema en esa fecha"*, **teniendo terminantemente prohibido inventar o extrapolar recuerdos plausibles**.
> - Al reconstruir un episodio existente, debe mantener separadas las **decisiones tomadas**, las **conclusiones alcanzadas**, las **hipótesis en evaluación** y las **preguntas pendientes**.

---

### 4.4. Corrección del Pipeline de Consolidación Episódica

Para que cada conversación relevante (o cierre de sesión / comando explícito) genere su episodio de forma confiable sin bloquear la GPU:
1. **Conectar con el proveedor activo (`LlamaServerProvider` en `127.0.0.1:8080`)** usando la directiva `/no_think` y limpiando cualquier etiqueta `<think>...</think>` antes de parsear el JSON, respetando la cola serial de la RTX 5070.
2. **Enriquecer automáticamente con metadatos deterministas del `AgentRun`:** el `agentRunId`, los `sourceMessageIds`, los `sourceDocIds` y los `chunksRetrievedIds` **no los adivina el LLM**, se inyectan de forma 100% determinista desde el `AgentRun` que acaba de finalizar en `saveAndObserve()`.
3. **Retro-consolidación (Backfill) de los Episodios de Hoy (`2026-11-05`):** dado que `ConversationMessage` y `AgentRun` conservaron íntegramente las conversaciones de hoy en `jarbees_stage`, podemos consolidar los episodios reales de hoy (`AgentRun #68–78`, incluyendo el Smoke Test y el `DAY 001`) directamente desde los registros existentes en la base de datos.

---

## 5. Plan de Implementación Propuesto (En Staging, Paso a Paso)

Si estás de acuerdo con este diagnóstico y diseño, podemos implementarlo en tres pasos limpios y acotados:

1. **Paso 1 — Extensión Ligera de `TopicSnapshot` y Servicio de Consolidación Episódica:**
   - Añadir los campos episódicos (`eventType`, `summary`, `hypotheses`, `decisions`, `openQuestions`, `entities`, `agentRunId`, `sourceMessageIds`, `sourceDocIds`) a `TopicSnapshot` en `jarbees_stage` (sin tocar `jarbees_data`).
   - Corregir `KnowledgeEvolutionService` para usar el proveedor LLM activo con `/no_think` y adjuntar determinísticamente los IDs de `AgentRun`, `ConversationMessage` y `Document`.
2. **Paso 2 — Consolidación de los Episodios Reales de Hoy (`5 de noviembre de 2026`):**
   - Poblar los episodios de hoy en `jarbees_stage` a partir de los `AgentRun #76, #77, #78` (`DAY 001`) y del Smoke Test que ya están en la base de datos, más el episodio de esta misma decisión arquitectónica sobre **Memoria Episódica**.
3. **Paso 3 — Conexión de `EPISODIC_MEMORY` en el Pipeline Cognitivo y Re-ejecución de la Prueba de 3 Niveles:**
   - Integrar la detección de consultas temporales/autobiográficas en `ContextSelectorService` y la inyección del bloque `### MEMORIA EPISÓDICA Y AUTOBIOGRÁFICA VERIFICADA` + Guardrail Anti-Fabulación en `JarvisPromptBuilderService`.
   - Volver a ejecutar exactamente las **3 preguntas de prueba de hoy** (más una fecha sin actividad, ej. *"¿Qué hablamos el 15 de agosto de 2024?"*) en staging (`localhost:4001`) para verificar el contraste **Antes vs. Después**.

