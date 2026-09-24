# Motion Lab — NGSS MS-PS2-2 mapping and v1 assessment boundary

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).

## Primary standard

**NGSS MS-PS2-2 — Motion and Stability: Forces and Interactions**

> Plan an investigation to provide evidence that the change in an object's motion depends on the
> sum of the forces acting on the object and the mass of the object.

Motion Lab targets the full shape of that performance expectation: the learner must **plan an
investigation**, collect and interpret **evidence**, and connect the observed change in motion to
both **net force** and **mass**.

Supporting crosscutting and practice expectations Motion Lab deliberately exercises:

| Dimension | How Motion Lab expresses it |
| --- | --- |
| Science and Engineering Practice 3 — Planning and Carrying Out Investigations | The learner selects the independent variable, controls the others, and runs trials |
| Science and Engineering Practice 4 — Analyzing and Interpreting Data | Notebook comparison, position-time and velocity-time graphs, evidence selection |
| Science and Engineering Practice 7 — Engaging in Argument from Evidence | Claim + cited trials/graphs, and a debrief that must be consistent with the data |
| Crosscutting Concept 2 — Cause and Effect | Net force as the cause, acceleration as the observable effect |
| Crosscutting Concept 3 — Scale, Proportion, and Quantity | Doubling force or mass halves/doubles acceleration; proportional reasoning with small numbers |
| Crosscutting Concept 5 — Energy and Matter *(exposure only, not assessed)* | Motion change is discussed qualitatively; kinetic-energy calculation is **not** assessed in v1 |

## Disciplinary core idea alignment

The v1 design is anchored to **PS2.A: Forces and Motion** at the middle-school band:

- The motion of an object is determined by the sum of the forces acting on it.
- If the total (net) force on an object is not zero, its motion changes.
- The change in motion is greater when the net force is greater.
- The change in motion is less when the mass of the object is greater.
- For any pair of interacting objects, the force exerted is equal and opposite (not assessed in
  v1, which avoids interaction/collision scenarios).

## Frozen v1 assessment boundary

Motion Lab v1 assesses **only** the following, and nothing else:

| In scope for v1 assessment | Out of scope for v1 |
| --- | --- |
| one-dimensional motion along a straight track | two- or three-dimensional motion |
| an inertial laboratory reference frame (the track is at rest) | accelerating or rotating frames |
| balanced forces: net force zero, no change in motion | static equilibrium of extended objects |
| unbalanced forces: net force changes motion | free-body-diagram authoring or formal vector notation |
| net force as the signed sum of collinear forces | non-collinear force composition |
| mass as a resistance to a change in motion | weight vs. mass as a separate assessed concept |
| position, elapsed time, velocity, and acceleration in one dimension | displacement vs. distance as a separate assessed concept |
| constant-net-force situations, evaluated analytically | time-varying forces beyond piecewise-constant segments |
| a bounded, explicitly modeled constant resistive force where a canonical scenario requires it | velocity-dependent drag, static/kinetic friction transitions, air resistance modeling |
| one independent variable changed at a time in an assessed comparison | multi-variable causal reasoning |
| proportional reasoning with small, deliberate numbers | algebraic manipulation beyond substitution into a stated relationship |
| interpreting a position-time or velocity-time graph as evidence | graph construction from raw data by the learner |
| citing multiple trials as evidence for a claim | formal uncertainty propagation or significant-figures error analysis |

Explicitly **deferred** to a separately authorized scope decision (not to be added inside a
Motion Lab v1 story):

- projectile motion;
- rotational motion, torque, angular momentum;
- orbital mechanics;
- complex or elastic/inelastic collisions;
- open-ended rigid-body simulation;
- free-body-diagram curriculum beyond a single signed number line;
- algebra-heavy rearrangement of kinematic equations;
- energy conservation calculations;
- momentum;
- universal gravitation.

## Controlled-investigation rule (binding)

> **One independent variable changes at a time in every assessed comparison.**

The dependent variable is measured; every other variable is held controlled. The domain layer
enforces this (see [`../contracts/mission-families.v1.json`](../contracts/mission-families.v1.json)
and the ML-04 domain contract). Two outcomes are allowed:

1. **Prevent** — the configuration UI offers only the authorized independent variable; other
   values are fixed for the mission.
2. **Surface** — the learner may attempt an uncontrolled change, and the domain records the trial
   as **invalid for comparison** with an authored, non-punitive explanation of *why* two variables
   changed and why that comparison cannot isolate a cause.

A comparison that changes more than one variable must never be silently accepted as evidence.

## Difficulty progression (reasoning burden, not numeric size)

Difficulty increases by **experimental reasoning burden**, not by larger numbers, faster
animation, or more clicks:

| Level | Learner responsibility | Example shape |
| --- | --- | --- |
| **Guided** | The game identifies the variable to change | "Change the thruster force. Keep the mass the same." |
| **Supported** | The learner chooses which variable should change | "Which variable should you change to test this?" |
| **Independent** | The learner designs the controlled trial | "Design two trials that isolate the effect of mass." |
| **Diagnosis** | The learner determines which experiments distinguish competing explanations | Mystery Cart: which trials rule out a weak thruster? |
| **Evidence challenge** | The learner must support a claim with multiple trials and/or graphs | "Cite the trials that show force and acceleration are proportional here." |

Numbers stay small and deliberate: masses, forces, times, and distances are chosen so the physics
reasoning dominates, not arithmetic. See [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md#value-ranges) for
the frozen numeric bands.

## Misconception policy

Every canonical scenario must map the misconceptions it can surface and must contain an authored
debrief response for each. Minimum misconception set for v1:

| Misconception | Required authored response |
| --- | --- |
| "A constant force means constant velocity." | Contrast a zero-net-force and a nonzero-net-force trial |
| "A bigger cart always moves faster." | Distinguish mass effect from force effect using controlled trials |
| "Motion is caused by a stored force inside the object." | Attribute motion change to net force, not to the object |
| "If forces are balanced the object must be stopped." | Constant-velocity balanced trial |
| "Heavier objects always accelerate the same because gravity is not involved." | Controlled force with varying mass |
| "Friction is always present and always the reason." | Show a scenario where the declared resistive force is zero and the result still matches |

Misconceptions are recorded in machine-readable form in each scenario's provenance manifest
(see [`PROVENANCE.md`](PROVENANCE.md)); their remediation text is science-reviewed with the
scenario.

## Science review

Every production scenario's expected relationship, accepted evidence, misconception mapping, and
debrief text are independently science-reviewed before ML-11 closes and again for the final
production content set in ML-13. Review is recorded with reviewer identity, date, and scenario
version. Automated tests can prove internal consistency; they cannot certify scientific
correctness, and no document may claim science approval that did not occur.
