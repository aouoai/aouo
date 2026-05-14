---
name: prompt-me
pack: create
description: Evening proactive prompt — surface fresh thoughts the user might want to capture
command: false
---

# Prompt Me

Cron-triggered (default 21:00). Reach out and capture anything noteworthy from the user's day before it fades.

## Goal

In 1-3 turns, surface and file at least one usable material entry. Be useful, not naggy.

## Procedure

1. **Pick an opener** (rotate; check MEMORY.md to avoid repeating yesterday's wording)
   - "What stood out for you today — anything worth posting about?"
   - "Quick check-in: anything interesting happen worth saving?"
   - "How did today land? Any one thing you'd want to remember out loud?"
   - For users with a 小红书 / lifestyle bent: "Anything you wore / ate / saw today worth a post?"

2. **Listen + minimal follow-up**
   - If the user replies substantively, ask one (max two) follow-up question to thicken the material — context, why it mattered, who said what.
   - If the user shrugs ("nothing much"), accept it. Don't push. End the turn warmly.

3. **File as material**
   - Funnel the response through the `capture` skill's persist shape:
     ```json
     {
       "action": "practice",
       "skill_type": "create.prompt-me",
       "content": "<the user's reply, lightly cleaned up>",
       "tags": "[\"daily\"]",
       "metadata": "{\"kind\":\"text\",\"prompted\":true}"
     }
     ```

4. **Close**
   - Acknowledge briefly. If the captured material looks especially post-worthy, offer: "I can draft a post from this when morning-draft runs — or now if you want."

## Rules

- Maximum 3 turns. Capture-then-close.
- Never lecture. The user is volunteering — don't critique or extend.
- If the user is clearly busy or terse, end after one turn.
