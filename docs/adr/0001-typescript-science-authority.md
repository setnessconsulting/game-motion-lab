# ADR 0001 — TypeScript pure package is the sole scientific authority

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)
- **Supersedes:** none

## Context

The Epic requires that scientific truth never originate in the renderer. A browser game has three
plausible places a "scientific answer" could come from: a JavaScript/TypeScript domain model, a
physics engine embedded in the renderer, or the rendered visual state itself. Only the first can be
made deterministic, testable, replayable, and reviewable independently of a browser.

## Decision

1. **All scientific authority lives in a pure TypeScript package** (`src/science` + `src/domain`).
   It has no dependency on React, Phaser, the DOM, browser storage, or the network.
2. Authoritative values are computed from **analytical mechanics** (see
   [`../SCIENCE_MODEL.md`](../SCIENCE_MODEL.md)), not from numerical integration or an engine.
3. The renderer and the React UI are **read-only consumers** of this authority. They may format
   values for display; they may not compute, round into, or otherwise alter an authoritative value.
4. The boundary is **executably enforced** (import-boundary lint + architecture tests + a
   no-DOM-globals test), not merely documented.

## Consequences

- Scientific behaviour is unit-testable, golden-testable, and property-testable without a browser.
- Any future second renderer, host, or integration consumes the same authority and cannot fork it.
- Some visual effects that would be "free" in a physics engine must be authored as presentation
  over authoritative state. This is accepted: it is the price of a reviewable science contract.
- Introducing a physics engine as a scientific authority would require superseding this ADR with an
  owner decision.
