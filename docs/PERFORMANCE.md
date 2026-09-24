# Motion Lab — performance measurement methodology

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Baseline captured by:** ML-02 (GAME-384). **See also:** [ADR 0005](adr/0005-local-first-no-learner-telemetry.md).

This document freezes **how** performance is measured. It deliberately does **not** invent a
bundle-size limit or a threshold in advance.

> **Rule:** performance is a **measurement methodology plus a pinned baseline capture**, not an
> arbitrary number chosen to make a Jira issue green. Budgets are derived from the ML-02 baseline
> and any regression is judged against it. A threshold is never invented after the fact to pass.

## 1. Why methodology first

An arbitrary "keep the bundle under 250 kB" rule would be unfalsifiable and would let a regression
hide inside a generous budget. Instead:

1. ML-02 captures a **clean, exact-SHA baseline** of the foundation build.
2. Later issues measure the same metrics with the same tooling under the same conditions.
3. A delta is reported as an absolute and a percentage change against that pinned baseline.
4. A material regression is remediated or **explicitly approved** with a recorded rationale — it is
   never silently absorbed.

## 2. Metrics to track

| Metric | Definition | Why it matters | Lab or field |
| --- | --- | --- | --- |
| Initial JS gzip | gzip size of the JavaScript required for the first route, from the production build | first-load cost on school/tablet networks | lab |
| Game chunk gzip | gzip size of the Phaser/renderer chunk, whether loaded eagerly or lazily | renderer is the heaviest dependency | lab |
| LCP (lab) | Largest Contentful Paint on the production build, mobile-simulated, median of ≥3 runs | perceived load | lab |
| CLS (lab) | Cumulative Layout Shift over the same runs | layout stability as the game mounts | lab |
| First useful action readiness | time from navigation start to the first mission action being available and enabled | when the learner can actually start | lab |
| Input-to-frame latency | a **custom** input-to-next-frame proxy for a representative interaction (see §3) | controls feel direct | lab |
| State-transition latency | time from a committed intent to the corresponding authoritative state being rendered, **excluding intentional animation dwell** | responsiveness of the game loop | lab |
| Long tasks | count and duration of tasks > 50 ms during a bounded interaction window | jank | lab |
| Phaser frame behaviour | frame-time distribution during trajectory playback; sustained frames vs. dropped frames | renderer smoothness | lab |
| Repeated-trial memory stability | heap trend across ≥10 repeated trials (no unbounded growth) | long sessions, retries | lab |

Field Core Web Vitals are **not** available for this game (no learner telemetry, no promoted public
route at first). They are recorded as **unknown / pending**, never estimated.

## 3. Measurement rules

1. **Pinned baseline.** The baseline is captured against an exact source SHA, with lockfile identity
   and browser versions, and is stored in the repository (ML-02). Later comparisons cite it.
2. **Same conditions.** Deltas are only meaningful when build mode (`production`), viewport,
   throttling profile, and browser build match. A different environment is labelled, not averaged.
3. **Lab metrics are labelled lab metrics.** No lab number is presented as a field metric.
4. **Intentional dwell is excluded from latency.** A deliberate instructional animation is not
   application latency. The state-transition metric therefore measures *from intent commit to
   authoritative state availability*, and the test asserts that the measurement window does not
   include authored dwell. Both the raw and dwell-excluded numbers are recorded so the exclusion is
   auditable.
5. **The input-to-frame proxy is not INP.** The W3C Event Timing specification excludes continuous
   events such as `pointermove` from event entries, so this metric is explicitly a custom proxy
   (dispatched-event timestamp → next animation frame), reported with both the style-update and the
   next-frame sample. It is never labelled INP.
6. **Only learner production bytes count.** Development tooling, source maps, and test bundles are
   excluded from the bundle metric.
7. **No observability SDK.** Metrics are collected by local tooling and CI, not by a third-party
   browser SDK in the shipped bundle ([`PRIVACY.md`](PRIVACY.md)).
8. **Evidence is tied to the exact commit.** Every measurement record names the source SHA, the
   build identity, the tooling versions, and the report digest.

## 4. Required tooling (delivered in ML-02)

- a **bundle report** that reads the production build output and writes raw/gzip bytes plus deltas
  against the pinned baseline (`scripts/perf-baseline.mjs`, `scripts/check-bundle-budget.mjs`);
- a **local Lighthouse lab run** (no upload, no cloud service) for LCP/CLS/TBT, driving the
  Chromium that Playwright already installed rather than downloading a browser
  (`scripts/lighthouse-baseline.mjs`);
- **Playwright-based runtime measurement** for input-to-frame proxy, long tasks, state-transition
  latency, frame behaviour, and repeated-trial memory (`tests/e2e/performance.spec.ts`);
- **SHA binding**, which is what makes the above citable: every record names the source SHA and
  the toolchain, and the bundle baseline refuses a Lighthouse row captured at a different commit.

No performance figure produced by this tooling is a pass/fail threshold except the payload
buckets in §7. A Lighthouse score in particular is never a gate: it moves with host CPU contention
and with the throttle model, and gating on it would invite loosening it to make an issue green.

## 5. Baseline capture requirement (ML-02 acceptance)

ML-02 must:

1. build the foundation in production mode;
2. record every metric in §2 as the **baseline**, with the exact SHA, at a documented command;
3. confirm the browser console is clean for the bootstrap route and that no unintended network
   request occurs;
4. commit the baseline (a JSON record) and the commands used to produce it;
5. state plainly which metrics are lab-only and which (field) metrics remain pending.

Later issues compare against this record. If ML-02 changes the foundation after capturing the
baseline, the baseline is re-captured at the new SHA and the previous one is superseded explicitly.

## 6. Regression policy

- A material regression is a change that worsens a metric beyond the tolerance recorded with the
  baseline, or that introduces a new long task or a memory trend.
- A material regression must be remediated **or** carry an explicit, owner-approved, recorded
  waiver with a rationale and a follow-up. Silence is not a waiver.
- No waiver may authorize the release chain (ML-15 onward) unless GAME-382's release rules permit it.

## 7. Threshold governance

Concrete numeric budgets are set **when the ML-02 baseline exists**, recorded next to it, and
versioned with it. Until then, this document defines the methodology only. A future issue that
wants to loosen a budget must record the change in [`DECISIONS.md`](DECISIONS.md) with evidence for
why the looser budget is acceptable.
