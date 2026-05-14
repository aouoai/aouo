# Five Pillars

Every serious aouo pack should implement these five pillars to behave like a vertical agent app instead of a prompt bundle.

## 1. Long-Term Memory

The agent remembers the user across weeks and months:

- **USER.md** — Stable facts: name, goals, schedule, preferences
- **MEMORY.md** — Evolving state: current level, strategy, coaching notes
- **Pack database** — Granular records: every practice session, score, timestamp

## 2. Proactive Outreach

The agent reaches out to the user:

- Morning reminders, nudges after missed sessions
- Weekly progress reports, monthly aggregation summaries
- Powered by the built-in cron system with per-pack job definitions

## 3. Multi-Skill System

Each pack provides 8–30 specialized skills:

- Not one generic prompt, but deep vertical coverage
- Skills have their own state machines, scoring rubrics, and UI flows
- Users navigate via menus (fast-path) or natural language

## 4. Data Closed-Loop

Every interaction feeds back:

```
Practice → Score → Update MEMORY → Inform next session
```

The persist API ensures structured data. The aggregator synthesizes insights.

## 5. Built-in Assessment

Two mandatory skills every pack must provide:

- **Onboarding** — Initial diagnostic to establish a baseline
- **Aggregator** — Periodic review that synthesizes progress
