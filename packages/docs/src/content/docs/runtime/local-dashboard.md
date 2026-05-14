---
title: Local Dashboard
description: The local-only Web UI for configuration, status, and pack management.
---

# Local Dashboard

aouo includes a local dashboard server for configuration, runtime status, and pack visibility.

The dashboard is intentionally local-first. It binds to `127.0.0.1`, mints an ephemeral token at startup, and passes that token to the browser through the launch URL.

## Start the dashboard

```bash
aouo ui
```

Or explicitly:

```bash
aouo ui start --port 9800
```

Useful commands:

```bash
aouo ui status
aouo ui stop
aouo ui restart
```

## Security model

The dashboard is not a cloud app. It can expose sensitive local state:

- provider keys
- Telegram bot token
- pack data and memory
- cron configuration
- runtime health and logs

For that reason the server follows these rules:

- bind to `127.0.0.1`, not `0.0.0.0`
- require an ephemeral token for `/api/*`
- do not persist the dashboard token to disk
- serve the SPA only from the local bundle
- treat cloud deployment as a separate future product, not the MVP default

:::note
  The public website at `aouo.ai` is documentation. The Web UI runs locally from the user's machine.
:::

## API surface

The local server currently exposes JSON endpoints for dashboard views:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/config` | Masked config snapshot |
| `GET /api/config/raw` | Raw config values for local forms |
| `PUT /api/config/:section` | Update one top-level config section |
| `GET /api/status` | Doctor-style runtime health |
| `GET /api/packs` | Installed/scanned pack list |

## Development bundle

The dashboard source lives in `packages/dashboard`. The published agent package serves the built SPA from `dist/dashboard`.

During local development, build the dashboard before starting `aouo ui`:

```bash
pnpm --filter @aouo/dashboard build
pnpm --filter @aouo/agent build
aouo ui
```
