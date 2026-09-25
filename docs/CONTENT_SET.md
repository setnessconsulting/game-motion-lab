# Motion Lab — canonical v1 content set

**Jira authority:** GAME-382 (Epic). **Authored by:** GAME-389 (ML-05).
**Frozen inputs:** [`MISSIONS.md`](MISSIONS.md) (families and rules),
[`../contracts/mission-families.v1.json`](../contracts/mission-families.v1.json) (machine-readable
families), [`../contracts/scenario-provenance.schema.json`](../contracts/scenario-provenance.schema.json)
(per-scenario provenance), [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) (bands, display rule, tolerance),
[`PROVENANCE.md`](PROVENANCE.md) (manifest rules).

This document is the authority for **which scenarios exist in v1, what science each one teaches, and
how the content is proven correct by machine**. It does not restate the families, which
[`MISSIONS.md`](MISSIONS.md) already froze; it records the instances and the gates.

The implementation is `src/content/` (pure TypeScript), the authored data is
`src/content/scenarios/*.provenance.json` and `src/content/golden/*.trace.json`, and the enforcing
gates are `tests/unit/content-*.test.ts` plus the `canonical content set` group in
`scripts/verify-contracts.mjs`.

## 1. What ships in v1

Ten canonical scenarios across the four frozen families. Every one is machine-readable, validated
against the frozen provenance schema, and backed by a golden trace that reproduces from the real
kernel.

| Scenario id | Family | Level | Graph | Independent variable |
| --- | --- | --- | --- | --- |
| `calibration-balanced-pair` | `calibration-run` | guided | none | the pair of pushes |
| `calibration-unbalanced-swap` | `calibration-run` | supported | none | the pair of pushes |
| `thruster-force-doubling` | `thruster-test` | guided | none | thruster force |
| `thruster-velocity-graph` | `thruster-test` | independent | **required** (velocity-time) | thruster force |
| `cargo-mass-doubling` | `cargo-load-test` | guided | none | cargo mass |
| `cargo-heavy-load` | `cargo-load-test` | evidence-challenge | optional (position-time) | cargo mass |
| `mystery-heavier-cargo` | `mystery-cart` | diagnosis | **required** (velocity-time) | thruster dial |
| `mystery-weak-thruster` | `mystery-cart` | diagnosis | **required** (velocity-time) | thruster dial |
| `mystery-track-drag` | `mystery-cart` | diagnosis | **required** (velocity-time) | thruster dial |
| `mystery-no-fault` | `mystery-cart` | evidence-challenge | **required** (velocity-time) | thruster dial |

The `thruster-test` family carries the contract's mandated graph-interpretation requirement
(`contracts/mission-families.v1.json` names it in `graphInterpretationRequirement.satisfiedBy`), and
`thruster-velocity-graph` is the scenario that satisfies it. All four `mystery-cart` scenarios also
require the velocity-time graph, as `alsoRequiredBy` demands.

## 2. The design that makes each scenario a controlled investigation

Every scenario declares an ML-04 `ControlledInvestigation` with exactly one independent variable, and
every pair of trials the validator compares differs **only** in that variable. The check is not a
comment: `assessTrialChange` is called on the real authored configurations, and anything other than
`valid` is a build failure.

The four `mystery-cart` scenarios run a reference cart and a suspect cart at 2 N and 3 N. That yields
exactly two *controlled* comparisons — reference at 2 N against 3 N, and suspect at 2 N against 3 N —
which is what the family contract means by "at least two controlled comparisons that distinguish the
candidate explanations". Comparing a reference trial against a suspect trial is deliberately *not* a
controlled comparison: two different carts is the observation, not a fair test, and the validator
never treats it as one.

## 3. How expected values are proven, not asserted

Each scenario has a golden trace in `src/content/golden/`. For every trial the golden records:

- the **hand arithmetic** a reviewer can check with a calculator (`Fnet = 8 N - 2 N = 6 N`,
  `a = 6 N / 3 kg = 2.00 m/s^2`, and so on);
- the **derived measurements** the kernel produced;
- the **final state**;
- a **digest over the whole sampled trajectory**, so every sampled instant is pinned, not just the
  endpoints;
- the markers the cart never reached.

`tests/unit/content-golden.test.ts` asserts all of it against a live kernel run, and separately
asserts that the hand arithmetic and the kernel agree. The goldens are therefore a cross-check, not
a recording of current behaviour: if the kernel changes, one of the two disagrees and the gate goes
red.

## 4. Two enforcement layers, and why

| Layer | What it owns | How it runs |
| --- | --- | --- |
| `src/content/` validators (Vitest) | schema conformance, bands, display safety, controlled comparisons, diagnosis well-posedness, trace resolution, readability, family coverage | `npm test` |
| `scripts/verify-contracts.mjs` (`canonical content set`) | envelope and cross-reference invariants readable with Node built-ins only | `npm run contracts` |

The split is deliberate. The Vitest layer needs the real kernel to have anything to check, and the
contract script stays dependency-free and fast enough to run first. Neither layer is sufficient alone,
so both exist and neither is described as the whole gate.

## 5. The display and tolerance rules are enforced, not assumed

`docs/SCIENCE_MODEL.md` §7.3 requires the content validator to do two specific jobs, and it does:

- **Rounding-boundary defect.** No authoritative value in any scenario sits on a display rounding
  boundary. This is a real constraint, not a formality: half-way points are the only place where two
  reasonable readers of the frozen rounding rule print different strings. Authoring used a 2 s
  observation span with six samples specifically because that grid keeps every derived position clear
  of a boundary; earlier choices produced genuine hits (for example an acceleration of 1.00 m/s²
  sampled at 0.5 s gives 0.125 m, which is a boundary at two decimals).
- **Display round-trip safety.** Every sampled and measured value satisfies
  `|round(value) - value| <= toleranceFloor(quantity)`, so a learner who reads a displayed number and
  enters it verbatim is always within tolerance.

Bands from §8 are enforced on authored values (mass 1.0–4.0 kg with one decimal, whole applied forces
of 1–12 N, resistive 0–3 N, span 0–6 s, track −2–12 m) and on emergent values (acceleration inside
0.25–12 m/s², with zero admitted only when the net force is exactly zero — the balanced control the
Calibration Run family exists to teach).

## 6. Reading complexity is measured, and measured is not the same as reviewed

`src/content/readability.ts` computes Flesch–Kincaid grade level, sentence lengths, and a
polysyllabic-word share, deterministically and without a dependency. The validator fails a scenario
whose learner-facing copy exceeds grade 8, a 28-word sentence, or an 18% polysyllabic share.

The current set scores **worst block 8.0 grade level, longest sentence 22 words, across 110 authored
blocks**. The ceiling is being used, not ignored.

**This is not acceptance criterion 4.** Flesch–Kincaid counts syllables; it cannot tell whether an
argument is followable or whether a definition is right. AC4 is a human reading-complexity review and
remains open. The numbers exist so that review starts from measurements instead of an impression.

## 7. The anti-answer-key property, and what it is enforced against

`docs/MISSIONS.md` §4 forbids a diagnosis that can be won by guessing. Three structural rules
enforce the part of that which is mechanical:

1. **There is no input path for a guess.** `diagnoseBoundedCause` accepts only measured accelerations
   from trials the learner ran, plus the candidate list. There is no option index, no "correct" flag,
   and no score parameter, so "choose an option with no trials" cannot be expressed as a call.
2. **One trial is never enough.** Below two controlled comparisons the engine returns
   `insufficient-comparisons` and no cause. This is asserted per scenario, including with two readings
   of the *same* force setting, which still does not qualify.
3. **The data must actually decide.** Exactly one candidate cause may fit the evidence. Zero fits is
   `no-cause-fits`; more than one is `ambiguous`. Both are build failures, because a puzzle that cannot
   be solved is a content defect rather than a hard puzzle.

The learner-facing projection (`toLearnerTrialView`) is a **whitelist**: it has no `subject` field and
no hidden-mass field, so which cart a trial came from and what it is really carrying have no code path
into the interface. A test asserts that a reference trial and a suspect trial at identical dial
settings project to identical numbers.

## 8. A recorded limitation of the frozen four-cause set

This is the most important thing in this document for the science reviewer, so it is stated plainly
rather than smoothed over.

The strongest natural reading of the anti-answer-key rule is "no single applied-force reading ever
decides the cause". **That property is not achievable with the four frozen candidate causes.** The
four causes predict, at applied force `f`:

| Cause | Predicted acceleration |
| --- | --- |
| `correct-calibration` | `f / m` |
| `incorrect-cargo-mass` | `f / m'` |
| `weak-thruster` | `W / m` (constant in `f`) |
| `unexpected-resistive-force` | `(f − R) / m` |

`correct-calibration` can coincide only with `weak-thruster`, and only at the single force `f = W`.
It can never coincide with the cargo or drag causes at any force. Sweeping `f` from 1 N to 12 N at the
authored parameters (`m = 2 kg`, `m' = 3 kg`, `W = 2 N`, `R = 1 N`), **only 2 N and 3 N produce any
collision at all**; at every other setting all four causes are mutually distinguishable.

The authored set uses exactly 2 N and 3 N, which is the best available choice: at 2 N the healthy cart
and the stuck-thruster cart are indistinguishable, and at 3 N the cargo, drag, and stuck-thruster
carts are mutually indistinguishable. Because the scenarios measure at *both* settings, the two
required comparisons genuinely separate all four.

What is enforced is therefore the achievable and meaningful property: **every candidate cause has at
least one rival it is indistinguishable from at one of the scenario's force settings**, so no cause
can be settled by elimination from a single run, and the engine will not return a verdict without both
comparisons. `tests/unit/content-diagnosis.test.ts` records the collision sweep as a machine-checked
fact, so this paragraph cannot drift away from the physics.

What is *not* claimed: that a learner who measures at 2 N alone and notices an acceleration of
0.67 m/s² cannot infer "too much cargo". They can. That is a consequence of the frozen cause set
having only four members, and it is a question for the GAME-389 AC3 reviewer and for ML-13, which owns
the remaining variants.

## 9. A scope limit worth recording: resistive force and ML-04

`mystery-track-drag` exercises the `unexpected-resistive-force` cause, which needs a declared
resistive force. ML-04's `TrialConfig` is a closed four-variable set with no resistive variable, and
ML-04 is under independent review and deliberately not modified. So that scenario's two suspect trials
carry an explicit `kernelDeclaration` in their golden trace and are verified against ML-03 directly,
with the provenance field `producedBy: "ml-03-kernel-direct"` recorded on the run. Every other trial
in the set is verified through the ML-04 trial runner *and* compared bit-for-bit against a direct
kernel call, so the two layers are proven not to have drifted.

Recorded here rather than hidden: extending ML-04's variable set so a resistive force can be a
learner-visible control is a contract decision for a later milestone, not an ML-05 change.

## 10. Review status, honestly

Every scenario in the set carries `reviewStatus: "unreviewed"` and `reviewer: null`.

`docs/PROVENANCE.md` §1 says a scenario that is not `reviewed` with a named reviewer **may not ship in
a production build**, and `assertReleaseReady` in `src/content/release-gate.ts` fails closed on
exactly that. It is implemented and unit-tested against both branches.

**It is deliberately not wired into the build yet.** No independent science review has happened, so
arming it today would make every build fail; a permanently red pipeline is not enforcement, it is a
broken gate, and people learn to ignore red. The wiring belongs to the release-readiness milestone
(ML-15 / GAME-399), the first place a production build exists to gate. `scripts/verify-contracts.mjs`
asserts both halves of this: that the gate exists, and that it is not yet armed.

## 11. Acceptance criteria mapping

| Criterion | Status | Where it is proven |
| --- | --- | --- |
| AC1 machine-readable and schema-validated | **met** | `content-set.test.ts` (schema group, 16 cases), `content-schema.test.ts` (26 cases), `verify-contracts.mjs` content group |
| AC2 expected outputs backed by ML-03/ML-04 golden traces | **met** | `content-golden.test.ts` (200 cases): hand arithmetic, measurements, final state, whole-trajectory digest, ML-04 parity |
| AC3 independent science review, high-severity findings closed | **OPEN — human gate** | not performed; no reviewer is named anywhere in this repository |
| AC4 reading complexity, units and graph ranges reviewed for grades 6–8 | **OPEN — human gate** | metrics computed and enforced (§6); the human review has not happened |
| AC5 mission content is original and provenance/IP reviewable | **partly met** | all content is original to this repository and every scenario carries a complete provenance manifest; the human provenance/IP review is still owed |

**This milestone therefore does not satisfy AC3 and AC4.** It lands Blocked on AC3, exactly as ML-03
landed Blocked on AC6. No independent review, reading-complexity sign-off, or provenance sign-off is
claimed anywhere in this work.

## 12. Content inventory and what ML-13 still owns

v1 total: 4 families, 10 canonical scenarios, 40 trials, 40 measured trajectories.

ML-13 completes the Supported / Independent / Diagnosis / Evidence-challenge variants and the
seeded variant set. `src/domain`'s `deriveSeededVariant` already exists for that, and every scenario
records `seed: 4100`; the variant *space* is authored in ML-13, not here, so that variant generation
cannot quietly change a canonical answer.

## 13. Known limitations

1. **"No single reading decides" is unreachable with four causes** — see §8. The achievable property
   is enforced; the stronger one is recorded as a question for the AC3 reviewer and ML-13.
2. **No scenario is reviewed**, so none may ship in a production build, and the release gate is not
   armed (§10).
3. **The resistive-cause scenario bypasses the ML-04 trial runner** and is verified against ML-03
   directly (§9).
4. **Readability metrics are syllable counts**, not comprehension measures, and the worst block sits
   exactly on the grade-8 ceiling, so a single new long word in a debrief could trip the gate (§6).
5. **Scenario ids, family ids and the four cause ids are all fixed in the frozen contracts.** New
   content cannot add a fifth cause or a fifth family without a `DECISIONS.md` entry, which is why
   §8 had to be solved by scenario design rather than by adding a candidate.
