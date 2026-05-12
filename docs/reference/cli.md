# CLI Reference

## `aouo init`

Initialize `~/.aouo/` with default config and templates.

## `aouo gateway start`

Start the Telegram bot in long-polling mode.

## `aouo config`

Display the active configuration.

## `aouo doctor`

Check environment health — API keys, Node version, pack integrity.

## `aouo packs`

List installed packs and their status.

## `aouo install` <Badge type="warning" text="coming soon" />

Install a pack from GitHub:

```bash
aouo install aouoai/english          # GitHub shorthand
aouo install github.com/foo/my-pack  # Full URL
aouo install ./local-pack            # Local path (dev)
```

## `aouo remove` <Badge type="warning" text="coming soon" />

Remove an installed pack.
