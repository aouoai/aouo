---
title: Configuration
description: How aouo loads provider, tool, channel, pack, cron, and local UI settings.
---

# Configuration

aouo is configured through `~/.aouo/config.json`. The CLI creates this file during `aouo init`, then merges it with runtime defaults on every start.

The config file is the source of truth for provider selection, model settings, tool APIs, Telegram access, pack scan directories, cron delivery, and local UI preferences.

## Main sections

| Section | Purpose |
|---------|---------|
| `provider` | Active LLM backend, model, generation limits, retries |
| `gemini` | Gemini API key and vision model |
| `deepseek` | DeepSeek API key |
| `tools` | Enabled tool names and tool-specific API keys |
| `security` | Allowed filesystem paths and fence behavior |
| `packs` | Enabled pack names and extra scan directories |
| `telegram` | Bot token, enabled flag, allowed user IDs |
| `cron` | Scheduler state, timezone, tick interval, default Telegram target |
| `stt` / `tts` / `azure` | Speech and audio settings |
| `ui` | Runtime display behavior |
| `advanced` | Context, ReAct loop, log level, and token quota controls |

## Configure from the CLI

```bash
aouo config provider
aouo config tools
aouo config channels
aouo config advanced
```

To inspect the current config with secrets masked:

```bash
aouo config show
```

To edit the JSON file directly:

```bash
aouo config edit
```

## Provider model

The provider layer currently supports:

- `gemini`: API-key based Gemini provider.
- `codex`: OAuth-backed Codex provider, using the local Codex auth state.
- `deepseek`: API-key based DeepSeek provider.

The active backend and model live under `provider`:

```json
{
  "provider": {
    "backend": "gemini",
    "model": "gemini-3-flash-preview",
    "max_tokens": 8192,
    "temperature": 0.7,
    "max_retries": 3
  }
}
```

## Pack loading

aouo always scans the user pack directory:

```text
~/.aouo/packs/
```

It can also scan additional local development directories:

```json
{
  "packs": {
    "enabled": ["notes"],
    "scan_dirs": ["./apps"]
  }
}
```

During `aouo gateway start`, the runtime loads enabled packs, validates their manifests, registers skills, runs schema migrations, registers custom tools, and prepares pack-scoped memory.

## Secrets

Secrets are configured locally. They should not be committed into pack files or the repository.

<Warning>
  `config.json` may contain provider keys and Telegram bot tokens. Keep it under `~/.aouo/`, never inside a pack, docs page, or Git repository.
</Warning>
