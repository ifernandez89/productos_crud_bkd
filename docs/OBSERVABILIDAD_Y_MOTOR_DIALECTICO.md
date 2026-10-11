# Arquitectura de Observabilidad Cognitiva, Motor Dialéctico y Calibración Epistémica (Fases 1, 2 y 3)

## 📌 Resumen Ejecutivo

JarBees incorpora una infraestructura completa de **observabilidad real**, **contrastación dialéctica en 2 fases** y **calibración pericial de afirmaciones**, cerrando la brecha entre la recuperación documental (RAG) y la evaluación crítica de hipótesis interdisciplinarias.

A diferencia de sistemas que reconstruyen su razonamiento de forma retrospectiva, JarBees registra **en tiempo de ejecución** las métricas reales, latencias por etapa, premisas auditadas y afirmaciones extraídas.

---

## 🏗️ 1. Fase 1: Observabilidad Cognitiva Real

### Modelo de Datos (PostgreSQL + Prisma)

Se extendió el modelo `AgentRun` y se añadieron dos tablas relacionales dedicadas:

1. **`AgentRun`**:
   - `intentClassified`: Clasificación de intención (ej. `RAG`, `LOCAL`, `WEB`, `DIALECTIC`).
   - `intentConfidence`: Nivel de confianza numérico (0.0 a 1.0).
   - `chunksRetrievedIds`: Array serializado de IDs de fragmentos recuperados en `jarbees_data`.
   - `chunksRetrievedCount`: Cantidad total de fragmentos recuperados.
   - `ragContextUsed`: Booleano que indica si se inyectó contexto documental.
   - `dialecticUsed`: Booleano que confirma la activación del motor dialéctico.
   - `auditPhaseMs`: Tiempo real (en milisegundos) consumido por la fase forense de auditoría.
   - `synthesisPhaseMs`: Tiempo real consumido por la fase de síntesis crítica.
   - `tensionsDetected`: Booleano que indica si se detectaron tensiones lógicas o contradicciones entre autores.
   - `executionTrace`: JSON estructurado con el desglose de inferencia y deducción.

2. **`CognitiveExecutionTrace`**:
   - `agentRunId` (1:1 con `AgentRun`).
   - `queryEntities`: Entidades y autores detectados en la consulta.
   - `retrievalMethod`: `vector`, `textual` o `hybrid`.
   - `chunksRetrieved`: Detalle de chunks evaluados con sus autores y puntajes.
   - `coverageScore`: Porcentaje de cobertura temática (0.0 a 1.0).
   - `auditReport`: Ficha forense emitida por el auditor.
   - `premisesChecked`: Array de premisas evaluadas con respaldo documental y empírico.
   - `uncertaintyLevel`: Nivel de incertidumbre epistemológica (0.0 a 1.0).

3. **`ClaimEvidence`**:
   - `agentRunId` (1:N con `AgentRun`).
   - `claim`: La afirmación atómica evaluada.
   - `status`: Estado de la afirmación (`supported`, `contradicted`, `partially_supported`, `inference`, `speculative`, `unverified`).
   - `supportingChunkIds`: Chunks que respaldan textualmente la afirmación.
   - `contradictingChunkIds`: Chunks que contradicen la afirmación.
   - `author`: Autor atribuido.
   - `document`: Título del documento de origen.
   - `limitations`: Limitaciones metodológicas o advertencias epistémicas.

### Endpoint de Explicabilidad Forense: `/api/jarbees/explain/:runId`

Devuelve el desglose de lo que realmente ocurrió:

```json
{
  "runId": 56,
  "question": "¿Cómo concilia Grinberg el concepto de sincronicidad de Jung con la Teoría Sintérgica?",
  "metrics": {
    "totalDurationMs": 4650,
    "auditPhaseMs": 1420,
    "synthesisPhaseMs": 3230,
    "modelUsed": "deepseek-r1:7b",
    "provider": "ollama"
  },
  "routing": {
    "intentClassified": "RAG",
    "intentConfidence": 0.95,
    "dialecticUsed": true,
    "ragContextUsed": true
  },
  "evidenceRetrieval": {
    "chunksCount": 3,
    "coverageScore": 0.95
  },
  "cognitiveStages": {
    "auditReport": "Auditoría Forense: Se verificó que los conceptos provienen de marcos epistémicos diferentes...",
    "premisesChecked": [
      {
        "premise": "Grinberg unifica Jung y física",
        "documentalSupport": false,
        "empiricalSupport": "hypothesis"
      }
    ],
    "tensionsDetected": true,
    "uncertaintyLevel": 0.25
  },
  "claimsBreakdown": [
    {
      "id": 1,
      "claim": "Jacobo Grinberg formuló la Teoría Sintérgica...",
      "status": "supported",
      "author": "Jacobo Grinberg"
    }
  ]
}
```

---

## ⚡ 2. Fase 2: Integración del Motor Dialéctico en 2 Fases

El servicio `DialecticReasoningService` fue integrado al flujo principal de `JarvisService.query()`.

### Detección y Enrutamiento Automático

El motor dialéctico se dispara automáticamente si:
1. `options.mode === 'dialectic'` o `options.useDialectic === true`.
2. O la consulta contiene patrones de contrastación interdisciplinaria (`compara`, `contrasta`, `diferencias entre`, `falsa equivalencia`, `es válido inferir`, `tensión entre`, `quién tiene razón`, `conciliar`, `armonizar`, `demostró realmente`).

### Pipeline de Inferencia en 2 Etapas

```mermaid
graph TD
    UserQuery[Consulta del Usuario] --> Router{¿Pregunta Dialéctica / Comparativa?}
    Router -- Sí --> RAG[Recuperación de Fragmentos RAG]
    RAG --> Stage1[Fase 1: Auditoría Forense de Evidencia<br/>Temp 0.2 | DeepSeek-R1]
    Stage1 --> AuditSheet[Ficha de Auditoría de Premisas<br/>auditPhaseMs registrado]
    AuditSheet --> Stage2[Fase 2: Síntesis Dialéctica y Rigor Epistémico<br/>Temp 0.6 | DeepSeek-R1]
    Stage2 --> Result[Respuesta Estructurada en 5 Puntos<br/>synthesisPhaseMs registrado]
    Result --> Trace[Trazabilidad Cognitiva & Extracción de Claims]
```

1. **Fase 1 (Auditoría Forense - Temp 0.2)**:
   - Descompone la consulta en premisas verificables.
   - Audita si las premisas cuentan con **Respaldo Documental** (aparece en los textos) y **Respaldo Empírico** (demostrado vs. hipótesis vs. especulación).
   - Detecta atribuciones apócrifas o falsas.
   - Emite una **Ficha de Auditoría de Evidencia**.
2. **Fase 2 (Síntesis Crítica - Temp 0.6)**:
   - Recibe la Ficha de Auditoría previa + los fragmentos documentales.
   - Desarrolla la respuesta estructurada:
     1. Auditoría de Premisas y Fuentes.
     2. Tesis y Enfoque de cada autor / disciplina.
     3. Puntos de Convergencia o Analogías Válidas.
     4. Tensiones Irreconciliables y Límites Metodológicos.
     5. Conclusión y Síntesis Crítica Proporcional.

---

## 🎯 3. Fase 3: Calibración y Evaluación de Afirmaciones (Claims)

### Extracción Granular con `ClaimExtractorService`

- Descompone la respuesta en proposiciones atómicas verificables.
- Vincula cada afirmación con los fragmentos de la biblioteca que la sustentan o contradicen.
- Clasifica inicialmente cada afirmación como `supported`, `contradicted`, `speculative`, `inference` o `unverified`.

### Endpoint de Calibración Humana / Pericial

`POST /api/jarbees/runs/:runId/claims/:claimId/evaluate`

Permite a los investigadores y usuarios expertos evaluar afirmaciones individuales:

```bash
POST /api/jarbees/runs/56/claims/2/evaluate
Content-Type: application/json

{
  "status": "contradicted",
  "notes": "Calibrado por auditoría experta: Grinberg nunca sostuvo que la sincronicidad fuera un efecto cuántico de la Lattice."
}
```

### Estadísticas Globales de Observabilidad

`GET /api/jarbees/cognitive/stats`

Provee métricas de salud del sistema cognitivo:
- Total de runs ejecutados.
- Tasa de uso de motor dialéctico vs. RAG estándar.
- Puntuación promedio de cobertura de evidencia (`avgCoverageScore`).
- Conteo y distribución de afirmaciones por estado (`supported`, `speculative`, `contradicted`, `unverified`).

---

## 🧪 4. Resultados de Verificación y Testing

Ejecutado mediante `scripts/test_observability_and_dialectic_flow.js`:

| Prueba | Componente Evaluado | Resultado | Latencia Observada |
|---|---|---|---|
| **Fase 1** | Persistencia `AgentRun`, `CognitiveExecutionTrace`, `ClaimEvidence` y `/explain/:runId` | **APROBADA (100%)** | 12 ms |
| **Fase 2** | Motor dialéctico de 2 fases en `deepseek-r1:7b` (Auditoría Forense + Síntesis Crítica) | **APROBADA (100%)** | Auditoría: 18,037 ms<br/>Síntesis: 9,309 ms |
| **Fase 3** | Calibración pericial de claims y actualización de estado + conteo global | **APROBADA (100%)** | 8 ms |

Compilación con `npm run build`: **0 errores**.
Base de datos: **100% sincronizada en PostgreSQL `jarbees_data`**.
