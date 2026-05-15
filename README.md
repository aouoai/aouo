# aouo

> **An app format for AI-native compute.**
> Each app has its own database, memory, schedules, skills, and permissions. You can open it, audit it, share it, fork it.

[![CI](https://github.com/aouoai/aouo/actions/workflows/ci.yml/badge.svg)](https://github.com/aouoai/aouo/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![npm](https://img.shields.io/badge/npm-%40aouo%2Fagent-cb3837.svg)](https://www.npmjs.com/package/@aouo/agent)

> **Status: pre-alpha (`0.0.1-alpha.2`).** The pack ABI and runtime APIs may change without deprecation. Not yet recommended for shared / multi-tenant deployments.

---

## Why this exists

Every new compute form ended up with an OS. PCs got Windows and macOS. Phones got iOS and Android. The web got the browser. The OS layer wasn't the most exciting part of each era — it just turned out to be the thing that decided what a "real app" looked like.

AI compute is the newest compute form, and the app format is still up for grabs:

- A **Custom GPT** is a system prompt with a few tool stubs. It cannot remember things you didn't explicitly tell it. It cannot run while you sleep. It cannot be shared as a file. It lives on someone else's server.
- A **Claude Project** is a folder of reference files. Same constraints.
- A **LangChain / Hermes / CrewAI agent** is a script with a bag of skills. No identity, no schema, no lifecycle, no distribution unit.

What an "AI app" should be — what an Excel sheet or a `.app` bundle is for older eras — has not been settled.

**aouo's answer: the pack.**

---

## What a pack is

A **pack** is the smallest thing you can install, run, share, fork, or delete that constitutes a complete AI app. It has all six things an app needs.

```text
my-vocab-trainer.aouo/
├── pack.yml                  ← identity, version, permissions, cron
├── schema.sql                ← the app's own SQLite tables
├── templates/
│   ├── USER.md.tmpl          ← the app's view of who you are
│   └── MEMORY.md.tmpl        ← the app's evolving notes about you
├── skills/
│   ├── onboarding/SKILL.md   ← workflow: first-run assessment
│   ├── study/SKILL.md        ← workflow: today's review session
│   ├── add/SKILL.md          ← workflow: add new vocab
│   └── report/SKILL.md       ← workflow: weekly progress
└── i18n/zh-CN.json           ← optional localization
```

Every pack ships with:

| Component | What it gives the app |
| --- | --- |
| Manifest (`pack.yml`) | Identity, version, declared tools, declared permissions, cron schedule |
| Schema (`schema.sql`) | A real SQLite database. Not "memory bullets" — structured rows you can `SELECT` from |
| Memory (`USER.md` + `MEMORY.md`) | Plain-text long-term state you can `cat`, `grep`, and `vim` |
| Skills (`SKILL.md`) | Workflows the agent loads on demand, not a flat bag of prompts |
| Cron defaults | Schedules the app runs without you asking — `21:00 evening journal`, `Sun 10:00 weekly review` |
| Permissions | Declared scopes: cron, web search, file access, external commands |

A pack is **the unit of distribution**. Three sample packs ship in this repo:

| Pack | What it does | Has its own |
| --- | --- | --- |
| [`notes`](apps/notes) | Daily journaling + weekly reflection | `entries`, `weekly_summaries` tables · 21:00 prompt · Sun 10:00 review |
| [`create`](apps/create) | Social drafting: capture → ingest → prompt → draft | `materials`, `posts`, `voices` tables · 21:00 prompt · 09:00 draft |
| [`vocab`](apps/vocab) | CEFR placement + spaced repetition | `words`, `cards`, `reviews`, `intervals`, `assessment_runs` tables · 08:00 study · Sun 10:00 report |

Three packs running on the same machine means three independent SQLite databases, three independent `MEMORY.md` files, three independent cron schedules, and three completely isolated conversation histories.

---

## What it looks like to use

The desktop client (in development) makes each pack feel like a real app:

```text
┌────────────────────────────────────────────────────────────────┐
│  aouo                                              ⚙ settings  │
├──────────────┬─────────────────────────────────────────────────┤
│              │  vocab — Study                                   │
│  📦 notes    │  ─────────────────────────────────────────────   │
│  📚 vocab  ◀ │                                                  │
│  ✍️ create   │   You've got 23 cards due today.                 │
│              │   Want to do 10 now?                             │
│  + add pack  │                                                  │
│              │   [ start ]  [ later ]                           │
│  ─────────   │                                                  │
│              │   ▌                                              │
│   Today      │  ─────────────────────────────────────────────   │
│  21:00 notes │  > /study   review 10                            │
│  08:00 vocab │  ┌──────────────────────────────────────────┐    │
│              │  │ message · /skill ▼ · 🎤 · 📎              │    │
│              │  └──────────────────────────────────────────┘    │
└──────────────┴─────────────────────────────────────────────────┘
```

Selecting a pack in the sidebar reveals **the app's own surfaces**:

| Tab | What you see |
| --- | --- |
| **Chat** | Conversation history scoped to this pack. Switching packs gives you a different agent with different memory, not a context-bleed |
| **Memory** | `USER.md` and `MEMORY.md` rendered as editable Markdown. You can read what your agent thinks about you, and correct it |
| **Database** | The pack's SQLite tables, rows, recent writes. `SELECT * FROM reviews ORDER BY created_at DESC` is a click, not a command |
| **Schedule** | Every cron job the pack runs. Enable, disable, change time, dry-run |
| **Permissions** | Exactly what the pack can read, write, network-access, or shell out to — declared in the manifest, enforced at runtime |
| **Tools** | Which built-in tools (`web_search`, `tts`, `db`, etc.) and pack-supplied tools are active |

Inside the chat, the input box has a `/skill` picker:

```text
> /skill ▼
  ├─ onboarding   first-run placement test
  ├─ study        today's review session
  ├─ add          add a new word
  └─ report       weekly progress
```

Picking a skill scopes the next turn to just that workflow — the LLM doesn't have to decide which of the pack's skills to run, you told it. **Less ambiguity, less cost, more precision.**

---

## Why "app" instead of "skill bag"

Most agent frameworks (Hermes, openclaw, LangChain-style) hand the LLM a flat list of every installed skill. If you've installed 30 skills, every turn ships 30 skill descriptions to the LLM — whether you need them or not.

A pack scopes the LLM's working set to one app at a time:

| | Skill-bag agent | aouo (pack-scoped) |
| --- | --- | --- |
| Skills sent to LLM per turn | All installed (30+) | Active pack only (4-6) |
| System prompt tokens for skill index | ~900 | ~150 |
| LLM's decision space | "Which of 30 skills?" | "Which of 5 skills?" |
| Cross-app context bleed | Yes | No — fully isolated state |

The savings show up as **lower per-turn cost**, **faster time-to-first-token** (smaller prompts), and **better skill-selection accuracy** (smaller decision space). For small / cheap models like Gemini Flash or DeepSeek, the latency difference is the more noticeable win; for premium models the cost difference adds up.

---

## What sets pack-as-app apart, structurally

These differences are not features that competitors can ship next quarter. They follow from the architecture.

### 1. The memory is yours, in plain text, with timestamps

```bash
$ cat ~/.aouo/data/packs/vocab/MEMORY.md
$ sqlite3 ~/.aouo/data/store/vocab.db "SELECT * FROM reviews ORDER BY created_at DESC LIMIT 10"
```

ChatGPT's memory is a black box on their server. Claude's projects don't expose persistent state. With aouo, every byte your agent knows about you lives in a file or row you can open, audit, copy, version-control, or wipe.

### 2. The state is structured, not bulleted

ChatGPT might remember "user is at B2 in English." A `vocab` pack stores 1,200 rows of `(word, ease_factor, srs_interval, last_review, next_due)` and runs an actual spaced-repetition algorithm against them. **One is a remembered fact, the other is a working system.**

### 3. Apps initiate, not just react

Packs declare cron in their manifest. At 21:00 your `notes` pack starts the evening-journal skill. At 08:00 your `vocab` pack queues your due cards. **Your agents have a schedule. ChatGPT and Claude do not.**

### 4. Apps are files you can share

A `.aouo` package is a tar of pack source — manifest, schema, skills, templates. You can `scp` it to a friend, push it to GitHub, fork it, version it. The agent your friend runs is identical to yours up to the data they enter.

### 5. Apps don't bleed into each other

Switching packs in the same chat (or same desktop sidebar) gives you a completely different agent — different memory, different database, different schedule. This is enforced at the runtime level by pack-scoped sessions and qualified skill names. **5 specialists who do not gossip.**

### 6. Apps declare what they touch

Permissions live in the manifest:

```yaml
permissions:
  cron: true
  web_search: true
  file_access: false
  external_command: false
```

The runtime enforces them. You install a pack and know what it can and cannot do — without reading source.

---

## The ambition: `.aouo` as an open app format

If pack-as-app is the right shape, then `.aouo` should be **a runtime-independent, open file format**. Any agent runtime — aouo, a future re-implementation in Rust or Go, a fork from someone else — should be able to load any pack that conforms to the spec.

Concretely, this means:

- The pack ABI (manifest schema, persist contract, skill format) is versioned and documented
- The format is plain files (YAML / Markdown / SQL) — no binary, no opaque blobs, no proprietary glue
- Permissions are declarative — no embedded scripts that bypass the manifest
- Distribution is via filesystem, git, or HTTP — no central registry required
- The runtime is Apache-2.0 — packs are owned by their authors

The long-term hope is that "app format for AI compute" gets settled by an open standard rather than four mutually-incompatible walled gardens. `.aouo` is one bid at that standard. There will be others.

---

## What ships today

Pre-alpha, but real:

- **Three sample packs** running end-to-end on a Telegram channel (`notes`, `create`, `vocab`)
- **Four LLM providers** (Gemini · OpenAI · DeepSeek · Codex OAuth)
- **Pack-scoped runtime isolation** — per-pack SQLite, memory, sessions, qualified skills
- **Cron scheduler** firing pack skills proactively
- **Streaming token replies** with in-place message edits, capability-aware degrade across channels
- **Local dashboard** for config, status, and pack inspection
- **CLI** (`aouo init / doctor / config / pack / gateway / ui`) for headless deployments

For setup, configuration, CLI reference, and pack authoring: see [aouo.ai](https://aouo.ai) or the [package README](packages/agent/README.md).

---

## What we're building toward

- **Desktop client** — Mac/Linux/Windows. Pack-as-app sidebar, in-app DB browser, memory editor, cron timeline, permission panel. The vision above, made real.
- **`builder` meta-pack** — describe what kind of agent you want; the pack composer drafts manifest, skills, and schema for you. AI-assisted pack authoring.
- **`.aouo` archive format** — single-file bundles (`pack-name.aouo`) for distribution. Click to install, no git required.
- **Cross-pack views** — meta queries across all your packs without breaking isolation. "What did my agents do this week."
- **More channel adapters** — Discord, Slack, Web. The Telegram adapter becomes one of several "remote controls" for your desktop OS.

---

## What this is not

To save you time:

- Not a coding agent. Codex / Claude Code / Cursor cover that. aouo's packs are end-user vertical apps (English tutor, journaling, drafting) — not "help me write Python."
- Not a prompt marketplace. Custom GPT and various GPT directories cover that. Packs ship state, schedule, and schema, not just prompts.
- Not an LLM framework. LangChain / LlamaIndex / CrewAI cover that. aouo is the layer above frameworks: where they give you primitives, aouo defines an app contract.
- Not a SaaS. Everything runs on your machine; your data is on your filesystem.

---

## Links

- Docs: [aouo.ai](https://aouo.ai)
- Source: [github.com/aouoai/aouo](https://github.com/aouoai/aouo)
- Issues: [github.com/aouoai/aouo/issues](https://github.com/aouoai/aouo/issues)
- npm: [`@aouo/agent`](https://www.npmjs.com/package/@aouo/agent)
- CHANGELOG: [CHANGELOG.md](CHANGELOG.md)
- Contributing: [CONTRIBUTING.md](CONTRIBUTING.md)

## License

[Apache License 2.0](LICENSE) · Built by [aouoai](https://github.com/aouoai).
