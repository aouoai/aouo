---
title: CLI Reference
description: Commands for initializing, configuring, running, and validating aouo.
---

## `aouo init`

Initialize `~/.aouo/` with default config and templates.

## `aouo gateway start`

Start the Telegram bot in long-polling mode.

```bash
aouo gateway start
aouo gateway status
aouo gateway stop
aouo gateway restart
```

## `aouo ui`

Start the local dashboard server on `127.0.0.1`.

```bash
aouo ui
aouo ui start --port 9800
aouo ui status
aouo ui stop
aouo ui restart
```

The launch URL includes an ephemeral token. Do not expose the dashboard on a public network.

## `aouo config`

Open the configuration wizard.

```bash
aouo config provider   # active provider, credentials, model
aouo config tools      # tool APIs and enabled tool groups
aouo config channels   # Telegram and cron delivery
aouo config advanced   # limits, retries, display behavior
aouo config show       # masked JSON
aouo config edit       # open ~/.aouo/config.json
```

## `aouo doctor`

Check environment health — API keys, Node version, pack integrity.

## `aouo pack list`

List installed packs and their status.

## `aouo pack validate`

Validate a local pack against the Pack ABI before packaging.

```bash
aouo pack validate ./apps/notes
```

## `aouo pack link`

Validate a local pack and symlink it into `~/.aouo/packs/<name>` for development.

```bash
aouo pack link ./apps/notes
```

## `aouo install` <Badge type="warning" text="deferred" />

Local `.aouo` package installation is intentionally deferred until the Pack ABI is stable. Registry installation and paid-pack entitlement checks come after that.
