# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project keeps its versioning in `package.json`.

## [Unreleased]

### Added
- Changelog tracking for user-facing changes.
- Detailed architecture documentation in [docs/arquitectura-sistema.md](docs/arquitectura-sistema.md).
- Explicit documentation of the local Ollama model used by the AI flow: `llama3.2:3b`.

### Changed
- Keep the latest implementation notes here before each release.
- The AI prompt now includes lightweight retrieval over previously stored questions and answers, in addition to product context.
- The README now includes an executive overview, endpoint summary, and environment variable summary.

### Fixed
- Record bug fixes that affect API behavior, validation, or deployment.

## [0.0.1] - 2026-06-15

### Added
- Initial NestJS backend scaffold.
- Prisma integration and database migrations.
- Products, AI chat, and upload modules.