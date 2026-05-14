---
name: study
pack: vocab
description: Daily review session — show due cards, collect ratings, advance the schedule
command: true
triggers:
  - study
  - review words
  - vocab session
  - 背单词
  - 复习
---

# Study

Walk the user through today's due cards (and a small handful of new ones), collect Again/Hard/Good/Easy ratings, advance the schedule.

## Goal

Complete one focused session: up to `daily_target` cards (default 15). Log every rating into `reviews`. Update each card's `interval_index` and `next_due`.

## Procedure

1. **Load the queue**
   Use the `db` tool to pull:
   - Due cards: `SELECT * FROM cards WHERE next_due <= date('now') AND status != 'mastered' ORDER BY next_due, id LIMIT ?` (limit = daily_target).
   - If the due pool is empty, top up with new cards: `WHERE status = 'new' LIMIT ?`.

2. **Empty queue**
   - If both are empty, say: "Nothing due today. Want me to generate 10 new cards at your level?" — only generate on user confirmation.

3. **Quiz loop** (per card)
   - Show the front: `word` + `ipa` (no definition).
   - Ask the user to recall (free-text or "show").
   - On "show" (or after their guess), reveal `def_zh`, `def_en`, `example_en`.
   - Ask for a rating with `msg` `type: "keyboard"`: Again / Hard / Good / Easy.

4. **Advance the schedule**
   Read the active interval curve once at session start:
   - `SELECT days_csv FROM intervals WHERE id = (SELECT v FROM user_state WHERE k = 'active_interval_id')`.
   - Parse `days_csv` into an array `D = [d0, d1, ...]`.

   For each rating:
   - **Again**: `interval_index = 0`, `lapses += 1`, `next_due = date('now', '+1 day')`, `status = 'learning'`.
   - **Hard**: keep `interval_index` (re-show at same step), `next_due = date('now', '+' || D[interval_index] || ' days')`.
   - **Good**: `interval_index = min(interval_index + 1, len(D) - 1)`, `next_due = date('now', '+' || D[interval_index] || ' days')`, `status = 'review'`.
   - **Easy**: `interval_index = min(interval_index + 2, len(D) - 1)`, same `next_due` math. If at the last step, mark `status = 'mastered'`.

   Log the rating:
   ```json
   {
     "action": "practice",
     "skill_type": "vocab.study.review",
     "content": "<word>",
     "metadata": "{\"card_id\":42,\"result\":\"good\",\"response_ms\":3200}"
   }
   ```

5. **End-of-session summary**
   - "Reviewed 12 cards. 8 good, 2 hard, 2 again. Next session: tomorrow 08:00."
   - Increment `user_state.total_reviewed`.

## Rules

- Never skip the rating step — even a quick "good" is needed to advance.
- One card per turn; let the user breathe.
- If the user types "stop" or "later", end gracefully and update the session count even if partial.
- Don't reveal the def_zh / def_en before they make at least one guess (or explicitly say "show").
