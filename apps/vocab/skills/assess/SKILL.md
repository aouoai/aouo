---
name: assess
pack: vocab
description: CEFR placement test — 30 questions, estimate level, seed initial deck
command: true
triggers:
  - vocab assess
  - placement
  - test my level
  - 测试水平
  - 评估等级
---

# CEFR Placement Assessment

Place the user on the A2 / B1 / B2 / C1 spectrum, then build their initial card deck.

## Goal

Run a 30-question quiz, compute a CEFR level, persist it, and seed 20 starter cards from that level.

## Procedure

1. **Start a run**
   Use the `db` tool to read the 30 rows from `assessment_items` and the `persist` tool to open a run:
   ```json
   {
     "action": "practice",
     "skill_type": "vocab.assess.start",
     "content": "Assessment started",
     "metadata": "{\"target_count\":30}"
   }
   ```

2. **Ask questions**
   - Iterate items in order: A2 (10) → B1 (10) → B2 (6) → C1 (4).
   - Use the `msg` tool with `type: "quiz"` to render each as a Telegram-native multiple-choice (4 options).
   - Track answers in memory: per-level correct count.

3. **Adaptive shortcut** (optional)
   - If the user scores 0/3 in a level's first 3 items, skip the rest of that level — they're below it. Drop straight to closing.
   - If they score 9-10/10 in A2 AND 8-10/10 in B1, you can shorten B2 to its first 3 items and C1 to its first 2 to save time. Use judgment.

4. **Compute level**
   - Highest level where they got ≥60% correct → that's their CEFR level.
   - Ties resolve down (be conservative).

5. **Persist result**
   ```json
   {
     "action": "practice",
     "skill_type": "vocab.assess.complete",
     "content": "Placed at <level>",
     "metadata": "{\"cefr_level\":\"B1\",\"scores\":{\"A2\":\"9/10\",\"B1\":\"7/10\",\"B2\":\"2/6\",\"C1\":\"0/4\"}}"
   }
   ```
   Also write `user_state` row `cefr_level = <level>` and `last_assessed_at = now`.

6. **Seed initial deck**
   - Generate 20 high-frequency words appropriate to the placed level (avoid obviously below-level words).
   - For each word, fill `words` row with: word, cefr_level, ipa, def_en, def_zh, one example_en, one example_zh.
   - For each word, insert a `cards` row with `status='new'`, `next_due=date('now')`.
   - This is a batched LLM operation — generate all 20 at once if context allows; otherwise loop in batches of 5.

7. **Wrap up**
   - Tell them: "You're at <level>. I've seeded 20 starter cards — first session at 08:00 tomorrow, or say 'study' now."
   - Briefly mention the interval curve they can customize later.

## Rules

- Never grade items leniently — the level matters for what they'll see for weeks.
- Never reveal correct answers mid-quiz; defer feedback to the wrap-up if asked.
- Generated word entries should be real, common, and not obviously easier than the placed level.
