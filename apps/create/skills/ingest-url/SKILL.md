---
name: ingest-url
pack: create
description: Fetch a URL, extract key points, and file as material
command: true
triggers:
  - ingest url
  - save this link
  - read this article
  - 存这个链接
---

# Ingest URL

The user has shared a URL. Fetch it, distill it, and file it as material for later drafting.

## Goal

Turn a link into a digested material entry in one round.

## Procedure

1. **Identify the URL**
   - If the user message contains exactly one URL, use it.
   - If multiple, ask which one (only when ambiguous).

2. **Fetch & summarize**
   - Use the `web_search` tool with the URL as a query, or directly fetch + summarize if the URL is present.
   - Extract: title, 3-5 key bullet points, the author/source if visible.

3. **Why it caught their eye**
   - Briefly ask the user: "What about this caught your attention?" (1-2 short sentence reply expected)
   - Their reaction is more valuable than the article summary for later draft generation — store it in `metadata.reaction`.

4. **Save**
   Use the `persist` tool:
   ```json
   {
     "action": "practice",
     "skill_type": "create.ingest-url",
     "content": "<title>\n\n<3-5 bullet summary>",
     "tags": "[\"<topic>\"]",
     "metadata": "{\"kind\":\"url\",\"source_url\":\"<url>\",\"reaction\":\"<user's one-line reaction>\",\"summary\":\"<one-line digest>\"}"
   }
   ```

5. **Confirm**
   - One line: "Saved. I'll surface it next time I draft a post." Mention the topic tag.

## Rules

- Never quote more than a few sentences verbatim from the source — distill into bullets.
- If the fetch fails or content is paywalled, ask the user to paste the relevant excerpt; capture as `kind = 'text'` with `source_url` metadata.
- Don't generate a draft here — that's `draft-post`'s job.
