# Custom rules for this project

## Model Rankings & Preferences

Use the following guidelines for model selection and configurations:

- **🥇 Qwen 3 4B** (Score: 9.8/10)
  Best suited for:
  - RAG (Retrieval-Augmented Generation)
  - Documentation tasks
  - Programming & coding
  - Strict instruction following
  - Technical knowledge

- **🥈 Gemma 3 4B** (Score: 9.6/10)
  Best suited for:
  - Summarization & summaries
  - Writing & creative text generation
  - Conversational flows
  - Long synthesis

## Translation Rules

- **PERSISTENCIA INCREMENTAL EN DISCO OBLIGATORIA (.txt / .json):** Queda ESTRICTAMENTE PROHIBIDO mantener traducciones únicamente en memoria RAM durante su procesamiento. Cada fragmento traducido DEBE ser guardado inmediatamente en un archivo de texto en disco (`.txt` o `.json`). Si el proceso se interrumpe o falla en la generación final (PDF), el 100% de la traducción procesada debe quedar a salvo en disco para ser reutilizada sin perder tiempo.
- **REUTILIZACIÓN OBLIGATORIA DE CACHE EN DISCO (NO RE-TRADUCIR):** Antes de traducir cualquier bloque o fragmento, el sistema debe comprobar el cache guardado en disco (`.json` / `.txt`). Si el texto o bloque ya fue traducido previamente, está ESTRICTAMENTE PROHIBIDO volver a enviarlo a traducir al modelo. Se debe reutilizar la traducción existente sin re-procesarla.
- **CODIFICACIÓN ANSI OBLIGATORIA EN SUBTÍTULOS (.srt):** Al generar o guardar archivos de subtítulos (`.srt`), la codificación del archivo final DEBE SER SIEMPRE ANSI (Windows-1252 / `latin1`), NUNCA UTF-8. Asimismo, se deben limpiar caracteres Unicode especiales (comillas curvas, guiones largos `—`, puntos suspensivos `…`) convirtiéndolos a sus equivalentes estándar ANSI/ASCII antes de escribir en disco.
- **NUNCA ingestar en la base de datos (chunks, embeddings, etc.) durante la traducción de un libro o documento.** El flujo de traducción debe limitarse ÚNICAMENTE a traducir el texto, escribirlo incrementalmente en disco y generar el archivo PDF traducido al español.

## Testing & Resource Safety Rules (Anti-OOM)

- **EJECUCIÓN SERIAL ESTRICTA EN TESTS (`--runInBand`):** Queda TERMINANTEMENTE PROHIBIDO ejecutar Jest con múltiples workers concurrentes en paralelo sin límite en este proyecto. Todo comando de test DEBE ejecutarse con `--runInBand` o con `maxWorkers=1`. Cada worker de ts-jest compila TypeScript al vuelo y consume ~2.5 GB de heap de Node.js, provocando colapsos de memoria (`Allocation failed - JavaScript heap out of memory`) y crasheos del proceso renderer de Electron (`reason: oom, code: 536870904`).
- **PROHIBIDO EL VOLCADO MASIVO DE LOGS A STDOUT EN PRUEBAS:** Las suites de prueba que iteren múltiples ítems o benchmarks deben emitir únicamente métricas consolidadas o resúmenes breves. Saturar la terminal del IDE con miles de líneas infla el árbol DOM del visor web y detona el límite de memoria del IDE.
- **TEARDOWN LIMPIO OBLIGATORIO:** Cualquier servicio o prueba que inicialice `setInterval`, `setTimeout`, servidores HTTP o clientes Prisma debe liberar y desuscribir todos los recursos en `afterAll` / `afterEach` (`.unref()` o `.destroy()`) para impedir fugas de memoria y procesos zombi.




