# AOUO

> **Local-first agent apps, packaged as `.aouo` packs.**
>
> A pack is more than a prompt or a folder of skills. It is an installable AI app with its own skills, durable storage, memory, schedules, tools, permissions, and UI surface.

[![CI](https://github.com/aouoai/aouo/actions/workflows/ci.yml/badge.svg)](https://github.com/aouoai/aouo/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

> **Status: pre-alpha.** The runtime exists, the pack ABI is moving, and the product shape is still being narrowed. This README explains the direction, not a stable product contract.

---

## The Idea

Most AI products today start from a chat box.

That works for general assistance, but it is a weak shape for long-running, domain-specific work. A useful agent does not only need a system prompt. It needs state. It needs schedules. It needs tools. It needs permissions. It needs a way to store structured data. It needs a way to be installed, inspected, upgraded, shared, and deleted.

**aouo is an attempt to define that missing app layer.**

The unit is the **pack**: a local-first agent app bundle. A pack can be an English tutor, a writing assistant, a journaling companion, a research workflow, a content pipeline, or any other narrow agent that should remember things over time and run proactively.

---

## The Host Model

aouo has three moving parts:

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

The closest analogy is not "one chatbot with many prompts." It is closer to:

```text
VS Code  -> extensions
Obsidian -> plugins
Raycast  -> extensions
Docker   -> containers

aouo    -> .aouo packs
```

The runtime is the host. The pack is the app.

---

## Why Packs

General assistants are powerful, but they are broad. They carry too much context, expose too many tools, and often rely on vague natural-language memory. Skill systems hit the same wall once a user has installed dozens of them — every turn becomes a routing problem.

A pack gives the runtime a hard boundary. When the user opens the `create` pack, the model sees the `create` app: its skills, its memory, its storage contract, its schedules, its recent state. It does not also reason about vocabulary drills, journaling, PDF conversion, and every other skill installed on the machine.

| Problem                        | Pack answer                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| Too many skills in context     | Load only the active pack, lazy-load the selected skill         |
| Long-term memory becomes vague | Structured tables, not only prose                               |
| Agents only react to messages  | Packs declare schedules and triggers                            |
| Sharing means copying prompts  | Share an app bundle with storage, permissions, and tests        |
| Tools become unsafe or opaque  | Declare permissions at the pack level                           |
| Small models get confused      | Narrow the decision space so cheaper models can do focused work |

The goal is not to beat ChatGPT, Claude, or Codex at raw model ability. The goal is to give AI work a better application boundary.

---

## Example Packs

Three useful early pack shapes:

| Pack               | One-line scenario                                                              | Long-term system it manages                                                                                    |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **English Coach**  | "Remember what I got wrong last week and quiz me on it this morning."          | Daily missions, writing/speaking feedback, extracted vocabulary, mistake patterns, SRS review, weekly progress |
| **Creator Studio** | "Capture this link, draft three angles for it, slot the best one on Thursday." | Source library, idea queue, drafts, assets, brand voice, publishing calendar, exports                          |
| **Daily Journal**  | "Two weeks of notes — what kept coming up?"                                    | Daily notes, goals, mood tags, weekly reviews, recurring patterns, action items                                |

The product should be judged by whether one of these packs keeps a real user coming back for weeks, not by whether the platform sounds broad.

---

## What Exists Today

The current repo is a pre-alpha implementation of the runtime idea. It already contains:

- a pack loader and manifest validator
- pack-scoped SQLite databases
- pack-scoped memory files
- a ReAct-style agent runtime
- provider integrations
- a scheduler for proactive pack runs
- a Telegram channel adapter
- a local dashboard for configuration and inspection
- sample packs for notes, content creation, and vocabulary learning

These pieces prove the runtime shape. They are not the final product surface. The next step is to make local usage feel first-class: pack selection, chat, memory, database, schedules, permissions, and status in one coherent client.

---

## What A Pack Contains

A `.aouo` pack starts small. The minimum is two files:

```text
simple-pack/
├── pack.yml
└── skills/
    └── main/SKILL.md
```

The runtime still gives that pack durable memory, conversation history, settings, artifacts, and a generic record store. No SQL file is required to begin.

A fuller stateful pack adds structure only when useful:

```text
english-coach.aouo/
├── pack.yml
├── skills/{daily-mission, writing-feedback, weekly-report}/
├── memory/{soul.md, user.md, state.md}
├── schema.sql
├── migrations/
├── tools/
└── evals/
```

`memory/` is semantic state, not a grab bag: **soul.md** (who this app is), **user.md** (who the user is inside this app), **state.md** (what the app currently knows). Wiring lives in `pack.yml`:

```yaml
name: english-coach
skills:
  - daily_mission
  - writing_feedback
memory:
  soul: ./memory/soul.md
cron:
  - { id: daily_practice, schedule: '0 8 * * *', skill: daily_mission }
permissions:
  tools: [persist, db]
context:
  skill_loading: lazy
```

Full manifest fields, storage levels, persist contract, and skill authoring are in the docs:

- [Pack Spec](https://aouo.ai/concepts/pack-spec/) — manifest fields
- [Manifest](https://aouo.ai/build-a-pack/manifest/) — `pack.yml` reference
- [Schema & Persist](https://aouo.ai/build-a-pack/schema/) — storage levels and the persist contract
- [Skills](https://aouo.ai/build-a-pack/skills/) — `SKILL.md` format

---

## Context Compiler

Context is not only an implementation detail. It is a product feature.

Token cost is not only a billing problem. It is an attention problem. When the model has every installed skill, every tool, and every memory file in scope, part of every turn is spent deciding what to ignore — that makes small models worse and large models more expensive.

aouo compiles the smallest useful context for the current app, mode, task, permission set, and token budget. Pack scoping typically cuts routing context by **3–5×** vs a flat skill bag — the exact ratio depends on skill size, but the shape is consistent.

The runtime loads context in layers, cheapest first:

| Layer           | Loaded when                             |
| --------------- | --------------------------------------- |
| Pack card       | Routing between installed packs         |
| Skill cards     | After a pack is selected                |
| Full skill body | Only when a skill is selected or routed |
| DB rows         | Pulled by the active workflow           |
| Memory excerpts | Pulled by policy, not pasted wholesale  |

See [Context Compiler](https://aouo.ai/concepts/context-compiler/) for the full policy model, the quota gate, and runtime enforcement.

---

## The Desktop Direction

The natural primary surface is a local desktop client. Provider setup, pack configuration, memory editing, database inspection, cron debugging, permission review, and pack building all belong here. Chat channels can be added later as optional adapters; they should not be the first product surface.

The picture in our head:

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

The chat input should support several control levels: natural language routing, `/skill` precise invocation, UI button workflow trigger, and scheduled or event-driven execution. The user should not have to make the model guess everything — if they know they want `/writing_feedback` or `/weekly_report`, the app should let them say so directly.

The runtime stays usable headlessly, but the main user experience should feel like opening apps, not operating a bot.

---

## The Builder Direction

One long-term goal is a **pack builder**: the user describes what they want — "a personal content agent that collects links, summarizes them, asks me for angles, drafts posts, keeps a calendar" — and the builder composes a pack from reusable pieces: skills, tools, memory defaults, optional schema, cron, permissions, evals.

This is not random skill mixing. Each skill declares a typed contract — inputs, outputs, reads, writes, required tools, evals, estimated context — so the builder can compile a narrow, coherent app instead of dumping every available capability into the model.

That is a major product bet: **AI-assisted app assembly for people who do not want to design storage, workflows, memory, and schedules manually.**

---

## Sharing, Trust, and Safety

Two artifacts, intentionally separated:

| Artifact                | Contains                                                                              | Share?                            |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------- |
| `pack-name.aouo`        | App source: manifest, skills, memory defaults, schema, persist contract, tools, evals | Yes                               |
| `pack-name.backup.aouo` | User data: memory, DB rows, history, schedule state                                   | Privately only, ideally encrypted |

Permissions are declared in `pack.yml` and shown to the user on install and on every upgrade — new tools, new schedules, new network domains, new file scopes, schema migrations, changed skills. Silent permission escalation is the failure mode this model exists to prevent.

Every action is audited: token spend, tool calls, persist writes, cron firings, network calls. Packs should also ship evals so a third-party upgrade can be regression-checked before being trusted.

Full permission model, sandbox boundaries, signing plans, lifecycle, and audit details: see [Security & Trust](https://aouo.ai/concepts/security/).

---

## What Makes This Different

| Compared with       | aouo is different because                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Claude    | Each pack is its own app with its own storage, memory, schedule, permissions, and UI — not one broad conversation |
| Codex / Claude Code | Codex is for codebases; aouo is for end-user vertical agent apps (learning, writing, journaling, research, ops)   |
| MCP                 | MCP connects models to tools and data; `.aouo` packages a stateful app one layer above it                         |
| Skill bags          | Skills are components; packs are bounded apps with state, schedules, permissions, and evals                       |

The difference is not "local ChatGPT." The difference is **installable, stateful AI apps**.

---

## Roadmap

**Near-term**

- Make the local dashboard a real pack workspace, not only a settings UI
- Local pack chat so packs run without external chat-channel setup
- Expose pack memory, database, schedules, logs, and permissions in one place
- Skill picker and workflow buttons for deterministic pack actions
- Pack import/export

**Mid-term**

- Package the local workspace as a desktop client
- Sharpen one flagship pack (English Coach or Creator Studio) until it proves recurring use
- The first useful `.aouo` archive flow
- A pack builder that assembles skills, memory, storage, persist rules, cron, tools, and evals
- Per-pack context budgeting visible and tunable
- Pack-level tests and validation as a publishing requirement

**Long-term**

- `.aouo` as a practical open format for stateful agent apps
- Sharing, forking, auditing, and upgrading packs safely
- Keep the adapter boundary clean so external channels can be added later if they prove useful
- Small, focused models made useful through tight app boundaries

---

## Design Principles

| Principle              | Meaning                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| App, not prompt        | A pack is an app bundle, not a prompt file                                              |
| State, not just memory | Packs have durable default storage and can grow into typed tables                       |
| Boundary, not sprawl   | Each pack owns its context, skills, tools, data, and permissions                        |
| Local-first            | Users own their pack state and can inspect or move it                                   |
| Portable               | Packs and state are installable, exportable, forkable, shareable                        |
| Safe by default        | Tools, scripts, files, network, cron, and secrets are permissioned and audited          |
| UI matters             | Chat is an entry point, not the whole app                                               |
| Compatible             | Packs can use MCP, model providers, and local tools without becoming a closed ecosystem |
| Evaluable              | Packs ship tests and improve without breaking behavior                                  |
| Focused context        | Every model call loads only what the current task needs                                 |

---

## What This Is Not

aouo is not a prompt marketplace. Prompts are only one part of a pack.

aouo is not a generic LLM framework. Frameworks provide primitives; aouo defines an app boundary.

aouo is not trying to replace Codex or Claude Code. Coding agents are for software work. aouo is for user-facing vertical agent apps.

aouo is not trying to replace MCP. MCP is a useful connectivity layer; aouo is an app host and package boundary.

aouo is not trying to make one universal assistant that knows everything. It is trying to make many small agents that each know one domain well, keep their own state, and stay out of each other's context.

---

## Project Links

- Docs: [aouo.ai](https://aouo.ai)
- Source: [github.com/aouoai/aouo](https://github.com/aouoai/aouo)
- Package: [`@aouo/agent`](https://www.npmjs.com/package/@aouo/agent)
- License: [Apache-2.0](LICENSE)
