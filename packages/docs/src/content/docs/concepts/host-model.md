---
title: The Host Model
description: aouo's three-part architecture — runtime, desktop, and .aouo pack — and why separating host from app is the move that makes everything else possible.
---

aouo has three moving parts. They are intentionally separate.

```text
aouo runtime
  Loads packs, runs agents, manages SQLite, memory, tools, schedules,
  permissions, usage, logs, and optional adapters.

aouo desktop / dashboard
  Lets users install, configure, chat with, inspect, debug, and control packs.

.aouo pack
  The installable AI app bundle: skills, memory defaults, optional schema,
  persist contract, UI surfaces, workflows, permissions, and evals.
```

The runtime is the **host**. The pack is the **app**. The dashboard is the surface where the two meet the user.

## Why this split

The closest analogy is not "one chatbot with many prompts." It is closer to:

| Host | App |
| --- | --- |
| VS Code | extensions |
| Obsidian | plugins |
| Raycast | extensions |
| Docker | containers |
| **aouo runtime** | **`.aouo` packs** |

In every one of those, the host is a generic execution + UI shell that knows nothing about a specific app's domain. The app declares what it is, what it needs, and what it does. The user installs apps, not features.

That pattern works because:

- **The host stays stable.** A pack-author can ship for it without coordinating with every other pack.
- **Apps can fail without the host failing.** A buggy pack does not crash the runtime.
- **Apps are forkable.** A user can copy a pack directory and modify it without rebuilding the host.
- **State stays with the app.** Uninstalling a pack reclaims its space; installing it back restores what fits.

aouo is the first three of those in pre-alpha today; the fourth — full export/import of `.aouo` archives — is the long-term target.

## What the runtime owns

The runtime — `@aouo/agent` — is the layer below every pack. It provides:

- **Pack loader + ABI** — manifest validation, schema migrations, skill registry, permission gating
- **ReAct agent loop** — history sanitization, context compression, error classification with retry / failover
- **Pack-scoped isolation** — every pack has its own SQLite DB, its own `USER.md` / `MEMORY.md`, its own skill namespace
- **Conversation routing** — `(platform, chat, thread, user)` → active pack + active skill + session, stored durably
- **Scheduler** — cron jobs declared in pack manifests
- **Quota gates** — daily and per-session caps thrown before the LLM is called
- **Structured logs** — pino with global secret auto-redact

The runtime contains **zero domain knowledge**. There is no English-coaching code in core, no journaling table, no content-pipeline helper. Domain logic lives entirely in packs.

See [Architecture](/concepts/architecture/) for the file-level layout and [Pack Routing](/internals/pack-routing/) for the routing identity model.

## What the desktop owns

The desktop client (and its current ancestor, the local dashboard) is where the user spends most of their time. It surfaces what would otherwise be hidden inside SQLite:

- **Pack management** — install, configure, upgrade, fork, archive
- **Chat** — primary conversation surface per pack
- **Memory editor** — direct read/write of `soul.md`, `user.md`, `state.md`
- **Database browser** — inspect pack tables; the user can see exactly what their agent "remembers"
- **Schedule panel** — every cron job, its next firing, last result
- **Permission inspector** — what the pack is allowed to do and what it accessed
- **Logs** — token spend, tool calls, errors, all redacted-safe
- **Builder** (future) — assemble packs from skills, memory, schema, cron, tools, evals

Chat channels (Telegram today, Discord and others later) are **optional remote adapters**. They are not the primary surface. They exist for mobile notifications and quick replies; configuring a pack from a chat command is the wrong shape.

## What a pack owns

Everything domain-specific. A pack ships with:

- A manifest (`pack.yml`) declaring identity, skills, memory paths, storage mode, persist contract, cron schedule, permissions, context policy
- Skills (`SKILL.md` files) — focused workflows loaded on demand
- Memory defaults (`soul.md`, `user.md`, `state.md`) — copied once on first install
- Optional schema (`schema.sql`) + migrations — only when typed domain state is needed
- Optional custom tools — pack-specific tools registered alongside built-ins
- Optional evals — behavioral tests the runtime can run after upgrade

The pack does not decide where files live, how SQLite is initialized, how cron is scheduled, or how the LLM is called. Those are runtime concerns. The pack only declares what it needs.

See [Pack Spec](/concepts/pack-spec/) for the full manifest contract.

## Why "host" not "framework"

A framework provides primitives — `Agent.run`, `tools.register`, `db.query`. A pack-author still has to wire everything: pick storage, write history logic, define schedules, sandbox tools.

A host provides **a contract**. The pack declares its needs in `pack.yml`; the host enforces and provides them. The pack does not import the runtime's internals; the runtime reads the pack's manifest.

This matters because it lets aouo:

1. **Upgrade the runtime without breaking packs** — the ABI is a YAML contract, not a programming API
2. **Run packs of different authors side by side** — without trusting any of them with runtime internals
3. **Sandbox each pack** — the contract is what the runtime checks at every tool call
4. **Eventually distribute packs as binaries** — once the contract is stable, `.aouo` archives become installable across machines

That last one — the open `.aouo` format — is the long-term bet. It is only possible because of the host/app split.

## Implications for the user

A user does not install "aouo features." They install **packs**, the same way they install browser extensions or VS Code plugins. The user's experience is:

- "I want an English coach" → install `english-coach.aouo`
- "I want a journaling agent" → install `daily-journal.aouo`
- "I want to write content" → install `creator-studio.aouo`

Each pack runs in its own scope. None of them know about the others. The user gets three agents, not one assistant with three jobs.

## Related

- [Why Packs](/concepts/why-packs/) — what the pack boundary buys
- [Example Packs](/concepts/example-packs/) — three flagship pack shapes
- [The Desktop Direction](/concepts/desktop-direction/) — what the local client should feel like
- [Architecture](/concepts/architecture/) — runtime layout at the file level
