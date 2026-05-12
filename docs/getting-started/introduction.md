# What is aouo?

**aouo** is an open-source runtime for building **Domain Companions** — AI agents that deeply understand a single vertical domain and grow with the user over time.

Unlike general-purpose chatbots, a Domain Companion has:

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
| App | **Pack** — a skill bundle for a specific domain |
| File System | `~/.aouo/` — local data, config, pack storage |
| Syscall | `persist` · `memory` · `cron` · `skill_view` |
| Home Dir | `SOUL.md` · `RULES.md` · `USER.md` · `MEMORY.md` |
| App Store | `aouo install github.com/author/pack` |

## Who is this for?

- **Builders** who want to create AI companions for specific domains
- **Solo developers** who want a Telegram-first agent with real persistence and scheduling
- **Teams** evaluating vertical AI architectures beyond prompt-and-pray

## Next Steps

- [Quick Start](/getting-started/quickstart) — Install and run your first agent
- [Architecture](/concepts/architecture) — How the system works under the hood
- [Build a Pack](/build-a-pack/first-pack) — Create your own Domain Companion
