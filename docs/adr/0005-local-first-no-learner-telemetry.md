# ADR 0005 — Local-first learner runtime with no learner telemetry

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)

## Context

The audience is children aged 11–14. The Epic prohibits learner accounts, advertising trackers,
remote learner telemetry, runtime LLM calls, and remote upload of learner claims or trial traces.
At the same time the Epic requires performance evidence and a privacy assertion that no learner
data is transmitted.

## Decision

1. **The learner runtime is local-first and offline-capable after load.** The production build is a
   static bundle; the game performs no learner-data network transmission.
2. Prohibited in the learner runtime: accounts, ads/trackers, remote learner telemetry, analytics
   SDKs, runtime LLM calls, remote upload of answers/claims/trials, loot boxes, FOMO timers, streak
   pressure, leaderboards, and child-vs-child competition.
3. **No third-party browser observability SDK** may be added merely to measure performance.
   Performance evidence is collected during development and qualification
   ([`../PERFORMANCE.md`](../PERFORMANCE.md)).
4. Any in-memory event record is module-local and never transmitted; it is not persisted to
   browser storage.
5. If any persistence is later introduced (for example a session resume), it is opt-in, local-only,
   clearable, and free of personal data; adding it requires a `DECISIONS.md` entry.
6. Network assertions are part of qualification: a qualified flow must show **no unintended
   runtime learner-data transmission**. A deliberate, credential-free static asset fetch of
   same-origin game assets is not learner data.
7. Human/playtest evidence must not record child names or other personal data.

## Consequences

- Performance and fun evidence must come from development-time measurement and human review, not
  from field telemetry. Field metrics such as INP remain explicitly *unknown/pending* rather than
  fabricated.
- The product can be hosted as immutable static assets with no backend and no user data processor.
- Any future analytics request is a privacy-contract change requiring an owner decision, not a
  technical tweak.
