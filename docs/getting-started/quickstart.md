# Quick Start

Get your first aouo agent running in under 5 minutes.

## Prerequisites

- **Node.js 22+** — aouo uses native SQLite (`node:sqlite`) and ESM
- **A Telegram Bot Token** — create one via [@BotFather](https://t.me/botfather)
- **A Gemini API Key** — get one from [Google AI Studio](https://aistudio.google.com/apikey)

## 1. Install

::: code-group

```bash [npm]
npm install -g aouo
```

```bash [pnpm]
pnpm add -g aouo
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
└── packs/               # Installed packs go here
```

## 3. Configure

Edit `~/.aouo/config.json`:

```json
{
  "version": "0.1.0",
  "llm": {
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key": "YOUR_GEMINI_API_KEY"
  },
  "telegram": {
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

Without any packs installed, aouo is a general-purpose assistant with persistence and scheduling. Install a pack to give it domain expertise.

## 5. Install a Pack

```bash
aouo install aouoai/english    # English learning companion
```

Restart the gateway and your agent now has 27+ English learning skills — dictation, shadowing, vocabulary SRS, and more.

## What's Next?

- [Architecture](/concepts/architecture) — How the core + pack system works
- [Five Pillars](/concepts/five-pillars) — What makes a Domain Companion
- [Build a Pack](/build-a-pack/first-pack) — Create your own companion
