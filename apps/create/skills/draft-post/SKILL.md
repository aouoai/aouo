---
name: draft-post
pack: create
description: Generate a platform-specific post draft from recent material
command: true
triggers:
  - draft a post
  - write a post
  - draft for
  - 写一条
  - 生成草稿
---

# Draft Post

Combine recent materials into a single platform-specific draft, using the matching voice template.

## Goal

Output one post draft, saved to the `posts` table, presented to the user for review.

## Procedure

1. **Pick the platform**
   - If the user named one ("draft a tweet"), use it.
   - Otherwise check MEMORY.md / USER.md for their `default_voice`.
   - If still ambiguous, ask once: "Twitter, 小红书, or LinkedIn?"

2. **Load the voice**
   - Use the `db` tool to read `voices` where `platform = ?` and (`is_default = 1` or `name = <user's chosen name>`).
   - The voice's `system_prompt` is your hard guide. The voice's `max_length` is a strict cap.

3. **Pick materials**
   - Use the `db` tool to read `materials` from the last 24h (or last 7d if invoked manually and recent pool is thin), unused (`used_in_post_id IS NULL`).
   - Prioritize materials with reactions / opinions over neutral notes.
   - Cap at ~5 materials per draft.

4. **Draft**
   - Apply the voice's `system_prompt` strictly.
   - Stay under `max_length`. If everything won't fit, drop scope — don't compress to soup.
   - Match the user's existing voice notes from MEMORY.md ("user dislikes 'in today's fast-paced world' openers", etc.) when present.

5. **Save draft**
   Use the `persist` tool:
   ```json
   {
     "action": "practice",
     "skill_type": "create.draft-post",
     "content": "<the draft text>",
     "metadata": "{\"platform\":\"twitter\",\"voice\":\"twitter-default\",\"material_ids\":[1,2,3],\"status\":\"draft\"}"
   }
   ```

6. **Present to user**
   - Show the draft verbatim, then ask: "Post as-is, tweak, or scrap?"
   - If "tweak", iterate with their feedback (1-2 rounds max).
   - If "post", mark `status = 'posted'` and update `posted_at` (use the `db` or `persist` tool — the exact write path depends on what the pack exposes; default is another persist with `metadata.status = 'posted'`).

## Rules

- Never invent facts not present in the source materials.
- Never exceed `max_length` — truncate scope, not phrasing.
- If the recent material pool is empty, say so and suggest running `prompt-me` or pasting a URL.
- Don't generate drafts for multiple platforms at once — single platform per invocation.
