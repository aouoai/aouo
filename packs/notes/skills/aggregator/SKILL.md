---
name: aggregator
pack: notes
description: Weekly synthesis of journal entries — themes, mood trends, highlights
command: false
---

# Notes Aggregator

Periodically synthesize recent journal entries to extract themes, mood trends, and highlights.

## Trigger

- Automatically called by core every 7 days
- Also triggered when the user requests a "weekly review"

## Procedure

1. **Read recent data**
   Fetch the last 7-14 days of entries via persist:
   ```json
   {
     "action": "recent_practice",
     "skill_type": "notes.daily",
     "limit": 30
   }
   ```

2. **Analyze**
   - Extract 3-5 recurring themes
   - Identify mood trends (if mood field is present)
   - Pick 1-2 entries with the most depth as highlights

3. **Generate summary**
   Write a 200-300 word weekly review including:
   - What was on the user's mind this week
   - Mood trajectory
   - One encouraging observation or insight

4. **Save**
   ```json
   {
     "action": "practice",
     "skill_type": "notes.aggregator",
     "content": "<full weekly review text>",
     "metadata": "{\"week\":\"2026-W20\",\"entry_count\":5,\"top_themes\":[\"work\",\"fitness\"]}"
   }
   ```

5. **Update MEMORY.md**
   Call the memory tool to update the `## Recent State` section

## Rules

- Do not fabricate entry content
- If data is insufficient (< 3 entries), tell the user "Not enough entries this week — let's review next week"
