# Quick Start

Get your first aouo agent running in under 5 minutes.

## Prerequisites

- **Node.js 22+** — aouo uses ESM and SQLite via `better-sqlite3`
- **A Telegram Bot Token** — create one via [@BotFather](https://t.me/botfather)
- **A Gemini API Key** — get one from [Google AI Studio](https://aistudio.google.com/apikey)

## 1. Install

::: code-group

```bash [npm]
npm install -g @aouo/core
```

```bash [pnpm]
pnpm add -g @aouo/core
```

:::

## 2. Initialize

```bash
aouo init
```

This creates `~/.aouo/` with:

```
~/.aouo/
├── config.json          # API keys, preferences
├── SOUL.md              # Agent identity (core-owned)
├── RULES.md             # Operating rules (core-owned)
├── packs/               # Installed or linked pack sources
└── data/packs/          # Mutable pack memory/state
```

## 3. Configure

Use the guided config commands:

```bash
aouo config provider
aouo config tools
aouo config channels
```

Or edit `~/.aouo/config.json` directly:

```json
{
  "version": "0.1.0",
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
    "allowed_user_ids": [YOUR_TELEGRAM_USER_ID]
  }
}
```

::: tip Finding your Telegram user ID
Message [@userinfobot](https://t.me/userinfobot) on Telegram — it will reply with your numeric user ID.
:::

## 4. Start the Agent

```bash
aouo gateway start
```

Your bot is now running! Open Telegram and send it a message.

Without any packs loaded, aouo is a general-purpose runtime shell with persistence and scheduling. Add a pack to give it vertical app behavior.

## 5. Add a Local Pack

```bash
aouo pack validate ./packs/notes
aouo pack link ./packs/notes
aouo pack list
```

Phase 1 intentionally uses local pack linking. `aouo install` comes later, after the Pack ABI and `.aouo` package format are stable.

## What's Next?

- [Architecture](/concepts/architecture) — How the core + pack system works
- [Five Pillars](/concepts/five-pillars) — What makes a vertical agent app
- [Build a Pack](/build-a-pack/first-pack) — Create your own companion
