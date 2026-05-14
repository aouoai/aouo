---
name: report
pack: vocab
description: Weekly progress report — cards reviewed, lapses, mastered words, streak
command: true
triggers:
  - vocab report
  - progress
  - 学习进度
  - 周报
---

# Report

Surface the past week's vocab progress in a compact summary.

## Goal

In one message, show: cards reviewed, lapses, mastered words, streak, and 1-2 actionable notes.

## Procedure

1. **Aggregate counts**
   Use the `db` tool to run:
   - `SELECT COUNT(*) FROM reviews WHERE reviewed_at >= datetime('now','-7 days')` → reviewed_this_week
   - `SELECT result, COUNT(*) FROM reviews WHERE reviewed_at >= datetime('now','-7 days') GROUP BY result` → distribution
   - `SELECT COUNT(*) FROM cards WHERE status = 'mastered'` → mastered_total
   - `SELECT COUNT(*) FROM cards WHERE next_due <= date('now') AND status != 'mastered'` → due_today
   - `SELECT COUNT(DISTINCT date(reviewed_at)) FROM reviews WHERE reviewed_at >= datetime('now','-30 days')` → days_active_30d
   - `SELECT word_id, COUNT(*) AS again_count FROM reviews WHERE reviewed_at >= datetime('now','-14 days') AND result = 'again' GROUP BY card_id HAVING again_count >= 3` → recent stumbles (look up word strings)

2. **Compute streak**
   - Walk back from today: longest consecutive run of days with ≥1 review.

3. **Format the summary**
   Example layout:
   ```
   ## This week
   - Reviewed: 87 cards (12/day average)
   - Distribution: 60 good · 18 hard · 7 again · 2 easy
   - Mastered: 14 total (+3 this week)
   - Due today: 11
   - Streak: 5 days

   ## Stumbles to watch
   - "ostensibly" — 4 again in last 14d
   - "obfuscate" — 3 again
   ```

4. **One actionable nudge**
   - If `due_today > daily_target * 2`: suggest a longer session today.
   - If streak ≥ 7: brief acknowledgement.
   - If `days_active_30d < 10`: gentle nudge — "Want me to adjust your daily target lower so it sticks?"

## Rules

- One message — don't paginate or recap multiple weeks.
- Don't moralize. State numbers, give one nudge, stop.
- If the user has zero reviews, say so plainly and route to `study` or `assess`.
