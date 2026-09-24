# Motion Lab — bootstrap and local verification

**Jira authority:** GAME-382 (Epic). **Delivered by:** GAME-384 (ML-02).
**Architecture contract:** [`ARCHITECTURE.md`](ARCHITECTURE.md), [`adr/`](adr/).

## Supported toolchain

| Concern | Value |
| --- | --- |
| Node.js | **24.x** (pinned in `.nvmrc` and `package.json` `engines.node`) |
| Package manager | **npm** (the only supported lockfile is `package-lock.json`) |
| Browsers for e2e | Chromium via Playwright (`npx playwright install chromium`) |
| Everything else | pinned in `package.json`; the runtime stack is frozen by [ADR 0006](adr/0006-frozen-technology-baseline.md) |

## Clean-clone setup

```bash
git clone https://github.com/setnessconsulting/game-motion-lab.git
cd game-motion-lab
npm ci
npx playwright install chromium
npm run verify
```

`npm run verify` is the aggregate, credential-free gate and is what CI runs. It needs no
secrets and performs no deployment.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite development server |
| `npm run build` | production static build into `dist/` |
| `npm run preview` | serve the built `dist/` locally |
| `npm run typecheck` | `tsc --noEmit`, strict mode |
| `npm run lint` | ESLint, including the science/domain import boundary |
| `npm test` | Vitest unit + architecture/purity tests (no DOM environment) |
| `npm run test:e2e` | build, then the browser lanes |
| `npm run test:e2e:run` | semantic-shell browser lane (Chromium) |
| `npm run test:a11y` | axe-core lane (assistive, **not** accessibility sign-off) |
| `npm run test:phaser-render` | **real Phaser renderer** lane, plus performance capture |
| `npm run contracts` | ML-01 contract/documentation consistency |
| `npm run foundation` | ML-02 foundation invariants (stack pins, boundaries, CI) |
| `npm run perf:baseline` | capture the exact-SHA performance baseline record |
| `npm run perf:lighthouse` | local Lighthouse lab capture (LCP/CLS/TBT), driving the Playwright Chromium |
| `npm run perf:check` | compare the current build against the pinned baseline |
| `npm run verify` | the whole gate, in order |

## Package boundaries

```text
src/science      pure TS science authority        (no React, Phaser, DOM, storage, network)
src/domain       experiment/evidence authority    (no React, Phaser, DOM, storage, network)
src/viewmodel    typed projection shared by both  (no React, Phaser, DOM)
src/ui           React semantic surfaces          (no Phaser)
src/renderer     Phaser presentation only         (no science/domain, no physics engine)
src/host         bootstrap, renderer lifecycle, failure recovery
src/app          application shell composition
```

The boundary is enforced twice so it is a build-time fact rather than a convention:

1. `eslint.config.js` — `no-restricted-imports` rules per package; and
2. `tests/architecture/boundaries.test.ts` — reads the real module graph and fails on a
   forbidden edge, including a synthetic self-test proving the detector is not vacuous.

`tests/architecture/purity.test.ts` additionally imports the authority packages in a
**node** environment (no `window`, no `document`) and computes with them, which is a
stronger statement than grepping for the word "document".

## What this milestone does and does not contain

**Contains:** the React 19 + TypeScript + Vite application shell, the real Phaser 4.2.1
renderer wired through a typed view model with bounded intents, the package boundaries
and their executable enforcement, the local verification and CI commands, the
performance baseline capture (bundle, Playwright runtime, and Lighthouse), and graceful
semantic fallback when the renderer fails.

The clean-clone setup above needs `npx playwright install chromium` before `npm run verify`
because the real-renderer lane and the Lighthouse capture both drive that Chromium rather
than downloading a second browser. `npm run perf:lighthouse` is deliberately **not** part of
`npm run verify`: it is an evidence capture, not a gate, and no Lighthouse score is enforced
(see [`PERFORMANCE_BASELINE.md`](PERFORMANCE_BASELINE.md) §6).

**Does not yet contain** (owned by later GAME-382 children):

| Missing | Owner |
| --- | --- |
| the analytical physics kernel (`a = Fnet/m`, net force, resistance, validation) | GAME-386 (ML-03) |
| the experiment/trial/evidence domain contract | GAME-388 (ML-04) |
| canonical missions, provenance manifests, golden traces | GAME-389 (ML-05) |
| the production lab renderer and force visualisation | GAME-390 (ML-06) |
| instruments, notebook, graphs | GAME-391/392/393 (ML-07/08/09) |
| the investigation state machine, scoring, debrief | GAME-394 (ML-10) |
| the vertical slice, production art, and the full content set | GAME-395…397 |
| games-site hosting | GAME-385 (ML-HOST), GAME-399 (ML-15) |

Only the **balanced-force** case (`Fnet = 0` → constant velocity) from
[`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §3 is implemented in this bootstrap, in
`src/science/bootstrap-motion.ts`, which says so at the top. Nothing here is scored, and
no graph is presented as evidence.

## Renderer failure behaviour

If the Phaser chunk fails to load, the scene throws, or the renderer does not become
ready inside its startup budget, the host replaces the canvas region with a **semantic
fallback** that presents the same numbers as text. The investigation remains completable
and no authoritative value changes. `tests/e2e/realRender.spec.ts` exercises this by
aborting the renderer chunk.

## Evidence status

- Local commands in this document were executed during ML-02; see the Jira record for
  the exact commands and results.
- CI is authored to run the same commands and was observed passing for the ML-02 branch commit
  before merge. Re-check it for any later commit rather than assuming this still holds.
- Manual accessibility review, science review, playtest and promotion remain open human
  gates and are never claimed here.
