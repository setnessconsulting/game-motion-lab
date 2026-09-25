# Motion Lab — experiment, evidence, and replay model

**Jira authority:** GAME-382 (Epic). **Contracts:** [`../contracts/`](../contracts/).
**Frozen by:** GAME-383 (ML-01) for the science and architecture layers this
document builds on. **Delivered by:** GAME-388 (ML-04).
**Depends on:** [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) and the analytical kernel
in `src/science` (GAME-386 / ML-03), which remains the only scientific authority.

---

## 1. What this layer is for

`src/science` answers "where is the cart at time *t*?". This document defines the
layer that answers "was that a fair test, what did it measure, and may I believe
it?".

The governing law is unchanged from [`ARCHITECTURE.md`](ARCHITECTURE.md) §1:

> **Scientific truth must never come from the renderer.**

Everything below exists to make the *experimental* half of that law enforceable
rather than aspirational.

## 2. Authority and purity

| Property | Rule |
| --- | --- |
| Imports | `src/domain` may import `src/science` types and values. Nothing else. |
| Forbidden | React, Phaser, DOM, storage, network, Node built-ins. |
| Enforced by | `eslint.config.js`, `tests/architecture/boundaries.test.ts`, `tests/architecture/purity.test.ts` |
| Determinism | No clock, no ambient randomness, no renderer input. |

All experiment state is JSON-safe: it round-trips through `JSON.parse(JSON.stringify(x))`
without loss and contains no `undefined`, function, or non-finite value.

## 3. The experiment vocabulary

| Concept | Type | Notes |
| --- | --- | --- |
| Mission / question | `missionId`, `scenarioId` | Identity, not content. Mission content is GAME-389 (ML-05). |
| Hypothesis / prediction | (GAME-394 / ML-10) | Deliberately not modelled here; this layer records evidence, not learner intent. |
| Variables | `VariableDeclaration`, `VariableId` | A closed union of the four v1 knobs. |
| Configuration constraints | `ControlledInvestigation`, `VariableDeclaration.bounds` | Fail closed, never clamp silently. |
| Trial identity | `TrialProvenance.trialId`, `ordinal` | Deterministic, never random, never reused. |
| Seeded variant | `variantSeed`, `deriveSeededVariant` | Chooses *what to run*, never a result. |
| Authoritative samples | `MotionSample[]` | Straight from the ML-03 kernel. |
| Measurements | `Measurement[]` | Derived here, never supplied by a caller. |
| Trial evidence | `TrialEvidence` | Immutable, deep-frozen, digest-bound. |
| Comparison set | `ComparisonSet` | Append-only. |
| Claim / evidence selection | `Claim`, `evaluateClaim` | Only replayable evidence is admissible. |
| Misconception / recovery | `MisconceptionSignal` | Computed from the recorded evidence. |
| Deterministic replay | `replayTrialEvidence` | Re-executes from provenance. |

### Variable roles

A `ControlledInvestigation` declares exactly one `independentVariableId`, the set of
`dependentVariableIds`, and every `controlledVariableId`. A comparison is fair only
when the independent variable moved and nothing else did.

## 4. Controlled-investigation rules

`assessTrialChange` returns a total classification; `enforceControlledVariables`
blocks the invalid cases. Together they satisfy the rule that an invalid
multi-variable change is *prevented or pedagogically surfaced*.

| `ChangeValidity` | Meaning | Pedagogy |
| --- | --- | --- |
| `valid` | Exactly the independent variable changed. | none |
| `unchanged` | Nothing changed. | none |
| `multiple-variables-changed` | Two or more variables changed at once. | names the count and the variables |
| `controlled-variable-changed` | Only a controlled variable changed. | names it and the variable that should have changed |

Every rejection branch carries a learner-facing explanation; no rejection is silent.

## 5. Derived measurements

Measurements are computed in `src/domain/measurements.ts` from the kernel.

| Measurement | Derivation |
| --- | --- |
| `finalPosition` | `x` at the end of the observation span. |
| `finalVelocity` | `v` at the end of the observation span. |
| `averageVelocity` | displacement ÷ elapsed time across the span. |
| `maxSpeed` | Maximum of \|v\| **across the sampled instants**. A sampled maximum, not a continuous-time maximum. |
| `timeToPosition` | First instant `x` reaches a requested marker, located by deterministic bisection on the authoritative `stateAt(t)`. |

Two deliberate choices:

- **The layer does no physics of its own.** `timeToPosition` bisects against the
  kernel rather than solving a second quadratic, so there is no second
  implementation that could disagree with the first.
- **An unreached marker is reported, never invented.** A position the cart never
  reached appears in `unreachedPositionTargetsMetres` and produces no measurement.

Values are authoritative and unrounded. Display rounding is presentation-only and
lives in `src/science/units.ts` (ADR 0004).

## 6. Trial identity, immutability, and reset

- `buildTrialId(missionId, comparisonSetId, ordinal)` is deterministic.
- `appendTrialToComparisonSet` is **append-only** and rejects a duplicate trial
  identity *and* a reused ordinal.
- Records are `deepFreeze`d, so a completed trial cannot be edited in place.
- **Reset and retry allocate a new ordinal.** History is never silently rewritten
  where evidence comparison matters.

## 7. Integrity digest — and what it is not

`integrityDigest` is a 32-bit FNV-1a hash over the canonical JSON form of the
provenance, samples, and measurements. It binds a record's contents to the
declaration it claims to have come from.

**It is an integrity invariant, not a security boundary.** There is no secret key,
so anything able to call the domain could recompute a self-consistent digest.
That is a deliberate trade: the digest catches records altered by a bug or by a
renderer-influenced path, which is the realistic failure mode here.

The actual guarantee for acceptance criterion 3 is structural, not cryptographic:

> **Measurements are outputs, never inputs.** No request, intent, or view-model
> type carries a measured value. There is nothing for the presentation layer to
> forge.

`replayTrialEvidence` then re-derives the measurements from the recorded
declaration and compares, so a forgery is caught even if the digest was recomputed.
Claims citing evidence that does not reproduce are refused with
`reason: "unverified-evidence"`.

## 8. Seeding

`mulberry32` (the family named in `contracts/science-conventions.v1.json`) drives
seeded variants at the content layer only. By the time the kernel is reached it
sees plain numbers, so a seed can never influence an authoritative result. This is
asserted directly: two different seeds resolving to the same configuration produce
byte-identical samples and measurements.

## 9. Golden fixtures

`tests/fixtures/domain/golden/` carries reviewable fixtures for the three cases
the acceptance criteria name:

| Fixture | Case |
| --- | --- |
| `valid-controlled-force-scaling.json` | Valid controlled comparison. |
| `invalid-multi-variable-change.json` | Invalid: two variables changed at once. |
| `misconception-balanced-forces.json` | Misconception: "balanced forces means stopped". |
| `misconception-heavier-cart.json` | Misconception: "heavier accelerates faster". |

Expected values are computed by hand from the closed-form physics in
[`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §3, not captured from the implementation, so
a fixture disagreement points at a real defect.

## 10. Misconception diagnosis

`detectMisconceptions` computes signals from the recorded evidence only:

| Signal | Trigger |
| --- | --- |
| `balanced-forces-imply-stopped` | `Fnet = 0` with a non-zero initial velocity, and the cart travelled. |
| `heavier-cart-accelerates-faster` | At equal net force, the heavier cart accelerated *less*. |
| `uncontrolled-comparison` | A compared pair changed a controlled variable or more than one variable. |

Each signal names the trials and the observed numbers behind it, so a debrief can
point at the learner's own data. Richer mission-level diagnosis is GAME-397 (ML-13).

## 11. Acceptance criteria mapping (GAME-388)

| AC | Where it is proven |
| --- | --- |
| 1. Domain state is JSON-safe and renderer-independent | `experiment-domain.test.ts` "AC1" block; `purity.test.ts`; `boundaries.test.ts` |
| 2. Same seed/configuration produces the same trial evidence | `experiment-domain.test.ts` "AC2" block; `experiment-property.test.ts` |
| 3. Presentation cannot forge a measurement scoring accepts | `experiment-domain.test.ts` "AC3" block; §7 above |
| 4. Controlled-variable constraints are testable | `experiment-domain.test.ts` "AC4" block, including a proof that no classification branch is dead |
| 5. Trials carry enough provenance to reconstruct the run | `experiment-domain.test.ts` "AC5" block |
| 6. Golden fixtures cover valid, invalid, and misconception cases | `experiment-golden.test.ts` and the fixtures in §9 |

## 12. Known limitations of this layer

These are real and are not fixed by GAME-388:

1. **`maxSpeed` is a sampled maximum.** It is the largest speed across the
   requested instants, not the continuous-time maximum. The `derivation` string on
   every measurement says so, and the honest fix is a declared analytic extremum in
   ML-05 rather than finer sampling.
2. **Multi-segment continuity in the kernel is exact-equality.** ML-03 compares
   segment boundary position and velocity with `!==`, so a content author must
   reproduce the previous segment's floating-point result exactly. This is
   fail-closed and safe, but brittle for authored multi-segment content. Deferred
   to ML-05, and noted for the pending ML-03 independent review.
3. **A declaration whose segments end before the observation span rejects
   in-span samples past the last segment.** Fail-closed with a typed error, but the
   message names the segment timeline rather than the declared span. Deferred to
   ML-05 content authoring.
4. **The domain assumes a single segment per trial.** `buildMotionDeclaration`
   always produces one segment; multi-segment scenarios are ML-05 content work.
5. **Claim evaluation is two-point monotonicity over a sorted independent
   variable.** It does not yet fit a line, and it does not detect a learner
   attributing a difference to the wrong variable beyond the
   `uncontrolled-comparison` case. ML-10.
6. **The digest is 32-bit and unkeyed.** See §7. Adequate for integrity, not for
   tamper-evidence against a determined in-app attacker.

## 13. Out of scope here

- Mission and graph content: GAME-389 (ML-05).
- Renderer and instrument presentation: GAME-391 (ML-07), GAME-393 (ML-09).
- Learner-facing hints, scoring, and the full state machine: GAME-394 (ML-10).
- Any claim of science review, accessibility sign-off, or playtesting. None has
  been performed.
