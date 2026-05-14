---
name: capture
pack: create
description: Default skill for the Create pack — file casual user input (text, voice, image) into the material pool
command: true
triggers:
  - capture
  - note this
  - save this
  - file this
  - 记一下
  - 存下
---

# Capture

When the user sends raw content without a specific other request, file it into the `materials` table for later use in drafts.

## Goal

Capture material with minimal friction. One round-trip when possible.

## Procedure

1. **Classify the input**
   - Text → `kind = 'text'`
   - Voice note (transcript already attached) → `kind = 'voice'`, store transcript as `content`
   - Image (caption + STT/vision result attached) → `kind = 'image'`, store the caption/description as `content`
   - URL → defer to the `ingest-url` skill (call it explicitly)

2. **Quick summary**
   - For text over 200 chars or voice transcripts, generate a one-sentence summary into `summary`.
   - For short text (≤200 chars), leave summary empty and use `content` as-is.

3. **Tag**
   - Pick 1-3 lowercase tags from the content (topics, mood, platform hint). Store as JSON array.
   - If the user explicitly tagged something ("#opinion", "for twitter"), respect it.

4. **Save**
   Use the `persist` tool:
   ```json
   {
     "action": "practice",
     "skill_type": "create.capture",
     "content": "<the raw content>",
     "tags": "[\"<tag1>\",\"<tag2>\"]",
     "metadata": "{\"kind\":\"text\",\"summary\":\"<one-line summary or empty>\"}"
   }
   ```

5. **Acknowledge briefly**
   - One short line: "Filed under <tag>." Don't recap the content back.
   - If the material looks immediately post-worthy (long, narrative, opinion-shaped), offer: "Want me to draft a post from this now?"

## Rules

- Don't ask for permission to file — just file.
- Don't expand or rewrite the content during capture — keep the user's voice raw for later drafting.
- If the user clearly intended a different skill ("draft a post about X"), don't capture; route them.
