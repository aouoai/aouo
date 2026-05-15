# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `GET /api/packs/:pack` returns a loaded pack's detail (manifest, parsed SKILL.md metadata, cron defaults) for the dashboard pack workspace.
- `WebSessionAdapter` — a non-Telegram `Adapter` implementation that turns Agent events into Server-Sent Events for the local dashboard.
- `aouo ui start` now loads installed packs at boot so the dashboard API can resolve them.
- Project scaffold: TypeScript, ESLint, Prettier, Vitest, tsup, CI/CD
- Core type definitions: Message, ToolCall, LLMProvider, Adapter, ToolDefinition
- Configuration system with Zod validation and deep merge
- Path management (`~/.aouo/` data directory)
- Structured logging with Pino
