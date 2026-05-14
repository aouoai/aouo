---
name: add
pack: vocab
description: Manually add a word to the deck
command: true
triggers:
  - add word
  - 加单词
  - 添加单词
  - learn this word
---

# Add Word

Insert a user-supplied word into the deck, with LLM-filled definitions and example.

## Goal

Take a bare word from the user, enrich it, and queue it as a new card.

## Procedure

1. **Identify the word**
   - If the user typed exactly one word, use it.
   - If they typed a phrase ("learn this word: pristine"), extract the target token.
   - If multiple words ("ubiquitous, pristine, candid"), confirm: "Add all three?" — proceed only on a clear yes.

2. **Check duplicates**
   - `SELECT id, cefr_level FROM words WHERE word = ?` — if exists, tell the user and ask if they want to reset its schedule (rare path; usually skip).

3. **Enrich with LLM**
   Generate in one call:
   - CEFR level estimate (A2 / B1 / B2 / C1 / C2)
   - IPA pronunciation
   - One short English definition
   - One short Chinese definition
   - One natural example sentence in English
   - One Chinese translation of that example

4. **Insert + queue**
   - Insert into `words`.
   - Insert into `cards` with `status='new'`, `next_due=date('now')`, `interval_index=0`.

5. **Acknowledge**
   - "Added **<word>** (~<level>). I'll surface it in your next session."
   - Show the def_zh + example to confirm.

## Rules

- Don't invent obscure or archaic words — if the user-supplied token isn't a real, modern English word, ask for confirmation before adding.
- Keep the example sentence natural and short (≤ 15 words).
