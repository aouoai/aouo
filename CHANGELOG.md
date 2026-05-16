# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Memory tab **editor**. Each canonical / extra `*.md` file now has an **Edit** button that swaps the markdown render for a textarea seeded with the current content; canonical files that haven't been written yet show **Create** instead so the user can seed `MEMORY.md` from the dashboard without going through the agent. Save calls `PUT /api/packs/:pack/memory/:file` which validates the filename guard, caps content at 1 MiB, and writes via tmp-file-and-rename so a half-flushed memory file can never be visible to the next agent turn. Cancelling a dirty edit prompts before discarding. The raw HTTP body cap moved from 1 MB → 2 MB so a memory edit at the route cap reaches its handler and gets a clean 400 rather than a TCP reset.
- Pack workspace **Logs tab** (read-only). Merges every `*.log` file under `~/.aouo/logs/` (gateway, ui, …), parses each JSON line written by Pino, and renders the trailing entries in time-DESC order. Filter by level (debug/info/warn/error/fatal/trace), expand a row to see its full `context` object, page backwards via the **Load older** button which threads an ISO `before=<oldestTime>` cursor. Pack-scope rule: include lines tagged `pack: <name>` for this pack **plus** untagged system events (scheduler ticks, provider faults) so cross-cutting failures aren't hidden; lines tagged for a different pack are excluded. Files exceeding 16 MiB are tail-read with a `truncated` source flag. Non-JSON lines (e.g. the boot banner in `ui.log`) are skipped silently. Backed by `GET /api/packs/:pack/logs?level=&limit=&before=`.
- Pack workspace **Cron tab**. Lists the jobs the pack registered with the scheduler (pack-scoped — other packs' jobs are not exposed), shows schedule / next-run / last-run + status, and offers per-job pause/resume via a `Switch` and a **Run now (preview)** button. Preview uses a new `dryRunJob(config, id)` export in `lib/scheduler.ts` that runs the agent against the job's prompt **without** advancing `next_run_at`, writing an output file, or dispatching a proactive message — schedule state stays untouched so users can sanity-check a cron without nudging its clock. Backed by `GET /api/packs/:pack/cron` and `POST /api/packs/:pack/cron/:id/(pause|resume|run)`, with a pack-ownership guard rejecting cross-pack mutations as 404.
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
