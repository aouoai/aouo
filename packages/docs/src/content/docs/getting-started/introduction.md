---
title: What is aouo?
description: An app format for stateful AI agents — local-first, pack-scoped, with their own database, memory, schedules, tools, permissions, and UI surface.
---

**aouo** is an attempt to define the missing app layer for AI.

Most AI products today start from a chat box. That works for general assistance, but it is a weak shape for long-running, domain-specific work. A useful agent needs more than a system prompt. It needs state, schedules, tools, permissions, structured storage, and a way to be installed, inspected, upgraded, shared, and deleted.

The unit aouo defines is the **pack**: a local-first agent app bundle.

```text
pack = skills + storage + memory + schedule + permissions + UI surface
```

A pack can be an English tutor, a writing assistant, a journaling companion, a research workflow, a content pipeline, or any other narrow agent that should remember things over time and run proactively.

## The Host Model

aouo has three parts. They are intentionally separate.

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

The runtime is the host. The pack is the app. The dashboard is where the two meet the user.

→ Read more in [The Host Model](/concepts/host-model/).

## What this is for

A pack is judged by whether a real user keeps coming back to it for weeks. Three concrete pack shapes the format is designed to support:

| Pack | One-line scenario |
| --- | --- |
| **English Coach** | "Remember what I got wrong last week and quiz me on it this morning." |
| **Creator Studio** | "Capture this link, draft three angles for it, slot the best one on Thursday." |
| **Daily Journal** | "Two weeks of notes — what kept coming up?" |

Each one has its own database, memory, cron schedule, skills, and permission scope. The runtime keeps them out of each other's heads.

→ See [Example Packs](/concepts/example-packs/) for these in depth.

## Why "pack" and not "skill" or "GPT"

Generalist assistants, Custom GPTs, and flat skill libraries all hit the same wall: as the agent gets more capable, its context gets more polluted, its memory gets vaguer, and the user loses control of what it knows.

A pack draws a hard boundary at the runtime level:

- **Conversation routing** scopes every turn to one active pack
- **Skills are namespaced** by qualified name (`<pack>:<skill>`)
- **Session keys** mint a fresh history when the user switches pack
- **Tool calls** carry the active pack so the wrong pack literally cannot write to the right pack's tables

This is what makes "installable AI apps" different from "one assistant with knowledge files."

→ Read more in [Why Packs](/concepts/why-packs/).

## What ships today

The current repo is a pre-alpha implementation of the runtime idea. It already contains:

- a pack loader and manifest validator
- pack-scoped SQLite databases
- pack-scoped memory files (`soul.md` / `user.md` / `state.md`)
- a ReAct-style agent runtime with quota gates and context compression
- provider integrations (Gemini, OpenAI, DeepSeek, Codex OAuth)
- a scheduler for proactive pack runs (cron)
- a Telegram channel adapter (voice, photo, document, streaming edits, forum topics)
- a local dashboard for configuration and inspection
- sample packs in `apps/` for notes, content creation, and vocabulary learning

These pieces prove the runtime shape. They are not the final product surface — the next step is to make local usage feel first-class.

## Where the product is going

```text
near-term
  Expand the local dashboard into a real pack workspace
  (memory editor, DB browser, schedule panel, permission inspector)
  Local pack chat — no Telegram bot required
  Pack import / export

mid-term
  Package the local workspace as a desktop client
  Sharpen one flagship pack until it proves recurring use
  Pack builder — assemble packs from a natural-language brief
  Per-pack context budgeting visible and tunable

long-term
  .aouo as an open format for stateful agent apps
  Sharing, forking, auditing, upgrading packs safely
  More channel adapters as optional remotes (Discord, Slack)
```

→ Read more in [The Desktop Direction](/concepts/desktop-direction/) and [The Builder Direction](/concepts/builder-direction/).

## Read next

If you're orienting:

- [The Host Model](/concepts/host-model/) — runtime / desktop / pack split
- [Why Packs](/concepts/why-packs/) — what the pack boundary buys
- [Example Packs](/concepts/example-packs/) — three flagship pack shapes
- [Context Compiler](/concepts/context-compiler/) — how pack scope translates to smaller prompts
- [Security & Trust](/concepts/security/) — permissions, audit, sharing

If you want to build a pack:

- [Your First Pack](/build-a-pack/first-pack/) — tutorial
- [Pack Spec](/concepts/pack-spec/) — manifest fields
- [Schema & Persist](/build-a-pack/schema/) — storage levels and persist contract
- [Skills](/build-a-pack/skills/) — `SKILL.md` format

If you want to run the runtime today, it ships on npm as [`@aouo/agent`](https://www.npmjs.com/package/@aouo/agent) — see the package README for install + CLI details.
