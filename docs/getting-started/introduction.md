# What is aouo?

**aouo** is an open-source runtime for building **vertical agent apps** — long-running AI agents that deeply understand one domain, keep durable state, and improve through structured feedback loops.

Unlike general-purpose chatbots, a vertical agent app has:

- **Long-term memory** that persists across weeks and months
- **Proactive outreach** via scheduled nudges and cron-driven sessions
- **Deep skill coverage** — 8–30 specialized skills per domain, not one generic prompt
- **A data closed-loop** where every interaction feeds back into the user profile
- **Built-in assessment** with onboarding diagnostics and periodic aggregation

## The OS Metaphor

Think of aouo as an operating system for AI agents:

| OS Concept | aouo Equivalent |
|------------|-----------------|
| Kernel | `aouo` core — ReAct loop, tool system, session management |
| App | **Pack** — a vertical agent app for a specific domain |
| File System | `~/.aouo/` — local data, config, pack storage |
| Syscall | `persist` · `memory` · `cron` · `skill_view` |
| Home Dir | `SOUL.md` · `RULES.md` · `USER.md` · `MEMORY.md` |
| App Store | Future registry for signed `.aouo` packs |

## Who is this for?

- **Builders** who want to create vertical agent apps for specific domains
- **Solo developers** who want a Telegram-first agent with real persistence and scheduling
- **Teams** evaluating vertical AI architectures beyond prompt-and-pray

## Next Steps

- [Quick Start](/getting-started/quickstart) — Install and run your first agent
- [Architecture](/concepts/architecture) — How the system works under the hood
- [Build a Pack](/build-a-pack/first-pack) — Create your own vertical agent app
