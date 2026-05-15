---
title: Context Compiler
description: How a pack compiles the smallest useful prompt for a turn — layered loading, token budgets, and why pack scope makes small models more useful.
---

Context is not only an implementation detail. It is a product feature.

Token cost is not only a billing problem. It is an attention problem. When an agent has access to every installed skill, every tool, every memory file, and every workflow at once, the model has to spend part of every turn deciding what to ignore. That makes small models worse and large models more expensive.

aouo compiles the smallest useful context for the current app, mode, task, permission set, and token budget.

## Pack-level policy

Each pack declares its context policy in `pack.yml`:

```yaml
context:
  skill_loading: lazy
  history_window: 8
  memory_policy: summary_plus_query
  max_tokens: 6000
```

| Field | Meaning |
| --- | --- |
| `skill_loading` | `lazy` only loads the active skill body; `eager` loads all skill bodies |
| `history_window` | Max recent messages included verbatim before summarization kicks in |
| `memory_policy` | `summary_plus_query` runs a digest pass and only pulls excerpts relevant to the current turn |
| `max_tokens` | Soft ceiling — the compressor truncates before crossing it |

## Layered loading

The runtime loads context in layers, from cheap to expensive:

| Layer | Loaded when |
| --- | --- |
| Pack card | Global routing between installed packs |
| Skill cards | After a pack is selected |
| Full skill prompt | Only when a skill is selected or routed |
| Database rows | Retrieved by the active workflow |
| Memory excerpts | Pulled by policy, not pasted wholesale |

Each layer is added only if the previous layer's decision required it. The router never pays for skill bodies it did not select.

## Why this matters

The ideal prompt for one turn is not:

```text
all packs + all skills + all tools + all memory + all schemas + all history
```

It is closer to:

```text
pack soul + active mode + a few skill cards + one full skill instruction
+ necessary memory summary + relevant DB facts + required tool schemas
+ recent session history
```

## Rough comparison

Token cost for one turn under different surface assumptions. Exact numbers depend on skill size; the curve is what matters.

| Surface | Loaded into the prompt | Token estimate |
| --- | --- | --- |
| Flat skill bag, 30 installed skills | All skill cards + all tools + general memory | ~900 |
| Pack-scoped, 1 active pack, 4 skills | Pack soul + 4 skill cards + active skill body + pack memory | ~250 |
| Pack-scoped + fast-path button hit | Pack soul + matched workflow only | ~120 |

In a generalist agent, most of the token spend pays for skills that did not run this turn. Pack scoping is what cuts that.

## Fast-paths

Some interactions never need the LLM at all. Menu buttons and i18n keys resolve deterministically before `Agent.run` is invoked — see [Architecture](/concepts/architecture/) for the resolver. A fast-path hit costs zero tokens.

## How the runtime enforces it

- `Agent.run` calls `assertWithinQuota` before any history I/O — daily and per-session caps come from `config.advanced` and throw before the first LLM call.
- `ContextCompressor` summarizes older messages when token estimates exceed the pack's `max_tokens`.
- `skill_view` is the only path that promotes a skill card to a full skill body — bare bodies are not auto-attached.

## Practical implications

- **Small models become useful.** A focused Haiku-class model running inside a pack often beats a generalist model with 30 skills in scope.
- **Per-pack cost is bounded.** Quota gates run before the LLM, not after — runaway loops are visible to the user as `QuotaExceededError` rather than a surprise bill.
- **The pack author controls the budget.** Raising `max_tokens` is a deliberate decision, not a default.

## Related

- [Pack Spec](/concepts/pack-spec/) — manifest fields including `context:`
- [Architecture](/concepts/architecture/) — where the compressor and quota gate fit in `Agent.run`
- [Five Pillars](/concepts/five-pillars/) — why long-term memory belongs in DB + files, not the prompt
