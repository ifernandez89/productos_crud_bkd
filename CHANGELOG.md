# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project keeps its versioning in `package.json`.

## [Unreleased]

### Added
- Changelog tracking for user-facing changes.
- Detailed architecture documentation in [docs/arquitectura-sistema.md](docs/arquitectura-sistema.md).
- Explicit documentation of the local Ollama model used by the AI flow: `qwen3.5:4b`.
- **Logger global con Winston** (`nest-winston` + `winston-daily-rotate-file`): reemplaza el logger nativo de NestJS. Escribe a consola con formato colorizado y a archivos rotativos diarios — `logs/app-YYYY-MM-DD.log` (14 días, 20 MB) y `logs/error-YYYY-MM-DD.log` (30 días, 10 MB). Nivel configurable via `LOG_LEVEL` en `.env`.

### Changed
- Keep the latest implementation notes here before each release.
- The README now includes an executive overview, endpoint summary, and environment variable summary.
- Failed AI interactions are now persisted with `estado`, `errorMessage`, and `errorStatus` so error cases are auditable.
- The chatbot can now answer weather, time, holiday, and country-data questions through external tools before falling back to Ollama or OpenRouter.
- The documentation now explains supported intents, routing behavior, persistence rules, and known limitations.
- The request payload now controls the AI route correctly again: `agente=true` uses OpenRouter and `agente=false` or omitted uses Ollama.
- Weather queries now default to `Paraná, Entre Rios, Argentina` when the user does not provide a city.
- Placeholder greeting responses like `HOLA` are no longer persisted as successful AI answers.
- The AI prompt now explicitly rejects greeting-only outputs so Ollama/OpenRouter must return a substantive answer before it is saved.
- **RAG prompt optimization**: product context is now injected only when the query relates to products (keywords: precio, oferta, marca, comprar, etc.), skipping the full catalogue for unrelated questions.
- **Parallel DB calls**: `findAll()` and `findRelevant()` now run concurrently via `Promise.all()` instead of sequentially, reducing prompt-building latency.
- **Compact product format**: each product entry in the prompt was reduced from a multi-field verbose line to a single compact line (`name (marca) $price stock:N [OFERTA] [NUEVO] [DEST]`), lowering token count significantly.
- **Reduced RAG history**: relevant history context trimmed from 5 to 3 entries; each answer is capped at 200 characters to keep the prompt lean.
- **Simplified system prompt**: markdown formatting, numbered instructions, and verbose headers removed from the Ollama prompt to reduce processing overhead.
- **Ollama `numPredict` reduced**: lowered from 512 to 256 tokens — the primary driver of generation time for chat-style responses.
- **Ollama `numCtx` set to 2048**: explicit context window cap prevents the model from allocating unnecessary memory, speeding up inference.
- **Fix ECONNRESET Newton API**: timeout reducido a 5 s con `validateStatus`, catch tipado con `err: unknown`; los errores de red (`ECONNRESET`, timeout, 4xx) caen silenciosamente a `mathjs` local con un `warn` en log en lugar de propagar el error al cliente.
- **Ollama `topP`/`topK` tightened**: `topP` adjusted to 0.85 and `topK` to 15 for faster, more focused sampling.

### Fixed
- Record bug fixes that affect API behavior, validation, or deployment.

## [Unreleased — Context Expansion]

### Added
- **Astronomía local** (`astronomy-engine`): fase lunar con iluminación y próximas 4 fases, amanecer/atardecer por ciudad (Nominatim + observer), solsticios y equinoccios del año, datos de planetas (magnitud, elongación, iluminación), eclipses lunares y solares.
- **Calendario Maya** (cálculo matemático puro, sin librería): convierte cualquier fecha gregoriana a Cuenta Larga, Tzolk'in (número + nombre del día), Haab' y Señor de la Noche.
- **Calendario Hebreo** (`jewish-date`): convierte fecha gregoriana a fecha hebrea con año, mes, día y representación en caracteres hebreos.
- **Matemáticas** (`mathjs` local + Newton API sin clave): evaluación de expresiones numéricas, derivadas, integrales, simplificación y factorización. Newton API se usa para operaciones simbólicas; mathjs es el fallback local.
- Instaladas dependencias: `astronomy-engine`, `mathjs`, `jewish-date`.

### Changed
- Router de intenciones ampliado con 4 nuevos detectores: `isAstronomyQuery`, `isMayanCalendarQuery`, `isHebrewCalendarQuery`, `isMathQuery`.
- Todas las capacidades nuevas funcionan sin clave de API (stack completamente gratuito).

## [0.0.1] - 2026-06-15

### Added
- Initial NestJS backend scaffold.
- Prisma integration and database migrations.
- Products, AI chat, and upload modules.