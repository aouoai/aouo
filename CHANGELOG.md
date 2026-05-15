# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pack workspace **Storage tab** (read-only SQLite browser). Left rail lists tables with row-count badges; right pane shows columns + the trailing 50 rows ordered by `rowid DESC`, with NULL highlighted and long cell values truncated to a hover tooltip. Backed by `GET /api/packs/:pack/storage/tables` and `GET /api/packs/:pack/storage/tables/:name?limit=`. The endpoint opens the pack DB read-only with `query_only=ON` and short-circuits when no file exists yet so visiting Storage does not materialize empty `*.db` files.
- Pack workspace **Memory tab** (read-only). Left rail lists canonical files (USER.md / MEMORY.md) plus any extra `*.md` under the pack's data dir; right pane renders markdown via `react-markdown`. Backed by `GET /api/packs/:pack/memory` and `GET /api/packs/:pack/memory/:file` — strict filename guard rejects path traversal and non-markdown reads.
- `GET /api/packs/:pack/history` returns the dashboard's bound session id and its most recent user/assistant turns (default 50, capped at 200). The pack workspace uses it to rehydrate the chat panel on mount so refreshes no longer drop the conversation.
- Chat panel surfaces a per-message **Retry** affordance on the trailing failed assistant turn. Retry drops the failed pair and re-streams the prior user input so the transcript stays clean.
- Dashboard pack workspace at `/packs/:pack`: each loaded pack becomes a per-app surface with its own breadcrumb topbar, centered display name, settings affordance, and a Chat tab backed by the SSE chat endpoint. Memory / Storage / Cron / Logs tabs are placeholders for Phase 5.
- Dashboard chat input supports a `/` skill picker (cmdk-powered popover) that turns the chosen skill into a soft `skillHint` on the next agent turn.
- Dashboard layout rebuilt on the shadcn sidebar-07 primitive: collapsible-to-icon sidebar with `Apps` (dynamic packs) at the top, then `Workspace` and `Settings` groups.
- `POST /api/packs/:pack/chat` streams an Agent turn as Server-Sent Events (`token` / `tool_call` / `tool_result` / `dispatch` / `done` / `error`). Dashboard sessions are stored under `platform='web'` alongside the existing Telegram routes.
- `GET /api/packs/:pack` returns a loaded pack's detail (manifest, parsed SKILL.md metadata, cron defaults) for the dashboard pack workspace.
- `WebSessionAdapter` — a non-Telegram `Adapter` implementation that turns Agent events into Server-Sent Events for the local dashboard.
- `aouo ui start` now loads installed packs at boot so the dashboard API can resolve them.
- Project scaffold: TypeScript, ESLint, Prettier, Vitest, tsup, CI/CD
- Core type definitions: Message, ToolCall, LLMProvider, Adapter, ToolDefinition
- Configuration system with Zod validation and deep merge
- Path management (`~/.aouo/` data directory)
- Structured logging with Pino
