# @aouo/agent

> The runtime + CLI for **aouo packs** — AI-native apps with their own database, memory, schedule, skills, and permissions.

[![npm](https://img.shields.io/npm/v/@aouo/agent.svg)](https://www.npmjs.com/package/@aouo/agent)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](../../LICENSE)

`@aouo/agent` ships the `aouo` CLI and the agent runtime. It loads **packs** — installable AI apps whose state, schedule, and behavior live as plain files on your machine — and runs them on chat channels.

The shipped adapter is Telegram. The agent loop and pack ABI are channel-agnostic. For the project vision and what a pack is, see the [root README](https://github.com/aouoai/aouo#readme).

> **Status: pre-alpha.** APIs, CLI commands, and Pack ABI may change before 1.0. Not yet recommended for shared / multi-tenant deployments.

## What a pack contains

| File | Role |
| --- | --- |
| `pack.yml` | Manifest: identity, version, declared tools, cron defaults, permissions |
| `schema.sql` | Pack-owned SQLite tables — structured state, not bulleted memory |
| `skills/<name>/SKILL.md` | One workflow per skill, loaded on demand |
| `templates/USER.md.tmpl` | Initial stable user profile |
| `templates/MEMORY.md.tmpl` | Initial evolving state the agent maintains |
| `i18n/<locale>.json` | Optional localization for fast-path menus |

Three sample packs ship in the repo under [`apps/`](https://github.com/aouoai/aouo/tree/main/apps): `notes` (journaling), `create` (social drafting), `vocab` (CEFR placement + spaced repetition).

---

## Install

Requires **Node.js ≥ 22**.

```sh
npm install -g @aouo/agent@next
# or
pnpm add -g @aouo/agent@next
```

The CLI is `aouo` (short for the project name).

---

## Quick start

```sh
aouo init                         # create ~/.aouo/ with SOUL.md, RULES.md, config.json
aouo doctor                       # check Node, DB, network, provider key, Telegram token
aouo config                       # interactive: pick provider, set Telegram token, etc.
aouo pack link <path-to-pack>     # link a local pack into ~/.aouo/packs/
aouo gateway start                # start the Telegram daemon
```

Sample packs live in the [main repo under `apps/`](https://github.com/aouoai/aouo/tree/main/apps): `notes` (journaling), `create` (social drafting), `vocab` (CEFR vocab trainer).

### Minimum config

`~/.aouo/config.json`:

```json
{
  "provider": { "backend": "gemini", "model": "gemini-3-flash-preview" },
  "gemini":   { "api_key": "YOUR_GEMINI_KEY" },
  "telegram": {
    "enabled": true,
    "bot_token": "YOUR_BOT_TOKEN",
    "allowed_user_ids": [123456789]
  }
}
```

Supported provider backends: `gemini` (default, API key) · `openai` (API key) · `deepseek` (API key) · `codex` (OAuth via ChatGPT subscription).

---

## What the runtime gives you

- **Pack loader + ABI** — manifest validation, schema migrations, skill registry, permission gating
- **ReAct agent loop** — history sanitization, context compression, error classification with retry/failover
- **Pack-scoped isolation** — every pack has its own SQLite DB, its own `USER.md` / `MEMORY.md`, its own skill namespace
- **Conversation routing** — `(platform, chat, thread, user)` → active pack + active skill + session, stored durably
- **Telegram adapter** — forum-topic routing, `/setup_topics`, `/pack` picker, streaming token edits, adaptive inbound batching, voice / photo / document I/O, per-chat ordered queue
- **Scheduler** — cron jobs declared in pack manifests; the agent can run with no user message
- **Local dashboard** — `aouo ui start` on `127.0.0.1:9800`, token-gated, for config + inspection
- **Diagnostics** — `aouo doctor` runs real connectivity + auth + manifest checks (`--fast` to skip network)
- **Quota gates** — daily and per-session caps in `config.advanced` throw before the LLM is called
- **Structured logs** — pino with global secret auto-redact, one tap per chat in `~/.aouo/logs/`

---

## CLI reference

| Command | Purpose |
| --- | --- |
| `aouo init` | Create `~/.aouo/` with `SOUL.md`, `RULES.md`, `config.json` |
| `aouo doctor [--fast]` | Connectivity + auth + pack manifest checks |
| `aouo config` | Interactive config menu |
| `aouo config show \| edit` | Print or open `config.json` |
| `aouo config provider \| tools \| channels \| advanced` | Scriptable subsections |
| `aouo pack list` | List installed packs |
| `aouo pack validate <path>` | Validate a pack against the ABI |
| `aouo pack link <path>` | Link a local pack into `~/.aouo/packs/` |
| `aouo gateway start \| stop \| status \| restart \| logs` | Telegram daemon lifecycle |
| `aouo ui start \| stop \| status \| restart` | Local dashboard daemon |

---

## Filesystem (`AOUO_HOME`, default `~/.aouo/`)

```
~/.aouo/
├── config.json                 # provider + tools + Telegram + advanced
├── SOUL.md, RULES.md           # core-owned runtime identity
├── packs/<name>/               # linked pack source dirs
├── data/
│   ├── packs/<pack>/USER.md    # pack-owned stable user profile
│   ├── packs/<pack>/MEMORY.md  # pack-owned evolving state
│   └── store/
│       ├── state.db            # core sessions, messages, routes, usage_events
│       └── <pack>.db           # per-pack domain data
├── logs/                       # pino logs, one tap per chat
├── run/                        # pidfiles for gateway / ui
└── cron/                       # scheduler state
```

Override with `AOUO_HOME=/custom/path` (also respected by tests).

---

## Built-in tools

Imported by `registerAllTools()` in [`src/tools/registry.ts`](src/tools/registry.ts):

`file` · `web_search` · `memory` · `skill_view` · `clarify` · `msg` · `telegram` · `tts` · `db` · `persist` · `cron`

Packs can declare additional tools (JS/TS in-process via `tools/` directory, or external commands via JSON-over-stdin). Core tools never write to pack DBs directly — that path is `persist`.

---

## Programmatic use

The public API is the default export of [`src/index.ts`](src/index.ts). Typical embedding:

```ts
import { Agent, loadAllPacks, createProvider, loadConfig } from '@aouo/agent';

const config   = loadConfig();
const packs    = await loadAllPacks();
const provider = createProvider(config);
const agent    = new Agent({ provider, packs, config });

const result = await agent.run({
  sessionKey: 'cli:default',
  input: 'hello',
  activePack: 'notes',
});
console.log(result.content);
```

The exact constructor / `run` options are typed in [`src/agent/Agent.ts`](src/agent/Agent.ts) — treat this snippet as a sketch and use the types as the source of truth.

Channel adapters implement the `Adapter` interface from [`src/agent/types.ts`](src/agent/types.ts). `AdapterCapabilities` declares what message forms the channel supports — the runtime degrades gracefully (voice → audio → text, photo → text caption, etc.).

---

## Development

```sh
pnpm install
pnpm dev                    # tsup --watch
pnpm test                   # vitest run
pnpm typecheck              # tsc --noEmit (strict + noUncheckedIndexedAccess)
pnpm lint:ci                # eslint, warning budget 115
pnpm build                  # tsup → dist/
```

Single test: `pnpm vitest run tests/agent/Agent.test.ts`. Tests set `AOUO_HOME` to a fresh tempdir before any module loads.

`prepublishOnly` runs `build → lint:ci → typecheck → test` — match that locally before tagging a release.

---

## Links

- Docs: [aouo.ai](https://aouo.ai)
- Source: [github.com/aouoai/aouo](https://github.com/aouoai/aouo)
- Issues: [github.com/aouoai/aouo/issues](https://github.com/aouoai/aouo/issues)

## License

[Apache-2.0](../../LICENSE)
