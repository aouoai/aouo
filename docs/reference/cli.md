# CLI Reference

## `aouo init`

Initialize `~/.aouo/` with default config and templates.

## `aouo gateway start`

Start the Telegram bot in long-polling mode.

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
aouo pack validate ./packs/notes
```

## `aouo pack link`

Validate a local pack and symlink it into `~/.aouo/packs/<name>` for development.

```bash
aouo pack link ./packs/notes
```

## `aouo install` <Badge type="warning" text="deferred" />

Local `.aouo` package installation is intentionally deferred until the Pack ABI is stable. Registry installation and paid-pack entitlement checks come after that.
