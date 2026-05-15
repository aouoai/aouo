---
title: Why Packs
description: Why "installable AI app" is a better unit than chat box, custom GPT, or skill folder — and what hard pack boundaries buy you that flat skill bags can't.
---

A pack is not a prompt. It is not a memory file. It is not a folder of skills. It is the **app boundary** for AI work that needs to persist, schedule, and stay scoped.

This page explains why that boundary matters — what specifically breaks without it, and what becomes possible once it exists.

## The starting point: every chat box hits a wall

General assistants are powerful but broad. They carry too much context, expose too many tools, and lean on vague natural-language memory. That works for one-off questions. It does not work for the agent you want to talk to every morning for six months.

Skill systems try to solve this with a flat library. The user installs 30 skills; every turn becomes a routing problem.

| What goes wrong | Where it shows up |
| --- | --- |
| Routing cost grows linearly | Every turn pays to decide which skill matters |
| Memory pollution | Tutoring notes leak into journaling, journaling leaks into draft writing |
| No durable state | "Remember my level" lives in prose, gets rewritten by the next summary |
| No scheduling scope | A cron job either fires for everything or nothing |
| Sharing means copy-paste | A "skill" the user likes can't be installed with its memory, schedule, and permissions |
| Permissions are global | One skill's filesystem scope is every skill's filesystem scope |

The flat-library shape ages badly. The more useful skills you collect, the worse each individual turn gets.

## What a pack boundary gives you

A pack draws a hard line around six things at once:

```text
pack = skills + storage + memory + schedule + permissions + UI surface
```

When the user opens the `create` pack, the model sees the `create` app: its skills, its memory, its storage contract, its schedules, its recent state. It does not also reason about vocabulary drills, journaling, PDF conversion, and every other skill on the machine.

| Problem | Pack answer |
| --- | --- |
| Too many skills in context | Load only the active pack, lazy-load the selected skill |
| Long-term memory becomes vague | Structured tables, not only prose |
| Agents only react to messages | Packs declare schedules and triggers |
| Sharing means copying prompts | Share an app bundle with storage, permissions, and tests |
| Tools become unsafe or opaque | Declare permissions at the pack level |
| Small models get confused | Narrow the decision space so cheaper models can do focused work |

This is the same shape that made VS Code extensions, Obsidian plugins, and Raycast extensions work: the host runs the app; the app owns its own state.

## Versus ChatGPT memory and Custom GPTs

ChatGPT memory and Custom GPTs are real attempts at the same problem. They are not pack equivalents.

| | ChatGPT Custom GPT | aouo pack |
| --- | --- | --- |
| Memory | Hosted, opaque, vague | Local files + structured tables, fully inspectable |
| State | Conversation history | Typed SQLite rows behind a persist contract |
| Schedules | None | Per-pack cron with permission scope |
| Permissions | Per-account, not per-app | Per-pack — sandboxed file/network/tool scopes |
| Sharing | Share a link to a Custom GPT | Ship a `.aouo` archive with skills, schema, tests |
| Forking | Not supported | A pack is a directory; fork it |
| Boundary | "One assistant with knowledge files" | "Many small apps, each owns its own state" |

The point isn't that Custom GPTs are bad. They are good for what they are: shareable prompt + knowledge-file bundles inside one provider's service. They are not stateful local-first apps you can audit, fork, and run alongside thirty others without context bleed.

## Why "boundary" is a runtime feature

A boundary is not a comment in the manifest. It is enforced at runtime:

- **Conversation routing** — every turn carries an active pack; tool calls receive a `ToolContext.pack` field; the wrong pack literally cannot write to the right pack's tables.
- **Skill resolution** — skills are qualified `<pack>:<name>`. Two packs can ship `onboarding` without colliding; bare names resolve via the active pack first.
- **Session keys** — switching pack mints a new session. The old pack's history is unreachable from the new session and recoverable if you switch back.
- **Quota gates** — daily and per-session caps are checked before the LLM is called, not after.

See [Pack Routing](/internals/pack-routing/) for the identity model and [Context Compiler](/concepts/context-compiler/) for how scope translates into smaller prompts.

## The product bet

A useful pack is the unit a user keeps coming back to. The pack format makes that possible by:

1. Letting state outlive the conversation
2. Letting work happen without a prompt (cron)
3. Letting one pack stay narrow while another runs alongside it
4. Letting the user inspect, audit, and fork

Without those four, every agent product eventually becomes "a smarter chat box," and the user keeps starting from zero.

## Related

- [The Host Model](/concepts/host-model/) — runtime / desktop / pack split
- [Example Packs](/concepts/example-packs/) — three flagship pack shapes in depth
- [Context Compiler](/concepts/context-compiler/) — how pack scope translates into smaller prompts
- [Security & Trust](/concepts/security/) — permission diffs, audit, sharing
