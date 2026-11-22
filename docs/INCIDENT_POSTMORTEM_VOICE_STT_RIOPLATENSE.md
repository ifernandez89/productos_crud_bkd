# Postmortem e Informe de Corrección — Fallo Crítico de Reconocimiento de Voz (STT) en Español Rioplatense y Comandos Vocales de Adquisición

- **Fecha del incidente:** 2026-11-22
- **Severidad:** Crítica (UX de Voz / Comprensión de Consultas RAG)
- **Módulos afectados:**
  - `src/jarvis/tools/voice/whisper_transcribe.py`
  - `src/jarvis/tools/voice/voice.service.ts`
  - `src/jarvis/jarvis.controller.ts` (`POST /api/jarbees/voice/chat`)
  - `src/jarvis/jarvis.service.ts` (`JarvisVoiceContext`)
  - `src/jarvis/commands/jarvis-command.service.ts` (comandos vocales de ingesta con enfoque temático)
  - `src/jarvis/library/character-acquisition.service.ts` (`focusTopic`)

---

## 1. Resumen del Incidente

Durante pruebas de conversación por voz en español rioplatense (Argentina), el usuario consultó por la base de datos sobre **"ayuno"**. El sistema de reconocimiento de voz transcribió incorrectamente la palabra como **"A1"**. Al intentar corregir la consulta en un segundo audio deletreando la palabra letra por letra (*"ayuno: A, Y, U, N, O"*), JarBees volvió a fallar tanto en la transcripción como en la recuperación del contexto conversacional, respondiendo de forma desconectada (*"Parece que estás un poco confundido o tal vez estés probando algo"*).

### Evidencia forense (PostgreSQL & `logs/app-2026-11-22.log`)

| Registro | Timestamp | Contenido / Transcripción real | Diagnóstico |
|---|---|---|---|
| `ConversationMessage #955` / `AgentRun #513` | `15:21:11` | `¿Qué tenemos en nuestra base de datos sobre el A1?` (`conf: 0.78`, `3097 ms`) | Faster-Whisper `base` (CPU) convirtió *"ayuno"* (yeísmo/sheísmo rioplatense: *"ashuno"*) en `"A1"`. El RAG buscó `"A1"` y no encontró resultados (a pesar de que PostgreSQL sí contiene **40 chunks** reales mencionando *"ayuno"*). |
| `ConversationMessage #957` / `AgentRun #514` | `15:22:12` | `Dijé, asu no, ah, y griega, oh, n, oh, asu no, no, ah, oh, no.` (`conf: 0.749`, `1552 ms`) | Faster-Whisper `base` convirtió *"ayuno"* en `"asu no"` y la vocal *"U"* deletreada en `"oh"`. `IntentRouterService` clasificó el mensaje como `LOCAL` (`ragContextUsed: false`, `chunksRetrievedCount: 0`) y el LLM no recibió ninguna señal de que provenía de un error STT ni de que contenía un deletreo correctivo. |

---

## 2. Causas Raíz Identificadas

1. **Modelo subdimensionado (`base`, 74M) forzado en CPU (incumpliendo política GPU RTX 5070):**
   - `voice.service.ts` usaba `'base'` como modelo por defecto y `whisper_transcribe.py` tenía hardcodeado `device="cpu", compute_type="int8"`.
   - El entorno local ya contaba con `ctranslate2 4.8.2` + `faster-whisper 1.2.1` con soporte CUDA nativo activo sobre la **NVIDIA GeForce RTX 5070 (12 GB VRAM, >11 GB libres)**, pero nunca se utilizaba.
   - El modelo `base` presenta alta tasa de error en yeísmo rehilado rioplatense (`y`/`ll` → `/ʃ/`) y en vocales aisladas (`u` ↔ `o`).
2. **Ausencia de `initial_prompt`, `condition_on_previous_text=True` y VAD rígido:**
   - Sin `initial_prompt` dialectal rioplatense ni abecedario español, el decoder tendía a alucinar códigos alfanuméricos (`"A1"`) y bucles (`"asu no, no, ah, oh, no"`).
   - `vad_filter` con `min_silence_duration_ms=500` recortaba pausas y vocales cortas durante el deletreo letra por letra.
   - Sin `HF_HUB_DISABLE_XET=1` ni carga prioritaria `local_files_only=True`, las descargas iniciales en Windows podían colgarse en `hf_xet` y cada audio incurría en overhead de red hacia Hugging Face.
3. **Ausencia de acondicionamiento vocal en FFmpeg (`decodeToWav`):**
   - La conversión a WAV 16 kHz mono no aplicaba filtrado de banda vocal ni normalización dinámica, reduciendo la relación señal/ruido en consonantes fricativas y vocales breves.
4. **Falta de reconstrucción determinista de deletreo y contexto STT en `voiceChat` → `JarvisService`:**
   - `JarvisController.voiceChat()` pasaba la transcripción cruda directo a `JarvisService.query()` sin detectar patrones de deletreo español (`a, y griega, u, ene, o`), sin enlazar la corrección con la consulta inmediatamente anterior del usuario en la sesión y sin inyectar directiva de conciencia fonética STT al prompt del sistema.

---

## 3. Correcciones Implementadas

### 3.1 Aceleración GPU RTX 5070 + `large-v3-turbo` (`whisper_transcribe.py`)
- Modelo por defecto elevado a **`large-v3-turbo`** (`JARVIS_WHISPER_MODEL`, configurable).
- Selección automática de dispositivo priorizando **CUDA `float16` → fallback `cuda/int8_float16` → fallback `cpu/int8`** (`JARVIS_WHISPER_DEVICE=auto`), con carga prioritaria **`local_files_only=True`** para ejecución 100 % offline sin latencia HTTP a Hugging Face y `HF_HUB_DISABLE_XET=1` para prevenir bloqueos de descarga en Windows.
- `initial_prompt` calibrado para español rioplatense, vocabulario de JarBees (biblioteca, salud, ayuno, tarot, plantas medicinales, comandos de ingesta) y el abecedario español completo.
- `condition_on_previous_text=False`, `temperature=[0.0, 0.2, 0.4]`, VAD suave (`threshold=0.35`, `min_speech_duration_ms=120`, `min_silence_duration_ms=700`, `speech_pad_ms=300`) y reintento automático sin VAD en audios muy breves o de baja confianza (`< 0.55`).

### 3.2 Acondicionamiento de Banda Vocal en FFmpeg (`voice.service.ts`)
- Filtro de voz `-af highpass=f=80,lowpass=f=7600,dynaudnorm=f=150:g=15:p=0.9` antes de pasar el WAV 16 kHz mono a Whisper, con fallback transparente a decodificación directa sin filtro.

### 3.3 Reconstrucción Determinista de Deletreo Español y Contexto STT (`voice.service.ts`, `jarvis.controller.ts`, `jarvis.service.ts`)
- **`VoiceService.analyzeVoiceTranscript()` & `extractSpelledWords()`:** Reconstruye secuencias contiguas de ≥ 3 letras/nombres de letras del español (`a/ah`, `y griega/i griega`, `u/uh`, `ene/n`, `o/oh`, `hache`, `equis`, `doble ve`, etc.) con protección estricta contra falsos positivos en oraciones normales.
- **`VoiceService.buildVoiceChatQuery()`:** Cuando el usuario corrige o deletrea un término tras una consulta previa de base de datos/biblioteca en la misma sesión, enlaza automáticamente el término reconstruido con la pregunta original para que `IntentRouterService` reactive el RAG correctamente.
- **`JarvisVoiceContext` en `JarvisService`:** Inyecta una directiva específica en `finalSystemPrompt` (sin contaminar el texto embebido para `pgvector`) para que el LLM reconozca posibles homófonos/yeísmo rioplatense y nunca desestime al usuario como "confundido".

### 3.4 Comandos Vocales de Ingesta de Autores con Enfoque Temático (`jarvis-command.service.ts`, `character-acquisition.service.ts`)
- Soporte directo por voz y texto para solicitudes con foco temático específico, por ejemplo:
  - *"buscá e ingestá información específicamente de tarot sobre Pamela Colman Smith"*
  - *"JarBees, buscá e ingestá información sobre Pamela Colman Smith específicamente de tarot"*
  - `POST /api/jarbees/library/acquire-character` (acepta `focusTopic`, mantiene cuarentena Zero-Trust `autoApprove: false`).
- `CharacterAcquisitionService` incorpora `focusTopic`: infiere la categoría JarBees correspondiente (`tarot` → `Tarot y Simbolismo`), descarga artículos temáticos complementarios, genera un capítulo prioritario `# Enfoque Temático Prioritario`, y enriquece `library-index.json` + Knowledge Graph.

---

## 4. Variables de Entorno de Voz

| Variable | Valor por defecto | Propósito |
|---|---|---|
| `JARVIS_WHISPER_MODEL` | `large-v3-turbo` | Modelo Faster-Whisper (alternativas: `medium`, `small`, `large-v3`). |
| `JARVIS_WHISPER_DEVICE` | `auto` | `auto` prioriza GPU CUDA (RTX 5070); permite forzar `cuda` o `cpu`. |
| `JARVIS_WHISPER_COMPUTE_TYPE` | *(auto: `float16` en CUDA)* | Tipo de precisión CTranslate2 (`float16`, `int8_float16`, `int8`). |
| `JARVIS_WHISPER_PROMPT` | *(prompt rioplatense + abecedario)* | Prompt inicial para sesgar vocabulario/acento del decoder. |

---

## 5. Verificación y Pruebas

- **Suites unitarias (`--runInBand`, anti-OOM):**
  - `src/jarvis/tools/voice/voice.service.spec.ts` — PASS
  - `src/jarvis/library/character-acquisition.service.spec.ts` — PASS
  - `src/jarvis/commands/jarvis-command.service.spec.ts` — PASS
  - `src/jarvis/security/dev-001-b1-security-hardening.spec.ts` — PASS (`91` rutas auditadas intactas)
  - **Total:** `4/4` suites · `71/71` tests PASS · `nest build` exit `0`.
- **Benchmark A/B empírico en vivo (`es-AR-TomasNeural` → NVIDIA GeForce RTX 5070, 12 GB VRAM):**

---

## 6. Resultados Reales del Benchmark A/B (RTX 5070)

Pruebas ejecutadas con 4 audios sintetizados en español argentino rioplatense (`es-AR-TomasNeural`), comparando la configuración anterior (`faster-whisper-base` en CPU `int8` sin filtro vocal ni `initial_prompt`) contra la corrección (`faster-whisper-large-v3-turbo` en GPU **RTX 5070** `cuda/float16` con acondicionamiento vocal FFmpeg y `initial_prompt` rioplatense):

| Caso de prueba | Texto esperado | ANTES (`base` CPU `int8`) | DESPUÉS (`large-v3-turbo` RTX 5070 `cuda/float16`) | Confianza (Antes → Después) | Tiempo decode GPU |
|---|---|---|---|---|---|
| `ayuno_directo` | `¿Qué tenemos en nuestra base de datos sobre el ayuno?` | `¿Qué tenemos en nuestra base de datos sobre el ayuno?` | `¿Qué tenemos en nuestra base de datos sobre el ayuno?` | `0.878` → **`0.916`** | `22.6s` *(1ª compilación JIT CUDA Blackwell)* |
| `ayuno_deletreo` *(caso crítico)* | `Dije ayuno: a, i griega, u, ene, o. Ayuno, no A uno.` | `Dijas uno, a y griega, o n o, asuno, no a uno.` ❌ | **`Dije ayuno, a, y, u, n, o. Ayuno, no a uno.`** ✅ | `0.717` → **`0.902`** | **`867 ms`** (`2.64 s` total) |
| `comando_voz_pamela` | `Buscá e ingestá información específicamente de tarot sobre Pamela Colman Smith.` | `Busca e ingesta información específicamente de Tarot sobre Pamela Colman Esmis.` ⚠️ | **`Buscá e ingestá información específicamente de tarot sobre Pamela Coleman Smith.`** ✅ | `0.871` → **`0.922`** | **`716 ms`** (`2.44 s` total) |
| `rioplatense_yeismo` | `Buscá en la biblioteca sobre Hildegarda de Bingen, la yerba mate y la lluvia en la calle.` | `...la servamate y la lluvia en la calle.` ❌ | **`Buscá en la biblioteca ... la yerba mate y la lluvia en la calle.`** ✅ | `0.863` → **`0.920`** | **`771 ms`** (`2.54 s` total) |

### Hallazgos adicionales resueltos durante la validación en vivo
1. **Resolución automática de `cublas64_12.dll` en Windows:** En la primera corrida CUDA, CTranslate2 arrojó `Library cublas64_12.dll is not found` porque el runtime CUDA v12 ya estaba instalado localmente por Ollama (`%LOCALAPPDATA%\Programs\Ollama\lib\ollama\cuda_v12`), pero fuera del `PATH` de Python. Se implementó `register_windows_cuda_dll_dirs()` con `os.add_dll_directory()` + fallback en tiempo de inferencia (`cuda/float16` → `cuda/int8_float16` → `cpu/int8`).
2. **Caché offline (`local_files_only=True`) y `HF_HUB_DISABLE_XET=1`:** Se resolvió el bloqueo de `hf_xet` en Windows durante descargas de Hugging Face y se priorizó carga local sin llamadas de red en cada transcripción.
3. **Deduplicación estricta en `CharacterAcquisitionService`:** Durante la adquisición real de **Pamela Colman Smith (enfoque Tarot)** se detectó un falso positivo de deduplicación fuzzy en `findDocumentByExactTitle` por coincidencia de palabras genéricas (`"Dossier"` + `"Obra"`). Se endureció a coincidencia exacta case-insensitive, permitiendo indexar correctamente a **Pamela Colman Smith (Tarot)** como `docId #259` (`Tarot y Simbolismo`, `55/55` chunks con embeddings `bge-m3` al `100%`).

