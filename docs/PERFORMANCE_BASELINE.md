# Motion Lab — ML-02 captured performance baseline

**Jira authority:** GAME-382 (Epic). **Methodology frozen by:** GAME-383 (ML-01).
**Captured by:** GAME-384 (ML-02), satisfying
[`PERFORMANCE.md`](PERFORMANCE.md) §5.

The machine-readable record of this baseline is [`../performance/baseline.json`](../performance/baseline.json).
This document is the human-readable reading of that record. If the two disagree, the JSON record
wins and this document is defective.

Nothing in this document is a field metric. Every number below is a **lab measurement** taken on
the production build in Chromium on the workstation described in §2.

## 1. What was captured and why

ML-02 must produce a clean, **exact-SHA** baseline so later milestones measure a delta against a
pinned reference instead of against a threshold someone invented to make an issue green.

Reproduce it with:

```bash
npm ci
npx playwright install chromium
npm run build
npm run test:phaser-render   # writes performance-results/runtime.json
npm run perf:baseline        # folds it into performance/baseline.json
npm run perf:check           # compares the current build against the pinned baseline
```

`performance-results/` is gitignored: it holds the raw per-run runtime output. The pinned baseline
in `performance/` is committed, because it is evidence rather than scratch output.

## 2. Capture conditions

| Concern | Value |
| --- | --- |
| Source SHA | recorded as `sourceSha` in `performance/baseline.json` |
| Branch | `main` |
| Node.js | 24.x (pinned by `.nvmrc`, `engines.node`) |
| Platform | `win32-x64` |
| Build mode | Vite production build, gzip measured at level 9 |
| Browser lane | Chromium via Playwright, `deviceScaleFactor` default, PerformanceObserver |
| Throttling | none (the baseline is an unthrottled lab capture and is labelled as such) |

Field Core Web Vitals (for example CrUX INP) are recorded as **unavailable**: the game ships no
learner telemetry and has no promoted public route, so there is no field sample to cite. They are
never estimated from lab data.

## 3. Bundle baseline

Production build output, gzip level 9. Buckets are defined in
[`../scripts/perf-baseline.mjs`](../scripts/perf-baseline.mjs).

| Bucket | gzip |
| --- | --- |
| Initial JS (React + application shell) | 63.75 kB |
| Game chunk (Phaser 4.2.1) | 345.45 kB |
| Renderer chunk (scene wiring) | 1.78 kB |
| CSS | 1.48 kB |
| HTML | 0.44 kB |
| **Total payload** | **412.91 kB** |

The Phaser chunk dominates the payload. That is expected and is the reason the renderer is a
separate chunk: [`ARCHITECTURE.md`](ARCHITECTURE.md) allows the renderer to be loaded lazily, and
its absence must never damage science or game state
([`ARCHITECTURE.md`](ARCHITECTURE.md), [`ACCESSIBILITY.md`](ACCESSIBILITY.md)). ML-15/ML-PROMOTE
decide the shipped loading strategy; this baseline records the cost of both chunks so that decision
has evidence.

## 4. Runtime baseline (browser lab)

| Metric | Baseline | Reading |
| --- | --- | --- |
| LCP | 148 ms | lab, Chromium |
| CLS | 0.0008 | lab, Chromium |
| DOMContentLoaded | 38 ms | lab |
| First useful action readiness | 90 ms | first mission action enabled |
| Input-to-frame proxy | 13.4 ms | custom proxy, **not** INP (`PERFORMANCE.md` §3.5) |
| State-transition latency | 11 ms | intent commit → authoritative state rendered |
| Long tasks | 1 task, 94 ms max | during the bounded interaction window |
| Phaser frames | 61 fps | during trajectory playback |
| Heap across repeated trials | 17.1 MB → 17.1 MB | no upward trend in the measured window |

Two honest readings of these numbers:

1. **The one 94 ms long task is the Phaser chunk being parsed and the game booting.** It is
   load-time cost, not interaction jank, and it is the single most likely thing to regress as the
   real lab environment, instruments, and particle effects arrive in ML-06/ML-07. Later milestones
   should expect this number to move and should attribute it explicitly.
2. **The memory window is small.** ML-02 only exercises the bootstrap path, and heap start and end
   are identical to the recorded precision. This is a *baseline*, not proof of long-session
   stability; repeated-trial memory stability must be re-measured once trials are real
   ([`PERFORMANCE.md`](PERFORMANCE.md) §2).

## 5. Regression tolerance

The tolerance is stored **with** the baseline in `performance/baseline.json`, so loosening it is a
visible, reviewable change rather than a quiet edit:

| Metric | Tolerance |
| --- | --- |
| Initial JS gzip | ±5% |
| Game chunk gzip | ±5% |
| Total payload gzip | ±5% |

Rationale (recorded in the JSON record, delegated decision G-01 in [`DECISIONS.md`](DECISIONS.md)):
a 5% band absorbs build-tool noise without hiding a real payload regression.

`npm run perf:check` enforces only the payload band, because payload is the one metric that is
deterministic across machines. Runtime metrics are **reported as deltas, not enforced**, because
enforcing a wall-clock number captured on one workstation would produce flaky failures and would
tempt future work to loosen the baseline for the wrong reason.

## 6. What this baseline does not claim

- Not field data, and not a substitute for field data.
- Not Lighthouse: the repository does not depend on Lighthouse, and a previous portfolio repository
  recorded that the pinned launcher fails on this workstation. LCP/CLS come from a real browser
  lane with `PerformanceObserver` instead, and are labelled lab measurements.
- Not a performance *approval*. It is a reference point. GAME-382's performance obligations are
  discharged by measuring later milestones against it, not by this document existing.
- Not stable across machines on its wall-clock rows. Compare bundle rows across machines; compare
  runtime rows only within a machine, and label the environment when you do.

## 7. Superseding this baseline

Per [`PERFORMANCE.md`](PERFORMANCE.md) §5, if the foundation changes after capture, the baseline is
re-captured at the new SHA and the previous record is superseded **explicitly** — the old numbers
are never silently overwritten in a narrative. `performance/baseline.json` carries `sourceSha`,
`capturedAt`, and `workingTreeDirty` so that any reader can tell exactly which tree was measured.

A baseline captured from a **dirty** working tree is a provisional capture: it describes code that
is not yet any single commit. Such a capture must be superseded by a clean capture at the commit
that lands the milestone before it is cited as the pinned reference.
