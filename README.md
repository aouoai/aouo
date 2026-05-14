# aouo

> **Vertical Agent App Platform** — install packs, not prompts.

> 🚧 **Status: pre-alpha** · API & Pack ABI may change without deprecation notice. Not yet recommended for shared / multi-tenant deployments. Public npm releases will start at `0.x-alpha` once the safety baseline (cost limits, credential hardening, pack permission enforcement) lands. Track progress in [todo/MVP-REMEDIATION.md](todo/MVP-REMEDIATION.md).

> **npm package name request:** `aouo` is the requested canonical npm package name for this open-source project, with `aouo` also remaining the CLI command. The package may still appear as `@aouo/agent` in pre-alpha source/workspace metadata during the transition.

[![CI](https://github.com/aouoai/aouo/actions/workflows/ci.yml/badge.svg)](https://github.com/aouoai/aouo/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)



aouo is an open-source runtime for building **vertical agent apps**: long-running AI companions that understand one domain deeply, keep durable state, run scheduled workflows, and improve through structured data feedback.

The unit of distribution is a **pack**. A pack is closer to an application than a prompt bundle: it contains skills, schema, memory templates, scheduled jobs, tools, permissions, and domain policy. Skills are the workflows inside that app.

This is intentionally different from coding agents such as OpenAI Codex. Codex helps developers read, edit, test, and ship code. aouo runs end-user vertical agents such as an English tutor, creator assistant, journaling companion, fitness coach, or finance reviewer.

## What is a Vertical Agent App?

A vertical agent app sits between generic agent frameworks and shallow AI wrappers:

| Layer                              | Examples                                        | Strength                                              | Limitation                                                      |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Generic Agent Framework            | LangGraph, CrewAI, Hermes                       | Flexible for any use case                             | You still build the product shell, state model, and domain loop |
| **Vertical Agent App (aouo pack)** | English tutor, creator assistant, fitness coach | Domain workflows + long-term memory + proactive loops | One focused domain per pack                                     |
| Shallow AI App                     | ChatGPT wrappers, prompt templates              | Quick to build                                        | No memory, no proactivity, no data loop                         |

### Five Pillars

Every serious vertical agent app should have all five:

1. **Long-term Memory** — User profile accumulated over months, not conversation history
2. **Proactive Outreach** — Cron-driven nudges ("it comes to you")
3. **Multi-Skill System** — Specialized workflows per domain
4. **Data Feedback Loop** — Activity -> DB -> analysis -> next session adapts
5. **Built-in Assessment** — Domain-native evaluation (e.g., CEFR levels for language)

## Architecture

```
┌─────────────────────────────────────────┐
│              User Channel               │
│      Telegram · Web · Discord · Email   │
└──────────────────┬──────────────────────┘
                   │ loads
         ┌─────────┼──────────┐
         │         │          │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │ english │ │ creator │ │ fitness │  ← Agent Apps (Packs)
    │  pack   │ │  pack   │ │  pack   │
    └────┬───┘ └───┬───┘ └───┬────┘
         │         │          │
         └─────────┼──────────┘
                   │ depends on
          ┌────────▼────────┐
          │      aouo        │  ← App OS
          │  Agent runtime  │
          │  Pack loader    │
          │  Persist layer  │
          │  Scheduler      │
          └─────────────────┘
```

## Quick Start

### Prerequisites

- **Node.js ≥ 22** (use `nvm use` — repo ships `.nvmrc`)
- **pnpm** (recommended)

### Install & Initialize

```bash
# Install the alpha CLI from npm.
pnpm add -g aouo@next

# Initialize data directory
aouo init

# Start the Telegram bot (after configuring credentials, see below)
aouo gateway start
```

For source development:

```bash
git clone https://github.com/aouoai/aouo.git
cd aouo
pnpm install
pnpm build
pnpm --filter @aouo/agent link --global
```

### Configuration

Edit `~/.aouo/config.json`:

```json
{
  "provider": {
    "backend": "gemini",
    "model": "gemini-2.5-flash"
  },
  "gemini": {
    "api_key": "paste-your-gemini-key-here"
  },
  "telegram": {
    "enabled": true,
    "bot_token": "YOUR_BOT_TOKEN",
    "allowed_user_ids": [123456789]
  }
}
```

### Install a Pack

Phase 1 supports local pack validation and linking.

```bash
# Validate and link the sample notes pack
aouo pack validate ./packs/notes
aouo pack link ./packs/notes
aouo pack list
```

`aouo install` is intentionally deferred until the Pack ABI is stable.

## Core Concepts

### Packs

A **Pack** is an installable vertical agent app.

- **App manifest**: identity, version, skills, schema, tools, cron, permissions, runtime requirements
- **Skills**: domain workflows the agent can load and execute
- **Schema**: pack-owned structured data
- **Memory**: pack-owned `USER.md` and `MEMORY.md` state
- **Tools**: optional code-backed capabilities exposed through the aouo tool interface
- **Cron**: proactive workflows such as reminders, reviews, and scheduled generation

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

### Skills

A skill is a workflow, not an app. It should describe how the agent performs a task: onboarding, daily practice, review, content generation, diagnosis, or aggregation.

Skills should not directly mutate databases or run arbitrary scripts. Durable data goes through `persist`, and long-term user state goes through `memory`.

### Persist

`persist` is the single write path for pack data. This keeps domain apps portable, auditable, and upgradeable.

Examples:

- An English tutor pack can store SRS records, EMA ability estimates, vocabulary attempts, pronunciation scores, and review due dates.
- A creator pack can ingest historical posts, update creator memory, store content ideas, schedule drafts, and track performance.
- A journaling pack can store daily entries, mood summaries, weekly themes, and long-term reflections.

Pack tools may compute rich results, but they should return structured data to the runtime instead of writing SQLite directly.

### Pack Runtime

The MVP runtime is **JavaScript/TypeScript first**:

- Pack tools declare a `ToolDefinition` and are loaded by the runtime.
- Tools receive structured input and return structured output.
- Tools use the aouo tool context instead of reaching into global state.
- Raw database writes are not part of the tool contract; use `persist`.

Python and other runtimes are future extension points. They should be exposed through an explicit external-tool protocol: declared command, JSON input, JSON output, dependency checks, permissions, and sandbox policy. They should not be hidden inside `SKILL.md` as arbitrary scripts.

### Pack ABI v1

The Pack ABI is the compatibility contract between a pack and the runtime:

| File / Field                 | Purpose                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `pack.yml`                   | Manifest: name, version, skills, schema, tools, cron, permissions, runtime requirements |
| `schema.sql` / `migrations/` | Pack-owned data model and additive migrations                                           |
| `skills/`                    | Workflow instructions and small attached resources                                      |
| `tools/`                     | Optional JS/TS tools exposed through `ToolDefinition`                                   |
| `templates/USER.md.tmpl`     | Initial stable user profile                                                             |
| `templates/MEMORY.md.tmpl`   | Initial evolving domain memory                                                          |
| `permissions`                | Declared access to files, network, platform accounts, cron, or external commands        |

The runtime should reject or warn on undeclared capabilities. A pack should be installable, inspectable, and reproducible.

### Packaging Roadmap

Pack distribution can evolve toward a dedicated package format:

1. **Local directory** — copy a pack into `~/.aouo/packs/<name>/`
2. **Pack validation/linking** — `aouo pack validate ./packs/x`, `aouo pack link ./packs/x`
3. **Local package** — `.aouo` archive with manifest, checksum, and dependency lock
4. **Registry** — signed packages, version compatibility, reviews, and upgrade flow
5. **Marketplace** — free and paid packs, licensing, entitlement checks, and revenue share

Packaging principles:

- package first, install second
- declare dependencies explicitly
- avoid arbitrary post-install scripts
- support platform-specific packages only when needed
- keep paid-pack enforcement in registry entitlements or cloud services, not fragile local DRM

### Tools

Core ships with built-in tools. Packs can register additional domain-specific tools.

| Tool         | Purpose                                                 |
| ------------ | ------------------------------------------------------- |
| `msg`        | Cross-platform message intents: text, media, buttons, quizzes, edits |
| `persist`    | Schema-aware data persistence (pack-scoped)             |
| `memory`     | Read/write pack-scoped USER.md and MEMORY.md            |
| `skill_view` | Load skill instructions into agent context              |
| `cron`       | Manage scheduled tasks                                  |
| `tts`        | Text-to-speech synthesis                                |
| `db`         | SQLite diagnostics (read-only for pack DBs)             |
| `file`       | Sandboxed file read/write                               |
| `web_search` | Internet search                                         |
| `clarify`    | Ask user for clarification                              |

## Why Not Just a Skills Collection?

A skills collection gives an agent instructions. A vertical agent app also defines state, data, schedules, permissions, tools, and upgrade behavior.

For example, an English tutor is not just a set of prompts:

- onboarding estimates the learner's current level
- practice sessions write attempts through `persist`
- SRS schedules due words through SQL-backed state
- EMA updates ability estimates over time
- weekly aggregation updates `MEMORY.md`
- cron triggers review sessions proactively

That complete loop is the product. Skills are only one part of it.

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

## References

- [OpenAI Codex docs](https://platform.openai.com/docs/codex)

## License

[Apache License 2.0](LICENSE)

---

**aouo** is built by [aouoai](https://github.com/aouoai). Website: [aouo.ai](https://aouo.ai)
