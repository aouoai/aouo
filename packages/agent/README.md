# @aouo/agent

aouo is a local-first runtime for building vertical agent apps.

The runtime runs packs: domain applications made of skills, memory templates,
structured storage, scheduled jobs, tools, and declared permissions. The first
supported channel is Telegram; the local dashboard is intended for configuration,
pack management, and runtime inspection.

> Status: alpha. APIs, CLI commands, and the Pack ABI may change before 1.0.

## Install

Requires Node.js 22 or newer.

```sh
npm install -g @aouo/agent@next
```

Or with pnpm:

```sh
pnpm add -g @aouo/agent@next
```

## Initialize

```sh
aouo init
aouo doctor
```

This creates the local runtime directory at `~/.aouo` with:

- `config.json` for provider, tool, Telegram, cron, and dashboard settings
- `SOUL.md` and `RULES.md` for local runtime identity and behavior
- local data, pack, and log directories

## Configure

Open the interactive configuration menu:

```sh
aouo config
```

Or edit the config file directly:

```sh
aouo config edit
```

Minimum Telegram MVP configuration:

```json
{
  "provider": {
    "backend": "gemini",
    "model": "gemini-2.5-flash"
  },
  "gemini": {
    "api_key": "YOUR_GEMINI_API_KEY"
  },
  "telegram": {
    "enabled": true,
    "bot_token": "YOUR_TELEGRAM_BOT_TOKEN",
    "allowed_user_ids": [123456789]
  }
}
```

## Run

```sh
aouo gateway start
```

## Packs

Validate and link a local pack:

```sh
aouo pack validate ./packs/notes
aouo pack link ./packs/notes
aouo pack list
```

`aouo install` and `.aouo` archive installation are intentionally deferred until
the Pack ABI is stable.

## Useful Commands

```sh
aouo --help
aouo doctor
aouo config show
aouo pack list
aouo pack validate <path>
aouo pack link <path>
```

## Links

- Website: https://aouo.ai
- Repository: https://github.com/aouoai/aouo
- Issues: https://github.com/aouoai/aouo/issues

## License

Apache-2.0
