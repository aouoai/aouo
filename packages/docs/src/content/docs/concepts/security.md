---
title: Security, Trust, and Sharing
description: The permission model, sharing artifacts, audit trail, and the safety contract that lets users install third-party packs without losing control.
---

Once packs can run scripts, call tools, access files, schedule work, and be shared, safety becomes core infrastructure — not a nice-to-have.

This page is the model. Implementation is partial in pre-alpha; the contract here is what we are building toward.

## Two artifacts, not one

Sharing splits cleanly into two file types:

| Artifact | Contains | Should be shared? |
| --- | --- | --- |
| `pack-name.aouo` | App source: manifest, skills, memory defaults, optional schema, persist contract, tools, views, evals | Yes |
| `pack-name.backup.aouo` | User data: memory, database rows, history, schedule state | Only privately, ideally encrypted |

Users should be able to share the app without leaking their data. The runtime enforces this by separating the package format from the state directory — `~/.aouo/packs/<name>/` is the app source; `~/.aouo/data/packs/<name>/` is the user data.

## Permissions are declared in `pack.yml`

A pack must declare what it intends to access. The user sees this list before install and before every upgrade.

```yaml
permissions:
  files: []                         # filesystem scopes the pack may read or write
  network: []                       # outbound network domains
  platforms: [telegram]             # which channels the pack can send through
  cron: true                        # may schedule proactive jobs
  external_commands: []             # shell commands the pack may invoke
```

The runtime treats anything not in the list as denied. There is no implicit-allow mode.

## Permission diffs on upgrade

Installing or upgrading a pack should show what changed:

- new tools
- new schedules
- new network domains
- new file scopes
- schema migrations
- changed skills
- changed permissions

A pack version that wants more access has to ask again. Silent permission escalation is the failure mode this model exists to prevent.

## Audit trail

Every action the pack takes is recorded:

- `usage_events` — token spend per LLM call, scope, provider, model, latency
- tool-call logs — name, args, result, timestamp
- persist writes — entity, table, mutation kind
- cron firings — job id, trigger time, outcome
- network calls — domain, status, bytes

A user should be able to answer: what can this pack do, what did it access, what did it write, which tools did it call, how many tokens did it spend, and did it trigger anything high-risk.

## Sandboxing surfaces

The runtime enforces scope at every boundary it controls:

| Surface | Boundary |
| --- | --- |
| Filesystem | A pack's `files:` list is the only scope its tools may read or write |
| Network | A pack's `network:` list whitelists outbound domains; everything else is denied |
| Storage | Each pack writes only its own SQLite DB and its own `USER.md`/`MEMORY.md` |
| Skills | Skills are namespaced by qualified name (`<pack>:<skill>`); collisions cannot leak between packs |
| Cron | Cron jobs run with the pack's permission set, not the user's full session permissions |
| Tools | Tools listed in `permissions.tools` are the only registry entries the agent can call |

See [Pack Routing](/internals/pack-routing/) for how pack scope is enforced at the conversation layer.

## Signing and integrity (planned)

For shared packs to be installable safely, the format will support:

- **Signatures** — packs signed by a maintainer key, verified at install time
- **Checksums** — manifest + payload integrity check
- **Provenance** — where the pack came from (URL, registry, local file)
- **Pinned versions** — exact-version installs by default, with an explicit upgrade flow

These are not yet implemented. Until they are, sharing should treat packs the way you would treat a shell script — read it first.

## Evals as a safety mechanism

Packs should be testable. Evals are not only quality gates — they are the way to keep a third-party pack honest after an upgrade.

- An English coaching pack can evaluate feedback accuracy, review scheduling, CEFR consistency, and whether weekly reports are based on real data.
- A creator pack can evaluate source attribution, brand voice, output structure, and export correctness.
- A pack that fails its own evals should be blocked from upgrading without explicit override.

The goal is for packs to be runnable, inspectable, and regressable — by the user, not only by the author.

## Lifecycle

```text
install -> onboard -> configure -> run -> pause -> resume -> upgrade
-> migrate -> backup -> export -> fork -> share -> uninstall -> restore
```

Each transition is a place where the host can check permissions, validate signatures, run migrations, initialize memory, register schedules, generate UI surfaces, or snapshot state. That lifecycle is what makes `.aouo` different from a prompt file you can paste into a chat window.

## Related

- [Pack Spec](/concepts/pack-spec/) — full manifest fields including `permissions:`
- [Pack Routing](/internals/pack-routing/) — how the runtime scopes a turn to a pack
- [Desktop Direction](/concepts/desktop-direction/) — where permissions, audit, and pack state should surface to the user
