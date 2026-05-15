---
title: Pack Routing Internals
description: The identity model that connects a Telegram address to an active pack, a session, and a qualified skill — with the invariants that keep multi-pack conversations from crossing.
---

A single user, in a single chat, can talk to several packs. Forum topics make this even harder: one supergroup can host three packs in three topics. Cross-talk between those conversations would be silent and irreversible — the wrong pack's `MEMORY.md` would grow, the wrong skill would persist, the wrong SQLite database would receive writes.

This page is the identity model that prevents that. It defines the data, the lookups, the invariants, and the failure-recovery rules.

## The identity chain

Every turn has the same four-step identity chain:

```mermaid
flowchart LR
  Update["Telegram update"] --> Address["ConversationAddress"]
  Address --> Route["conversation_routes row"]
  Route --> Pack["active_pack"]
  Pack --> SessionKey["sessionKey = conversationSessionKey(address, pack)"]
  SessionKey --> SessionId["sessions row"]
```

The chain is one-way. Address never depends on session; session never determines pack. This is what lets `/pack` switch packs cleanly: it rewrites a single column in `conversation_routes` and the next turn's session is derived afresh.

## Data model

Two core tables live in `~/.aouo/data/store/state.db` (SQLite, WAL).

### `conversation_routes`

```text
id              TEXT PRIMARY KEY
platform        TEXT NOT NULL          -- 'tg' today
chat_id         TEXT NOT NULL
thread_id       TEXT NOT NULL DEFAULT ''  -- forum topic id, '' for non-forum
user_id         TEXT NOT NULL DEFAULT ''
active_pack     TEXT                   -- nullable until a pack is picked
active_skill    TEXT                   -- qualified name: 'notes:onboarding'
session_id      TEXT                   -- nullable; minted on first run
created_at      INTEGER
updated_at      INTEGER

UNIQUE (platform, chat_id, thread_id, user_id)
```

One row per `(platform, chatId, threadId, userId)` quadruple. The `user_id` slot is present for future per-user routes inside group chats; today it defaults to `''` in Telegram which means "shared by all users in this address."

### `sessions`

```text
id              TEXT PRIMARY KEY
session_key     TEXT NOT NULL          -- the key used to look this session up
title           TEXT
active_skill    TEXT                   -- qualified name
created_at      INTEGER
updated_at      INTEGER
message_count   INTEGER NOT NULL DEFAULT 0

INDEX (session_key)
INDEX (updated_at DESC)
```

`session_key` is the lookup key. It encodes the full identity so two routes that share a chat but live in different packs or topics get different sessions automatically.

## `sessionKey` shape

`conversationSessionKey(address, activePack)` builds the key. The shape is:

```text
<platform>:<chatId>[:thread:<threadId>][:user:<userId>]:pack:<activePack>
```

Examples:

| Conversation | sessionKey |
| --- | --- |
| Private chat with `notes` | `tg:111:pack:notes` |
| Forum topic 42 with `vocab` | `tg:-100222:thread:42:pack:vocab` |
| Same forum topic, switched to `create` | `tg:-100222:thread:42:pack:create` |

The pack suffix is the crucial part. Without it, switching pack inside a chat would reuse the same session row, mixing histories.

## Pack-scope guarantees

This identity model gives three hard guarantees:

1. **History isolation** — switching pack on a route creates a new session and a new message stream. The previous pack's history is not deleted; it is unreachable from the new sessionKey but recoverable if you switch back.
2. **Skill isolation** — `active_skill` is stored as a qualified name. A bare `"onboarding"` row would resolve to whichever pack registered it last; a qualified `"notes:onboarding"` row cannot.
3. **Data isolation** — `persist`, `memory`, and pack SQLite all read the active pack from the `ToolContext.pack` field that the runtime threads through. The active pack at the start of the turn is what controls every write that turn.

## Lookups

### `resolveRouteContext`

Inside `handleIncoming`, the adapter calls `resolveRouteContext(ctx)` which returns:

```ts
{
  address:    ConversationAddress,
  route:      ConversationRoute,
  activePack: string | undefined,
  sessionKey: string | undefined,   // undefined if no activePack yet
}
```

When `activePack` is undefined and ≥2 packs are loaded, the adapter sends the pack picker and ends the turn. The next callback (`pack:<name>`) sets `active_pack` and replays.

### `resolveSessionId`

```ts
async resolveSessionId(route, sessionKey): Promise<string>
```

The contract:

1. If `route.session_id` exists, read `sessions.session_key` for that id.
2. If the stored key equals `sessionKey`, reuse `route.session_id`.
3. Otherwise log `tg_route_session_stale` and call `getOrCreateSession(sessionKey)` to mint or recover the right session.
4. Write the resolved session id back to the route with `setRouteSession`.

This is the self-healing step. Old routes that predate the pack-scoping migration (or routes that were bound under a stale session pointer for any reason) repair themselves on the next inbound message. No SQL migration script is needed.

## Skill identity

### Why qualified names

Two packs are allowed to ship a skill with the same bare name. `notes` and `create` both have `onboarding`. The skill registry stores every skill under **both** keys for ergonomic lookup:

```text
'onboarding'         -> last-registered owner (best-effort)
'notes:onboarding'   -> notes pack's onboarding
'create:onboarding'  -> create pack's onboarding
```

Bare-name lookups are last-writer-wins. The qualified key is the unambiguous identity. **Every persistence boundary in the codebase uses qualified names.**

### Persistence sites

The places that write `active_skill` (either to `sessions.active_skill` or `conversation_routes.active_skill`) must persist `RegisteredSkill.qualifiedName`, never `RegisteredSkill.name`. Sites in the Telegram adapter:

| Site | Trigger |
| --- | --- |
| Onboarding guard | First message on a fresh session — pin the pack's onboarding skill |
| `/new` | Optionally pin the pack's `planner` skill |
| Skill-as-command | `/<skill>` registered from a pack's SKILL.md frontmatter |
| Callback skill switch | Inline-keyboard tap that switches active skill |
| Agent `skill_view` side effect | The agent loaded a skill body — pin it for follow-up turns |

If you add a new site, qualify the name first.

### Skill resolver closure

`Agent.run` accepts a `SkillResolver` — a closure that maps a name (qualified or bare) to a skill. The Telegram adapter builds one **per turn** and captures `activePack`:

```ts
resolveSkill(name) {
  const qualified = (activePack && !name.includes(':'))
    ? `${activePack}:${name}`
    : null;
  const skill = (qualified ? getSkill(qualified) : undefined) ?? getSkill(name);
  return skill ? { body: skill.body, pack: skill.pack } : undefined;
}
```

The bare `'onboarding'` arriving from the LLM resolves to `notes:onboarding` inside a notes turn and to `create:onboarding` inside a create turn — automatically. There is no global "which pack owns onboarding" question.

### ToolContext.pack

The same `activePack` rides into every tool call via `ToolContext.pack`. The `skill_view` tool re-uses the closure pattern internally so the agent can call `skill_view('aggregator')` without prefixing.

## Mutations

The handful of writes that mutate this identity model:

| Function | What it writes | Caller |
| --- | --- | --- |
| `getOrCreateRoute(address)` | New `conversation_routes` row with all-null pack/skill/session if none exists | Inbound resolution |
| `setRoutePack(routeId, pack, skill?)` | `active_pack` (and optional `active_skill`); clears `session_id` so the next turn mints a fresh session | `/pack`, `/use`, `pack:` callback, `/setup_topics` |
| `setRouteSession(routeId, sessionId)` | `session_id` | After `resolveSessionId` |
| `getOrCreateSession(sessionKey)` | New `sessions` row | First turn under a new `sessionKey` |
| `setActiveSkill(sessionId, qualifiedName)` | `sessions.active_skill` | Onboarding guard, `/new` planner, skill-as-command, callback switch, `skill_view` side effect |

`setRoutePack` deliberately nulls `session_id` because the new pack will produce a new `sessionKey`. Reusing the old session id under the new pack is the bug class this whole model exists to prevent.

## Invariants

A turn that violates any of these is incorrect. They are not stylistic preferences.

1. **`sessions.session_key` matches the `sessionKey` derived from `(address, active_pack)`.** Violated → `resolveSessionId` heals it; the previous turn's writes might have gone to the wrong session.
2. **`active_skill` (on either table) is a qualified name.** Violated → `getSkill` returns last-registered pack's skill on collision, which becomes the new `activePack` and silently drifts.
3. **`setRoutePack` clears `session_id` if and only if the new pack differs from the previous.** Violated → the old pack's history bleeds into the new pack's first turn.
4. **`ToolContext.pack` equals `activePack` resolved at turn start.** Violated → mid-turn pack switches by tools, which is a write surface no tool needs.

The runtime enforces (1) via `resolveSessionId`, (2) at every persistence site, (3) inside `setRoutePack`, and (4) by passing `activePack` once at the top of `Agent.run` and never mutating it inside the loop.

## Multi-pack chat patterns

How the model plays out for the four common shapes:

### Single-pack, single chat

`active_pack` is bound at first message. Identity is `(chatId, pack)`. The pack picker never appears.

### Multiple packs, private chat

`active_pack` starts unbound. First inbound triggers the picker. Each `/pack` switch changes the column and mints a fresh session. The pack-badge suffix `— <pack>` appears on every reply so the user knows where they are.

### Forum supergroup, one pack per topic

`/setup_topics` creates a topic per pack and pre-binds each topic's `active_pack` to its pack name. From the user's perspective the topic title is the label. Identity is `(chatId, threadId, pack)`. No badge is appended — the topic title carries the information.

### Forum supergroup, multi-pack per topic

Allowed but discouraged. The picker reappears inside the topic on every pack switch; the topic title can become misleading. Recommend a single pack per topic.

## Debugging recipes

| Symptom | Inspection |
| --- | --- |
| User says "the bot remembers a different pack's stuff" | Check `conversation_routes.session_id` and `sessions.session_key` — they must agree |
| Wrong pack's skill keeps activating | Check `sessions.active_skill` — it must be a qualified name |
| `/pack` picks the right pack but replies still drift | Almost always a stale `session_id` or a bare `active_skill` — both surface as `tg_route_session_stale` and bare-name resolution warnings |
| Forum topic doesn't route to the right pack | `bot.api.getForumTopic` is rate-limited; the auto-bind path may fall back to picker. `/use <pack>` inside the topic forces the binding |

A useful one-liner for SQLite:

```sql
SELECT cr.chat_id, cr.thread_id, cr.active_pack, cr.active_skill, s.session_key, s.active_skill AS sess_skill
FROM conversation_routes cr
LEFT JOIN sessions s ON s.id = cr.session_id
WHERE cr.platform = 'tg'
ORDER BY cr.updated_at DESC
LIMIT 20;
```

If `cr.active_pack` is `notes` but `s.session_key` does not contain `:pack:notes`, the route is stale — the next inbound will heal it.

## Related docs

- [Telegram Adapter Internals](/internals/telegram-adapter/) — bot lifecycle, command surface, callback routing
- [Message Pipeline](/internals/message-pipeline/) — full inbound→outbound trace
- [Pack Spec](/concepts/pack-spec/) — pack manifest contract
