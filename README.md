# Motion Lab

Motion Lab is a browser-first, mission-based middle-school physical-science game in which the
learner works as a junior motion engineer. The learner solves engineering missions by designing
**controlled experiments**, collecting measurements, comparing evidence, interpreting motion
graphs, and supporting a claim with cited evidence.

The game teaches one bounded slice of **NGSS MS-PS2-2**: how a change in motion depends on the net
force on an object and on the object's mass, investigated one independent variable at a time in
one-dimensional inertial motion.

## Authority

| Concern | Authority |
| --- | --- |
| Scope, work, sequencing, blockers, acceptance | **Jira GAME-382** (Epic) and its child stories |
| Source, tests, science/domain contracts, content fixtures, assets, build config, release evidence | **this repository** (`setnessconsulting/game-motion-lab`, `main`) |
| Public hosting, catalog, immutable promotion pointer, rollback | `setnessconsulting/games-site` |
| LevelBest integration | **explicitly out of scope** for GAME-382 |

Jira GAME-382 is the single canonical implementation authority for the standalone game and its
games-site release. Every document in this repository cross-references GAME-382 or the child issue
that froze it. This repository never treats Jira prose as a substitute for the local contracts
under [`docs/`](docs/) and [`contracts/`](contracts/).

## Architectural law

**Scientific truth never comes from the renderer.**

```text
science constants / scenario definitions
                |
                v
deterministic analytical 1D physics kernel      (pure TypeScript, no DOM/React/Phaser)
                |
                v
experiment + evidence engine
                |
                v
typed game state / view model
          /               \
   React + SVG           Phaser
   UI, graphs, tables    presentation
          \               /
          bounded intents
                |
                v
             engine
```

Phaser Arcade Physics, Matter.js, Rapier, collision results, sprite positions, pixel geometry,
animation timing and raw frame deltas are **presentation only**. They may never determine a
learner measurement, a trial's validity, a score, an evidence relationship, graph data, or a
scientific explanation. The renderer asks the kernel *"what is the authoritative cart state at
t = 2.4 s?"*; it never infers the answer from what the sprite appeared to do.

## Frozen stack

TypeScript (strict) · React 19 · Vite · **Phaser 4.2.1** (pinned exactly) · semantic HTML and SVG for
inspectable science graphs · Vitest · Playwright · axe-core · Figma as production design authority ·
browser-native audio / Web Audio. Credential-free, local-first CI. See
[`docs/adr/0006-frozen-technology-baseline.md`](docs/adr/0006-frozen-technology-baseline.md).

## Documentation index

The documentation index of record is [`docs/README.md`](docs/README.md). Start there.

| Document | Covers |
| --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | vision, learner/grade scope, session shape, non-goals |
| [`docs/CURRICULUM.md`](docs/CURRICULUM.md) | NGSS MS-PS2-2 mapping and the explicit v1 assessment boundary |
| [`docs/SCIENCE_MODEL.md`](docs/SCIENCE_MODEL.md) | analytical 1D model, units, sign convention, rounding and tolerance policy |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | package boundaries, authority flow, architecture decisions |
| [`docs/adr/`](docs/adr/) | architecture decision records (ADRs) |
| [`docs/MISSIONS.md`](docs/MISSIONS.md) | canonical mission families and difficulty progression |
| [`docs/COMPARATORS.md`](docs/COMPARATORS.md) | comparator registry, scored dimensions, originality/IP boundary |
| [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md) | accessibility contract and evidence requirements |
| [`docs/PRIVACY.md`](docs/PRIVACY.md) | local-first learner-runtime privacy boundary |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) | performance measurement methodology and baseline capture |
| [`docs/PROVENANCE.md`](docs/PROVENANCE.md) | machine-readable scenario/science provenance contract |
| [`docs/QUALITY_SCORECARD.md`](docs/QUALITY_SCORECARD.md) | measurable quality scorecard with Meets/Below evidence definitions |
| [`docs/RELEASE.md`](docs/RELEASE.md) | candidate identity, qualification, promotion, rollback contract |
| [`docs/DEFINITION_OF_DONE.md`](docs/DEFINITION_OF_DONE.md) | per-issue and Epic Definition of Done |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | frozen, delegated, and owner-gated decision register |
| [`contracts/`](contracts/) | machine-readable contracts validated by the consistency checker |

## Machine-readable contracts

Canonical machine-readable contracts live in [`contracts/`](contracts/). They are validated by a
dependency-free checker that also asserts documentation/contract consistency:

```bash
node scripts/verify-contracts.mjs
```

## Status

This repository is at **ML-01 (GAME-383)**: product, NGSS, science, architecture, comparator,
quality, accessibility, privacy, provenance, performance, and release contracts are frozen before
implementation begins. The application foundation, physics kernel, content, renderer, and release
work are the downstream GAME-382 children.

No application build, test suite, or browser qualification exists yet. Nothing in this repository
claims an unexecuted check passed.
