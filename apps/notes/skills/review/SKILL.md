---
name: review
pack: notes
description: Review past journal entries — search, browse, and reflect
command: true
triggers:
  - review
  - look back
  - past entries
  - history
  - browse notes
---

# Review

Help the user browse and reflect on past journal entries.

## Goal

Let the user search, browse, and revisit previous notes.

## Procedure

1. **Determine scope**
   Ask what they want to see:
   - "Want to see recent entries, or a specific time period?"
   - If they mention a keyword, search by that keyword

2. **Fetch entries**
   ```json
   {
     "action": "recent_practice",
     "skill_type": "notes.daily",
     "limit": 10
   }
   ```

3. **Display**
   - List entry summaries (date + first 50 chars + mood emoji)
   - Let the user pick one to read in full
   - Mood emoji map: happy→😊 calm→😌 tired→😴 anxious→😰 neutral→😐 excited→🤩 frustrated→😤

4. **Reflection prompt** (optional)
   If the user reads multiple entries, offer:
   - "Looking back at these, any new thoughts?"
   - "Notice any recurring themes?"

## Rules

- Present entries faithfully — don't edit or embellish
- If no entries found, say "No entries yet — want to write one now?"
