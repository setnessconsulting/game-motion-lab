# ADR 0003 — Analytical 1D mechanics over a general-purpose rigid-body engine

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)
- **Relates to:** [ADR 0001](0001-typescript-science-authority.md)

## Context

The v1 curriculum is a bounded set of controlled, one-dimensional, constant-net-force
investigations. A rigid-body engine (Phaser Arcade Physics, Matter.js, Rapier, or equivalent) is
designed for plausible interactive simulation, not for authoritative measurement: its results
depend on timestep, substeps, solver iterations, and iteration order, and it exposes no stable
closed-form trajectory. A learner measurement must be reproducible to the bit and reviewable by a
science reviewer.

## Decision

1. Motion is evaluated with **closed-form analytic mechanics** wherever the net force is constant:
   `a = Fnet/m`, `v(t) = v0 + a·t`, `x(t) = x0 + v0·t + ½·a·t²`.
2. Where a scenario needs more than one force regime, it is expressed as **piecewise-constant
   segments** evaluated analytically with continuous boundary conditions.
3. **No physics engine, collision outcome, or numerical integrator may produce an authoritative
   value** — not as a cross-check that overrides the analytic result, and not as a fallback.
4. Scenarios requesting an unsupported force model (velocity-dependent drag, static-friction
   transitions) **fail closed**. The kernel never silently approximates with a numerical method.
5. Decorative motion that is not authoritative is permitted only when it is deterministic where it
   matters, removable under reduced motion, and structurally incapable of changing a science
   result.

## Consequences

- Trajectories are exactly reproducible, diffable, golden-testable, and human-reviewable.
- The renderer's frame rate cannot influence science: there is no simulation loop to desynchronise.
- Scenario authors must express physics declaratively; this is a constraint on content authoring
  that is accepted in exchange for reviewability.
- Expanding into multi-dimensional, rotational, or collision curriculum would require a new
  decision and is explicitly out of v1 scope (see [`../CURRICULUM.md`](../CURRICULUM.md)).
