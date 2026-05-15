---
title: The Desktop Direction
description: Why the primary surface should be a local desktop client, what it has to expose, and where chat channels fit (hint — they're optional adapters, not the product).
---

The first real version of aouo lives on the user's machine, in a window of its own.

Chat-channel adapters exist (Telegram is the only one shipped today). They are useful as remote controls — mobile notifications, quick replies on the go. They are wrong as the primary surface. A bot in a chat window cannot show the user their pack's database, edit memory, review permission diffs, or debug a cron job.

This page describes where the product is going and why.

## The picture in our head

```text
┌─────────────────────────────────────────────────────────────┐
│ aouo                                              ⚙ settings │
├──────────────┬──────────────────────────────────────────────┤
│ 📦 notes     │  english-coach — Daily Mission                │
│ 📚 english ◀ │   ────────────────────────────────────────    │
│ ✍️  create   │   Yesterday you confused "affect / effect" in │
│              │   three places. Try this:                     │
│              │                                                │
│              │   > Rewrite using the right one:              │
│              │   > Her ____ on the team is obvious.          │
│              │                                                │
│              │   ⏱ 9:00am cron · 📁 12 review items due       │
│              │                                                │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │ /writing_feedback                       │  │
│              │  └─────────────────────────────────────────┘  │
├──────────────┴──────────────────────────────────────────────┤
│ chat · memory · db · cron · permissions · logs              │
└─────────────────────────────────────────────────────────────┘
```

Pack sidebar on the left. Active pack's chat (or active surface) in the center. Tabs along the bottom for the structural views: memory, database, schedule, permissions, logs.

The user does not enter `/memory_edit` as a command. They click **memory** and edit a file.

## Why local desktop, not web

This is a deliberate choice with consequences.

| Surface | Why it works | Why it fails for aouo |
| --- | --- | --- |
| Web app | Easy to ship, easy to share | User data lives on a server; pack state is no longer "yours" |
| Mobile app | Always available | Cannot inspect a SQLite DB; cannot edit a memory file; small screen for management UI |
| Chat bot | Familiar shape | Cannot show structured data; cannot diff permissions; cannot edit memory |
| **Local desktop** | Owns its data; can show anything | Distribution is harder, no instant cloud-everywhere |

The last row is the trade we are choosing. Local-first means the user's pack data lives on their machine — pack databases, memory files, conversation history, schedule state, logs, credentials. Sharing happens by exporting an archive, not by trusting a hosted service.

For aouo specifically, the inspectability matters more than convenience. If a pack thinks something wrong about the user, the user should open the memory file and fix it. That is not possible without a local surface.

## What the dashboard has to expose

The current local dashboard (`aouo ui start`, `127.0.0.1:9800`) is the ancestor of this. It is a settings UI today. The desktop direction expands it into a real pack workspace.

| Surface | What the user does |
| --- | --- |
| Pack sidebar | Switch active pack; install / fork / archive |
| Chat | Talk to the active pack; see streamed responses; inline tool calls |
| Memory editor | View and edit `soul.md`, `user.md`, `state.md` for the active pack |
| Database browser | Run scoped SQL queries against the pack's DB; see schema; export rows |
| Schedule panel | List cron jobs; next firing; last result; enable/disable individual jobs |
| Permission inspector | Show declared permissions; show actual usage; permission diffs at upgrade time |
| Logs | Token spend per turn, tool calls, errors, network calls, all redacted-safe |
| Pack builder (future) | Compose a pack from a natural-language brief — see [Builder Direction](/concepts/builder-direction/) |

These are not separate apps. They are tabs in one window, all scoped to the active pack.

## Control levels in the chat input

The chat box is the entry point, but not the only way to drive the pack. The desktop should support multiple control levels:

```text
natural language routing
/skill precise invocation
UI button precise workflow trigger
scheduled or event-driven execution
```

The user should not have to make the model guess everything. If they know they want `/writing_feedback`, `/weekly_report`, `/review_due`, `/export_pdf`, or `/generate_image`, the app should let them say so directly. The agent is for the messy cases; the slash menu is for the cases the user already knows.

This is the same shape that worked for Linear, Raycast, Slack, and every other power-user-friendly chat surface. Pure NL is not strictly better than a verb that the user can type by memory.

## Channels as optional adapters

Telegram, Discord, Slack, and other chat channels are useful. They are wrong as the primary surface but right as a remote control. The mental model:

```text
The desktop is the product.
A channel is a tunnel into the product from somewhere else.
```

A user on the train can reply to their pack via Telegram. The reply still flows through the same runtime, against the same pack, into the same SQLite tables. The chat channel does not get to decide what a pack is.

In code, this is enforced by the [`Adapter`](/internals/telegram-adapter/) interface — every channel implements it, capability flags declare what message shapes it supports, and the runtime degrades gracefully when a capability is missing.

The Telegram adapter exists today. Discord and other adapters are not built but the boundary is clean enough to add them without rewriting the runtime.

## What ships today vs what's coming

**Today (pre-alpha)**

- Local dashboard at `127.0.0.1:9800` — config + inspection only
- Pack DB inspection — via SQLite CLI; not yet in the dashboard UI
- Memory editing — `~/.aouo/data/packs/<pack>/{USER,MEMORY}.md` edited as files
- Telegram adapter — fully functional, including forum topics, streaming, voice/photo/document I/O
- Cron scheduler — runs proactive pack jobs

**Coming**

- Expand the dashboard into a real pack workspace (memory editor, DB browser, schedule panel, permission inspector)
- Local pack chat so packs run without a Telegram bot
- Skill picker and workflow buttons in the chat input
- Package the local workspace as an Electron (or Tauri) desktop client
- Permission diffs on pack install/upgrade

The dashboard expansion is the next step. The desktop client wrapper comes after.

## Why this order matters

A common mistake would be: build the Electron shell first, then figure out what to put in it. We are choosing the opposite. The features go in the local dashboard first because the dashboard is already running locally over HTTP. Once the dashboard is a real pack workspace, wrapping it as a desktop app is mechanical.

This also keeps the runtime usable headlessly. Someone who wants to embed `@aouo/agent` into a different surface (a custom Electron app, a Tauri app, a server-side automation) gets the same engine; only the UI changes.

## Related

- [Host Model](/concepts/host-model/) — runtime / desktop / pack split
- [Builder Direction](/concepts/builder-direction/) — pack composition surface
- [Telegram Adapter](/internals/telegram-adapter/) — the existing channel adapter
