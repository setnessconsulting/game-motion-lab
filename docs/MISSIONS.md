# Motion Lab — canonical mission families

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Machine-readable form:** [`../contracts/mission-families.v1.json`](../contracts/mission-families.v1.json).

The v1 content set is exactly four mission families. Each family is a bounded investigation of the
MS-PS2-2 relationship between net force, mass, and the change in motion. ML-05 authors the
canonical scenarios and their provenance manifests; ML-13 completes the independent, diagnosis, and
evidence-challenge variants. This document freezes what each family teaches and what evidence it
requires.

## Family summary

| ID | Family | Primary concept | Independent variable | Dependent variable | Controlled variables |
| --- | --- | --- | --- | --- | --- |
| `calibration-run` | Calibration Run | balanced vs. unbalanced force; net-force reasoning | two collinear applied forces (or one force vs. none) | resulting motion (rest / constant velocity / accelerated) | mass, initial velocity, resistive force, observation window |
| `thruster-test` | Thruster Test | greater applied force produces greater acceleration at constant mass | applied force | acceleration and velocity change | mass, initial velocity, resistive force, observation window |
| `cargo-load-test` | Cargo Load Test | greater mass produces less acceleration at constant applied force | cart mass (cargo) | acceleration and velocity change | applied force, initial velocity, resistive force, observation window |
| `mystery-cart` | Mystery Cart Investigation | diagnosing a bounded hidden cause from controlled evidence | learner-chosen comparison variable | which bounded explanation the evidence supports | declared per variant |

Every family observes the same conventions and units
([`SCIENCE_MODEL.md`](SCIENCE_MODEL.md)) and the same controlled-investigation rule: **one
independent variable changes at a time in an assessed comparison**.

---

## 1. Calibration Run

**Mission fantasy.** A new cart has been assembled on the calibration bench. Before it is trusted,
the learner must determine whether the cart behaves as a balanced or unbalanced system.

**Science question.** What is the net force on the cart, and how does the cart's motion reflect it?

**Learner task.** Configure opposing applied forces. Observe whether the cart stays at rest, moves
at constant velocity, or accelerates. Record at least two trials and use them to establish that
equal-and-opposite forces produce no change in motion, while any nonzero net force produces a
change.

**Expected relationships.**

- Opposing forces of equal magnitude → `Fnet = 0` → `a = 0`. A cart at rest stays at rest; a cart
  in motion continues at constant velocity.
- Opposing forces of unequal magnitude → `Fnet = F_bigger − F_smaller` (signed) → `a = Fnet/m`,
  directed toward the larger force.

**Required evidence.** At least one balanced trial and one unbalanced trial, with the net force,
acceleration, and the resulting motion compared. A claim that the cart is "balanced" must cite the
two trials whose net forces establish it.

**Misconceptions addressed.** "Balanced forces mean the object is stopped"; "a constant push means
constant speed"; "the object stores force."

**Difficulty levels.** Guided (game names the forces to compare) → Supported (learner decides which
pair of forces to compare) → Independent (learner designs the balanced/unbalanced pair).

---

## 2. Thruster Test

**Mission fantasy.** A test bay fires a cart along a straight rail using a single forward thruster
whose force can be set.

**Science question.** How does the change in the cart's motion depend on the applied force when the
mass is controlled?

**Learner task.** Run two or more trials that change **only the thruster force**, holding mass
constant, and compare the resulting accelerations. Predict first, then measure.

**Expected relationship.** At constant mass, `a = Fnet/m`, so acceleration is proportional to
(applied) force: doubling the force doubles the acceleration. The direction follows the sign of the
net force.

**Required evidence.** Two trials differing only in force, with the acceleration (and/or the
velocity-time slope) compared. The claim must name force as the changed variable and mass as the
controlled variable.

**Graph requirement.** **This family carries the mandated graph-interpretation requirement.** At
least one production scenario must require the learner to read the *velocity-time* graph to obtain
the evidence (the slope is the acceleration) rather than reading a numeric instrument alone. The
semantic table equivalent must expose the same data, so the graph requirement never becomes a
precision-canvas requirement.

**Misconceptions addressed.** "More force always means a bigger speed" (vs. bigger *change*);
"longer run means more force"; "force and acceleration are unrelated."

**Difficulty levels.** Guided (game fixes mass and offers force choices) → Supported (learner
chooses which variable to change) → Independent (learner designs the two-force comparison and
chooses the observation window).

---

## 3. Cargo Load Test

**Mission fantasy.** A delivery cart must be loaded with cargo. Different loads must be hauled by
the same fixed thruster.

**Science question.** How does the change in motion depend on the cart's mass when the applied
force is controlled?

**Learner task.** Run two or more trials that change **only the cargo mass**, holding the applied
force constant, and compare the resulting accelerations.

**Expected relationship.** At constant net force, `a = Fnet/m`, so acceleration is inversely
proportional to mass: doubling the mass halves the acceleration.

**Required evidence.** Two trials differing only in mass, with acceleration compared, and the
applied force explicitly identified as controlled. A claim that a heavier cart accelerates less
must cite both trials.

**Graph requirement.** Optional here, and when present it uses the *position-time* graph: a more
curved position-time trace indicates greater acceleration. Graph reading must never be the only
path — the semantic table always exposes the underlying data.

**Misconceptions addressed.** "Heavier things are always slower to change motion *and* always
accelerate less for any reason" (must be tied to constant force); "mass and force both changed, so
the test still works."

**Difficulty levels.** Guided → Supported → Independent → Evidence challenge (support the inverse
relationship using trials plus a graph).

---

## 4. Mystery Cart Investigation

**Mission fantasy.** A cart in the fleet is behaving inconsistently compared with its siblings. The
learner must diagnose **one** bounded cause using controlled trials.

**Science question.** Which of the bounded explanations is consistent with the experimental
evidence?

**Bounded candidate explanations (authored variants).** Each variant declares exactly one true
cause and a small set of plausible competing explanations:

| Candidate cause | How it manifests | How controlled trials distinguish it |
| --- | --- | --- |
| Incorrect cargo mass (heavier than declared) | lower than expected acceleration at nominal force | vary mass with force controlled; the anomalous trial matches the heavier-mass curve |
| Weak thruster (lower applied force) | lower than expected acceleration at nominal mass | vary force at nominal mass; the anomalous trial matches the lower-force curve |
| Unexpected resistive force | lower than expected acceleration that varies with the direction/declared resistance | compare a run with the resistive force declared zero against one with it declared; the deficit tracks the declared resistive force |
| Correct calibration (no fault) | all trials match the nominal model | every controlled comparison matches prediction within tolerance |

**Required evidence.** At least two controlled comparisons that **distinguish** the candidates —
not merely one anomalous observation. A diagnosis that names the true cause but cites only one
trial, or cites a trial in which more than one variable changed, does not count as complete.

**Anti-answer-key rule (binding).** The diagnosis may not be revealed by any of: a fixed answer
position, an always-third option, a highlight on the "correct" row, a debug label, a stripped build
left in a bundle, or text that becomes visible in the DOM or in the state model before the learner
has the evidence. The correct explanation is a property of the scenario's authoritative model and
becomes *derivable* only from controlled comparisons. ML-13 must include a test that a guess-the-
answer strategy (each option chosen with no trials) fails, and that a single uncontrolled trial is
insufficient.

**Graph requirement.** At least one Mystery Cart variant must require a graph (for example,
overlaying two velocity-time traces to compare slopes) as part of the distinguishing evidence.

**Difficulty levels.** Independent (learner designs the distinguishing trials) → Evidence challenge
(learner must cite the specific trials that rule out the competing explanations).

---

## Content authoring rules

1. **Original content only.** No comparator names, art, audio, story, characters, text, or layouts
   ([`COMPARATORS.md`](COMPARATORS.md)). Mission names, cart names, and copy are original.
2. **One independent variable** in every assessed comparison, per [`CURRICULUM.md`](CURRICULUM.md).
3. **Small, deliberate numbers** within the bands in [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §8.
4. **Variants preserve the relationship.** A seeded variant may change the values, the scenario
   framing, and which plausible explanations are present, but it may not change the assessed
   scientific relationship it is testing or invalidate the science review.
5. **Provenance required.** Every production scenario carries a complete provenance manifest
   ([`PROVENANCE.md`](PROVENANCE.md)); the content validator rejects a scenario without one.
6. **Graph requirement coverage.** At least one production scenario must require graph
   interpretation to succeed, and it must satisfy the semantic-equivalence requirement.
7. **No answer-key guessing.** Independent and diagnosis missions must fail a strategy that does not
   use controlled evidence.

## Content inventory (final)

The final v1 inventory is: 4 families; the Guided vertical slice is proven in ML-11 using Thruster
Test; ML-13 completes the remaining families' Supported/Independent/Diagnosis/Evidence-challenge
levels plus deterministic variants. The exact scenario list is authored in ML-05 and expanded in
ML-13; this document freezes the families and their rules, not every instance.
