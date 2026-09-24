# ADR 0006 — Frozen technology baseline and change process

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)

## Context

The Epic fixes a stack rather than leaving it to each implementation issue. A drifting stack makes
the architecture boundary, the performance baseline, and the release identity meaningless, because
none of them can be compared across issues.

## Decision

The baseline is frozen:

| Concern | Choice |
| --- | --- |
| language | TypeScript (strict) |
| application shell | React 19 |
| build | Vite |
| renderer | Phaser **4.2.1** (pinned exactly) |
| graphs and inspectable visualizations | semantic HTML + SVG authored in React |
| unit/contract/property/golden tests | Vitest |
| browser/E2E/real-render | Playwright |
| accessibility | axe-core (assistive, not authoritative) + manual review |
| design authority | Figma, once a real production handoff exists |
| audio | browser-native / Web Audio, local static assets |
| CI | credential-free; authoritative checks run locally first |

Version policy: React and Vite follow their current major; Phaser is pinned to exactly `4.2.1`; a
dependency may be added only if it does not create a second science authority, a learner-data
transmission path, a remote asset dependency, or a large unmeasured bundle cost.

## Change process

A baseline change requires:

1. a documented implementation finding that the frozen choice is materially wrong (not merely
   inconvenient);
2. a `DECISIONS.md` entry with the Jira reference;
3. owner authorization where the change is architectural or affects learner privacy, the science
   authority, or release identity;
4. re-measurement of the affected performance baseline, because budgets are compared against a
   pinned baseline.

Without all four, the frozen baseline stands and the implementation adapts to it.

## Consequences

- Performance deltas are comparable across ML-02 through ML-14 because the runtime is stable.
- The science boundary stays enforceable because no second runtime can be introduced quietly.
- If GAME-387 (ML-DESIGN) or later work genuinely needs a different tool, it must follow the change
  process above rather than adding a tool that bypasses it.
