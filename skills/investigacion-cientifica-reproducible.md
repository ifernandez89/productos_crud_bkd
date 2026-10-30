---
name: investigacion-cientifica-reproducible
description: Procedimiento estandarizado (SOP) para formular hipótesis, diseñar simulaciones computacionales y verificar resultados empíricos.
category: scientific_research
priority: 10
keywords:
  - investigacion
  - cientifica
  - simulacion
  - hipotesis
  - reproducible
  - experimento
capabilities:
  - ISOLATED_TEST_RUNNER
  - CODE_VERIFICATION_HARNESS
  - PGVECTOR_RAG
preconditions:
  - ISOLATED_TEST_RUNNER
  - CODE_VERIFICATION_HARNESS
steps:
  - "Descomponer la pregunta en objetivos investigables y falsables."
  - "Extraer parámetros cuantitativos y fuentes de referencia desde RAG o documentos verificados."
  - "Formular hipótesis explícitas y registrarlas en cuarentena (PendingRelation)."
  - "Implementar la herramienta o simulación computacional mediante el especialista de código."
  - "Ejecutar en sandbox aislado y cuantificar márgenes de error relativo."
pitfalls_to_avoid:
  - "No extrapolar conclusiones más allá del rango de datos probados."
  - "No alterar unidades físicas sin conversión dimensional verificada."
  - "No promover una hipótesis a hecho confirmado sin respaldo documental y verificación empírica."
verification_steps:
  - "Comprobar reproducibilidad determinista del script de simulación."
  - "Verificar que el error relativo esté cuantificado frente a datos o efemérides de referencia."
  - "Documentar explícitamente las limitaciones del modelo."
---

# SOP: Investigación Científica Reproducible

Este procedimiento guía a JarBees cuando actúa como **Investigador Técnico Multidisciplinario** combinando consulta documental, formulación de hipótesis y experimentación computacional.

1. **Planificación**: Definir variables dependientes, independientes y constantes físicas/técnicas.
2. **Instrumentación**: Solicitar al especialista (`Qwen2.5-Coder-14B`) el script de análisis o simulación bajo validación estática AST.
3. **Verificación Empírica**: Contrastar la salida numérica con valores tabulados y registrar las conclusiones sin exceder la evidencia demostrada.

