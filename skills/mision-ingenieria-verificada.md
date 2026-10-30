---
name: mision-ingenieria-verificada
description: Procedimiento estandarizado (SOP) para ejecutar misiones de ingeniería de software con validación AST, tests aislados, Best-Checkpoint Rollback y HITL.
category: software_engineering
priority: 10
keywords:
  - ingenieria
  - refactor
  - codigo
  - verificacion
  - rollback
  - hitl
capabilities:
  - LLM_LOCAL_CODER
  - CODE_VERIFICATION_HARNESS
  - ISOLATED_TEST_RUNNER
preconditions:
  - CODE_VERIFICATION_HARNESS
  - ISOLATED_TEST_RUNNER
steps:
  - "Inspeccionar telemetría de tokens (telemetry_inspection) para asegurar margen de contexto seguro."
  - "Capturar snapshot inicial SHA-256 mediante CheckpointManagerService."
  - "Validar sintaxis AST, alcance léxico y contratos exportados requeridos (requiredExports)."
  - "Ejecutar suite de pruebas en subproceso aislado (IsolatedTestRunnerService)."
  - "Si una reparación degrada el score o rompe tests laterales, aplicar rollback físico al mejor checkpoint."
  - "Detenerse en awaiting_human_approval antes de integrar cambios al workspace real."
pitfalls_to_avoid:
  - "Jamás eliminar interfaces o funciones exportadas públicas (requiredExports)."
  - "Jamás modificar archivos protegidos (verification/**, security/**, .env*) sin token criptográfico."
  - "Jamás ejecutar Jest sin --runInBand para evitar colapsos OOM."
verification_steps:
  - "Confirmar que staticValidation.valid === true."
  - "Confirmar que el 100% de las aserciones objetivas y de regresión lateral pasen."
  - "Auditar diffBeforeAfter y requerir token HITL antes de escribir en el workspace."
---

# SOP: Misión de Ingeniería Verificada

Procedimiento obligatorio para misiones de modificación o reparación de código real en JarBees mediante `EngineeringMissionManagerService` y `VerificationHarnessService`.

