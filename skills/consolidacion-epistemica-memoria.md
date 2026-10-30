---
name: consolidacion-epistemica-memoria
description: Procedimiento estandarizado (SOP) para ejecutar la rutina sleep de consolidación, deduplicación y calibración epistémica de la Memoria Tripartita.
category: memory_management
priority: 9
keywords:
  - memoria
  - sleep
  - consolidacion
  - contradiccion
  - epistemica
  - tripartita
capabilities:
  - PGVECTOR_RAG
  - KNOWLEDGE_GRAPH
preconditions:
  - PGVECTOR_RAG
  - KNOWLEDGE_GRAPH
steps:
  - "Purgar ítems expirados de WorkingMemory y promover aquellos con salience >= 0.85."
  - "Deduplicar recuerdos episódicos redundantes dentro de la misma categoría."
  - "Detectar decisiones cambiadas o contradictorias y etiquetar la versión previa como DECISION_SUPERSEDED sin borrarla."
  - "Aplicar decaimiento temporal a recuerdos obsoletos no accedidos."
  - "Mantener las hipótesis sin evidencia verificada en cuarentena (PendingRelation)."
pitfalls_to_avoid:
  - "Jamás transformar una hipótesis en hecho confirmado automáticamente durante la rutina sleep."
  - "Jamás borrar el historial de una decisión anterior; usar trazabilidad DECISION_SUPERSEDED."
verification_steps:
  - "Verificar que epistemicAudit.autoPromotedToFact === 0."
  - "Confirmar que las decisiones reemplazadas conserven referencia al ID del nuevo recuerdo."
---

# SOP: Consolidación Epistémica de Memoria (`sleep`)

Procedimiento para mantener ordenada la Memoria Tripartita de JarBees (*Working*, *Episodic* y *Associative TripleStore*) garantizando integridad epistémica y trazabilidad.

