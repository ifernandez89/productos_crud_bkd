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



