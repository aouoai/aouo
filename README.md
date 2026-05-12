# aouo

> **Domain Companion agent runtime** — install packs, not plugins.

[![CI](https://github.com/aouoai/aouo/actions/workflows/ci.yml/badge.svg)](https://github.com/aouoai/aouo/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@aouo/core)](https://www.npmjs.com/package/@aouo/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)

aouo is an open-source agent runtime for building **Domain Companions** — long-term AI agents that deeply understand a single vertical domain. Unlike generic agent frameworks or shallow AI wrappers, a Domain Companion combines persistent memory, proactive outreach, multi-skill workflows, data-driven feedback loops, and built-in assessments into a coherent experience.

## What is a Domain Companion?

A Domain Companion sits between generic agent frameworks and shallow AI apps:

| Layer | Examples | Strength | Limitation |
|---|---|---|---|
| Generic Agent Framework | LangGraph, CrewAI, Hermes | Flexible for any use case | No domain depth |
| **Domain Companion (aouo)** | English coach, fitness tracker, finance manager | Deep vertical expertise + long-term memory | One domain per pack |
| Shallow AI App | ChatGPT wrappers, prompt templates | Quick to build | No memory, no proactivity, no data loop |

### Five Pillars

Every Domain Companion must have all five:

1. **Long-term Memory** — User profile accumulated over months, not conversation history
2. **Proactive Outreach** — Cron-driven nudges ("it comes to you")
3. **Multi-Skill System** — 10+ specialized skills per domain
4. **Data Feedback Loop** — Practice → DB → weakness analysis → next session adapts
5. **Built-in Assessment** — Domain-native evaluation (e.g., CEFR levels for language)

## Architecture

```
┌─────────────────────────────────────────┐
│            Your Application             │
│        (Telegram bot instance)          │
└──────────────────┬──────────────────────┘
                   │ loads
         ┌─────────┼──────────┐
         │         │          │
    ┌────▼───┐ ┌───▼───┐ ┌───▼────┐
    │ english│ │ ielts │ │fitness │  ← Domain Packs
    │  pack  │ │  pack │ │  pack  │
    └────┬───┘ └───┬───┘ └───┬────┘
         │         │          │
         └─────────┼──────────┘
                   │ depends on
          ┌────────▼────────┐
          │   @aouo/core    │  ← Zero business logic
          │  Agent runtime  │
          │  + Pack loader  │
          │  + Tool system  │
          └─────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js ≥ 22** (uses experimental `node:sqlite`)
- **pnpm** (recommended)

### Install & Initialize

```bash
# Install globally
pnpm add -g @aouo/core

# Initialize data directory
aouo init

# Start the Telegram bot
aouo gateway start
```

### Configuration

Edit `~/.aouo/config.json`:

```json
{
  "provider": {
    "backend": "gemini",
    "model": "gemini-2.5-flash"
  },
  "telegram": {
    "enabled": true,
    "bot_token": "YOUR_BOT_TOKEN",
    "allowed_user_ids": [123456789]
  }
}
```

### Install a Pack

```bash
# Install a domain pack
pnpm add @aouo/english

# Or drop a pack directory into ~/.aouo/packs/
```

## Core Concepts

### Packs

A **Pack** is a Skill Bundle + Plugin hybrid:

- **Skill Bundle**: N skill files (SKILL.md) that users interact with
- **Plugin**: Extends the runtime with custom tools, DB schema, cron jobs, memory files, and i18n

```
@aouo/english/
├── pack.yml              ← Manifest
├── menu.json             ← Fast-path UI (zero LLM cost)
├── schema.sql            ← Domain DB tables
├── templates/
│   ├── USER.md.tmpl      ← Initial user profile
│   └── MEMORY.md.tmpl    ← Initial learner state
├── skills/
│   ├── onboarding/       ← Required: first-run assessment
│   ├── aggregator/       ← Required: periodic profile snapshot
│   └── ...               ← Domain-specific skills
├── tools/                ← Custom tools (e.g., pronunciation scorer)
└── i18n/
    └── zh-CN.json
```

### Tools

Core ships with 10 built-in tools. Packs can register additional domain-specific tools.

| Tool | Purpose |
|---|---|
| `tg_msg` | Rich Telegram messages (keyboard, quiz, edit, paginate) |
| `persist` | Schema-aware data persistence (pack-scoped) |
| `memory` | Read/write pack-scoped USER.md and MEMORY.md |
| `skill_view` | Load skill instructions into agent context |
| `cron` | Manage scheduled tasks |
| `tts` | Text-to-speech synthesis |
| `db` | SQLite diagnostics (read-only for pack DBs) |
| `file` | Sandboxed file read/write |
| `web_search` | Internet search |
| `clarify` | Ask user for clarification |

## Development

```bash
git clone https://github.com/aouoai/aouo.git
cd aouo
pnpm install
pnpm dev          # Watch mode
pnpm test         # Run tests
pnpm typecheck    # Type checking
pnpm lint         # Linting
pnpm build        # Production build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

[Apache License 2.0](LICENSE)

---

**aouo** is built by [aouoai](https://github.com/aouoai). Website: [aouo.ai](https://aouo.ai)
