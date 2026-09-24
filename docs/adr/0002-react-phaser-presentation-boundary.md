# ADR 0002 — React and Phaser are presentation only, coupled through a typed view model and bounded intents

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)
- **Relates to:** [ADR 0001](0001-typescript-science-authority.md)

## Context

The game needs both an accessible semantic interface (instructions, controls, notebook, tables,
graphs, claims) and a high-quality real-time 2D laboratory presentation. Building either one as the
"real" application would make the other a second, competing authority, and would put science
correctness inside a canvas.

## Decision

1. **React** owns the semantic application surface: mission UI, experiment controls, prediction,
   instruments readout, evidence notebook, trial tables, SVG graphs and their semantic table
   equivalents, claim/evidence interaction, settings, and error/recovery states.
2. **Phaser** owns 2D lab presentation: track, cart, trajectory playback, force arrows, camera
   emphasis, particles, transitions, and bounded feedback.
3. They are coupled only through a **`SceneModel`-style typed view model** (a read-only projection
   of authoritative state) and a **`SceneIntent`-style bounded intent** (a typed request the host
   validates before it can become an engine action or a presentation-only effect).
4. Renderer callbacks, animation-completion events, and duplicate/missed frames cannot advance the
   game. Only a validated intent can.
5. A remount or a renderer restart reconstructs the view from authoritative state.
6. Nothing scientific is duplicated in either surface: the graph series, instrument values, and
   trial records are computed once in the domain and projected.

## Consequences

- The same experiment is fully playable without the renderer, which satisfies the Epic's graceful
  degradation and accessibility requirements by construction rather than by extra scaffolding.
- Presentation quality and accessibility can evolve independently of the science contract.
- Every renderer interaction that affects the game must be expressible as a bounded intent; ad-hoc
  renderer-to-state shortcuts are rejected in review.
