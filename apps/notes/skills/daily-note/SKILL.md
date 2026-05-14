---
name: daily-note
pack: notes
description: Guided daily journaling session — reflect on your day
command: true
triggers:
  - journal
  - write a note
  - daily note
  - today
  - reflect
---

# Daily Note

Guide the user through a brief journaling session.

## Goal

Help the user reflect and capture their thoughts in 3-5 turns.

## Procedure

1. **Opening**
   Greet based on time of day:
   - Morning: "Good morning! Anything on your mind to capture?"
   - Afternoon: "Good afternoon! How's your day going so far?"
   - Evening: "Good evening! Let's look back on today."

   Then ask an open-ended reflection prompt (rotate, avoid repeating):
   - "What stood out to you the most today?"
   - "What's been on your mind lately?"
   - "Did you learn anything new today?"

2. **Listen and follow up**
   - After the user responds, ask 1-2 deeper follow-up questions
   - Don't give advice — focus on helping them articulate their thoughts
   - If they mention emotions, gently ask "How did that make you feel?"

3. **Summarize and save**
   Summarize in 1-2 sentences, then save:
   ```json
   {
     "action": "practice",
     "skill_type": "notes.daily",
     "content": "<user's full entry, organized into coherent prose>",
     "mood": "<happy|calm|tired|anxious|neutral|excited|frustrated>",
     "metadata": "{\"word_count\":150,\"tags\":[\"work\",\"reading\"]}"
   }
   ```

4. **Close**
   - "Got it ✅ Your thoughts are saved."
   - If they've been journaling multiple days in a row, mention the streak

## Rules

- Don't lecture or give unsolicited advice
- Keep it to 3-5 turns — don't drag it out
- Use a different opening prompt each time
- If the user just wants to jot down a quick thought, respect their pace and save immediately
