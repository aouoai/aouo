# Quick Start

Get your first aouo agent running in under 5 minutes.

## Prerequisites

- **Node.js 22+** (aouo uses native SQLite and ESM)
- **A Telegram Bot Token** — get one from [@BotFather](https://t.me/botfather)
- **A Gemini API Key** — get one from [Google AI Studio](https://aistudio.google.com/apikey)

## 1. Install

```bash
npm install -g @aouo/core
```

## 2. Initialize

```bash
aouo init
```

This creates `~/.aouo/` with default config and templates.

## 3. Configure

Edit `~/.aouo/config.json`:

```json
{
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

::: tip
Find your Telegram user ID by messaging [@userinfobot](https://t.me/userinfobot).
:::

## 4. Start

```bash
aouo gateway start
```

Your bot is now running! Message it on Telegram.

## 5. Install a Pack (Optional)

```bash
aouo install aouoai/english
```

Restart the gateway and your agent now has English learning skills.
