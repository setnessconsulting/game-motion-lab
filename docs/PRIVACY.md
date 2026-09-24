# Motion Lab — privacy and safety posture

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Decision record:** [ADR 0005](adr/0005-local-first-no-learner-telemetry.md).

Motion Lab serves children aged 11–14. The runtime is **local-first** and collects nothing from the
learner.

## 1. Prohibited in the learner runtime

| Prohibited | Note |
| --- | --- |
| Accounts, login, profiles | No identity is required or captured |
| Advertising or marketing trackers | None, in any form |
| Remote learner telemetry / analytics SDKs | Including "performance-only" SDKs |
| Runtime LLM or AI-service calls | Grading and feedback are authored and deterministic |
| Remote upload of answers, claims, trials, or traces | No learner work leaves the browser |
| Browser storage of personal data | Session state is in-memory only |
| Loot boxes, gacha, gambling-adjacent mechanics | Prohibited |
| FOMO / streak pressure / limited-time pressure | Prohibited |
| Leaderboards or child-vs-child competition | Prohibited |
| Social, chat, or user-generated content | Out of scope |
| Third-party runtime asset CDNs | Assets are same-origin and static |

## 2. What the runtime may do

- Load its own same-origin static assets (HTML, JS, CSS, images, audio).
- Compute everything locally.
- Keep an in-memory session and in-memory trial history that is discarded when the page is closed.
- Read no device sensor, no location, no clipboard, and no camera/microphone.

There is **no backend**, no user-data processor, and no server-side learner record.

## 3. Persistence

v1 requires no persistence to complete a mission. If a future story introduces local persistence
(for example, resuming a session), it must be:

- opt-in and clearly explained to the learner;
- local-only (no transmission);
- free of personal data;
- clearable by the learner;
- authorized by a `DECISIONS.md` entry.

Personal records such as a local best time, if ever added, are module-scope memory or local-only
storage and never a ranking against another child.

## 4. Network boundary and assertions

Qualification asserts the actual behaviour, not just the intent:

- **No unintended runtime learner-data transmission.** A qualified browser flow records all network
  activity and fails on any request other than the same-origin static asset loads the game needs.
- **No analytics/beacon** (`navigator.sendBeacon`, pixel beacons, third-party scripts).
- **No dynamic remote code or config fetch** at runtime.
- **No service worker** that could introduce an unnoticed network path, unless a future story
  authorizes one explicitly with an offline rationale.

## 5. Performance evidence without telemetry

Because learner telemetry is prohibited, performance evidence is collected **during development and
qualification** using lab tooling and browser instrumentation, tied to the exact commit
([`PERFORMANCE.md`](PERFORMANCE.md)). Field metrics that require public traffic (for example INP
from a Chrome UX Report sample) are recorded as **unknown / pending** rather than fabricated, and
laboratory metrics are always labelled as lab metrics.

## 6. Evidence and human-review hygiene

- Human/playtest/accessibility records contain **no child names or other personal data**; they record
  environment, date, observations, and the exact candidate identity.
- Comparator observations are recorded the same way.
- No secret, token, credential, or private export is committed to this repository.

## 7. Change control

Any change that adds a network path, a persistence layer, an account, a tracker, an AI call, or a
competitive mechanic is a **privacy-contract change**. It requires an owner decision, a
`DECISIONS.md` entry, and a re-run of the network/privacy assertion before any release claim. It may
not be introduced as a side effect of a feature story.
