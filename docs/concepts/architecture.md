# Architecture

aouo follows a three-layer architecture with strict separation between the domain-agnostic core and domain-specific packs.

## Layers

```
┌─────────────────────────────────────────────┐
│               Domain Packs                  │
│   english · fitness · finance · notes       │
├─────────────────────────────────────────────┤
│               Core Runtime                  │
│   Agent · Tools · Persist · Cron · Loader   │
├─────────────────────────────────────────────┤
│            Platform Adapters                │
│        Telegram · CLI · (future: Web)       │
└─────────────────────────────────────────────┘
```

## Boot Sequence

1. Read `~/.aouo/config.json` for enabled packs and API keys
2. Pack Loader scans and initializes each pack:
   - Parse `pack.yml` manifest
   - Validate dependencies (topological sort)
   - Run schema migrations (`schema.sql`)
   - Copy templates on first install
   - Register fast-path routes (`menu.json`)
   - Register skills and custom tools
3. Start the Telegram adapter (long-polling)
4. Start the cron ticker (60s interval)

## ReAct Loop

```
User Message → System Prompt → LLM → Tool Calls? → Execute → Loop
                                    → Text Only?  → Reply  → Done
```

Max iterations: 25 (configurable). Each iteration can call multiple tools in parallel.

## State Files

| File | Owner | Purpose |
|------|-------|---------|
| `SOUL.md` | Core | Agent identity and personality |
| `RULES.md` | Core | Operating rules and tool usage |
| `USER.md` | Pack | User profile, goals, preferences |
| `MEMORY.md` | Pack | Evolving state: levels, strategy |

## Data Flow

```
User interaction → Skill execution → persist() → Pack DB
     ↑                                              ↓
     └──── System Prompt ←── MEMORY.md ←── Cron Aggregation
```
