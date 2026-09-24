# Motion Lab — architecture

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Decisions:** [`adr/`](adr/). **Machine-readable decision register:**
[`../contracts/decisions.v1.json`](../contracts/decisions.v1.json).

## 1. The one law

> **Scientific truth must never come from the renderer.**

Everything below exists to make that law mechanically enforceable rather than aspirational.

## 2. Authority flow

```text
science constants / scenario definitions      (content: pure data + pure TS)
                |
                v
deterministic analytical 1D physics kernel    (science: pure TS, no DOM/React/Phaser/storage/network)
                |
                v
experiment + evidence engine                  (domain: pure TS; trials, controls, evidence, claims)
                |
                v
typed game state / view model                 (view-model: pure TS, JSON-safe, renderer-independent)
          /                         \
   React + SVG                   Phaser
   UI, graphs, tables            presentation
          \                         /
        bounded intents  ->  engine  (validated; renderer cannot bypass)
```

Data flows **down** as read-only projections. Control flows **up** only as bounded, typed intents
that the engine validates against the same rules a keyboard-driven intent would face. There is no
path by which a renderer callback mutates authoritative state directly.

## 3. Package boundaries

The repository is partitioned so that the boundary is a build-time fact, not a convention.

| Package / directory | May import | Must never import | Owns |
| --- | --- | --- | --- |
| `src/science` | nothing from the app | React, Phaser, DOM, `window`, `document`, storage, `fetch`, `XMLHttpRequest`, Node built-ins | units, force composition, net force, trajectories, `stateAt(t)`, sampling, validation, display rounding |
| `src/domain` (experiment/evidence) | `src/science`, `src/content` types | React, Phaser, DOM, storage, network | missions, variables/controls, trial identity, immutable trial records, measurements, evidence, claims, scoring, debrief facts, deterministic seeds/replay |
| `src/content` | `src/science` types, `src/domain` types | React, Phaser, DOM | canonical scenario definitions, provenance manifests, golden fixtures, mission copies |
| `src/viewmodel` | `src/science`, `src/domain` | Phaser, DOM | JSON-safe projections, graph series, instrument readouts, semantic table data |
| `src/ui` (React) | `src/viewmodel`, `src/domain` intents | Phaser internals; `src/science` computation of answers | semantic shell, mission UI, experiment controls, notebook, tables, graphs, accessible equivalents, settings, error/recovery |
| `src/renderer` (Phaser) | `src/viewmodel` read-only, bounded presentational events | `src/science` computation, `src/domain` mutation, storage, network | lab scene, cart/track, playback of authoritative trajectories, force arrows, camera emphasis, particles, bounded feedback |
| `src/host` | `src/ui`, `src/renderer`, `src/domain` | — | application bootstrap, renderer lifecycle, error boundary, reduced-motion handling |
| `tests/` | everything | — | unit, property, golden, architecture-boundary, and browser tests |

Enforcement (delivered by ML-02, not by this document):

1. **Import-boundary lint** — an ESLint restriction (or equivalent) that fails a build when a
   science/domain module imports a renderer/browser module.
2. **Architecture tests** — Vitest tests that read the module graph and assert the forbidden edges
   are absent, so the rule is checked in CI and locally.
3. **No DOM globals in the core** — a test that imports the science/domain entry points in a
   non-DOM Vitest environment and asserts they evaluate without touching `window`/`document`.

A prose statement of a boundary that has no executable check does not satisfy this contract.

## 4. React responsibilities

React owns the semantic, accessible application surface and **renders authoritative state**; it
does not compute the physics answer.

- mission instructions and the mission question;
- prediction capture;
- experiment setup controls and variable selection;
- instrument readouts (display-formatted from authoritative values);
- evidence notebook, trial cards, trial tables;
- position-time and velocity-time graphs (SVG/DOM) and their semantic table equivalents;
- claim/evidence interaction;
- settings, loading, error, and recovery states;
- accessible equivalents for anything the renderer shows.

## 5. Phaser responsibilities

Phaser owns high-quality 2D presentation and nothing scientific.

- laboratory environment, track, cart;
- playback of the authoritative trajectory (sampling `stateAt(t)` from the kernel);
- force-arrow presentation;
- highlights, camera emphasis, particles, transitions, bounded visual feedback;
- responsive scaling and reduced-motion alternatives;
- renderer init/failure reporting to the host.

Phaser does **not** own: physics truth, measurements, trial validity, scoring, evidence, mission
correctness, graph data, or authoritative timing.

## 6. Renderer failure and graceful degradation

If the Phaser renderer fails to initialize, throws at runtime, or loses its WebGL context:

1. the host catches the failure and moves the renderer region into a **semantic fallback** panel;
2. the fallback shows the same numbers (position, velocity, acceleration, net force, elapsed time)
   as readable text plus a static trajectory table for the current trial;
3. experiment state is untouched: the same trial can be re-run, measured, recorded, compared,
   graphed, and used as evidence;
4. the learner is told plainly that the 3D/animated view is unavailable and that the investigation
   continues normally;
5. the failure is not presented as a scientific result, and it never changes a measurement.

## 7. Technology baseline (frozen)

| Layer | Technology | Notes |
| --- | --- | --- |
| language | TypeScript (strict) | `strict` + `noUncheckedIndexedAccess`; no `any` in science/domain |
| app shell | React 19 | semantic HTML, no physics computation |
| build | Vite | static build, relative base by default so the artifact can be mounted under a versioned prefix |
| renderer | Phaser 4.2.1 | pinned exactly |
| graphs/visualization | SVG + DOM authored in React | no charting framework that hides geometry from semantics |
| unit/contract tests | Vitest | |
| browser/E2E/real-render | Playwright | at least one lane exercises the real Phaser renderer |
| accessibility | axe-core plus manual review | automated checks never replace manual evidence |
| design authority | Figma | production authority once a real handoff exists (ML-DESIGN) |
| audio | browser-native / Web Audio | local/static assets only |
| CI | credential-free, local-first | hosted CI runs the same commands that run locally |

**Prohibited without a Jira-authorized architecture change and a `DECISIONS.md` entry:** Unity,
Babylon.js, Rive runtime, Blender runtime 3D, a backend service, Supabase, an analytics SDK, an LLM
runtime, a telemetry SDK, or any other major framework. Phaser Arcade Physics / Matter.js /
Rapier may not be introduced as a scientific authority under any circumstance.

## 8. Determinism discipline

- Randomness is injected, seeded, and recorded; never ambient.
- Time is injected at the host boundary; tests supply explicit timestamps.
- Authoritative state is JSON-safe and renderer-independent, so it can be snapshotted, replayed,
  diffed, and golden-tested.
- A remount or refresh reconstructs the view from authoritative state; the renderer is never a
  source of truth to be reconstructed *from*.

## 9. Content/data location

Canonical scenario definitions and their provenance manifests are checked into the repository as
data (ML-05). No scenario, mission, measurement, or scientific value may be fetched at runtime
from a remote service, and no scenario may be authored inside a React component or a Phaser scene.
