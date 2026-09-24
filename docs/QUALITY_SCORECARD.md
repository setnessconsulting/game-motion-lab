# Motion Lab — quality scorecard

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Machine-readable form:** [`../contracts/quality-scorecard.v1.json`](../contracts/quality-scorecard.v1.json).
**Used by:** ML-11 (vertical-slice gate), ML-13 (content gate), ML-14 (automated evidence), ML-16 (human/comparator review).

Every row below has an **observable Meets definition and an observable Below definition**. A row is
never scored on adjectives alone: each one names the artifact or measurement that decides it. When a
row cannot be decided from an artifact, it is decided by a named human review and the review is
recorded — it is never inferred from a passing test.

## Scoring method

- **Meets** — the Meets definition is satisfied and the named evidence exists for the current
  candidate identity.
- **Below** — the Meets definition is not satisfied, or the named evidence does not exist, or it
  exists for a *different* candidate identity.
- **Not assessed** — only allowed with a recorded reason (for example, a human gate that has not run
  yet). `Not assessed` is never counted as a pass.
- Scoring is on the **scored comparator dimensions only** for comparator rows. Motion Lab is never
  scored globally against any comparator and never against Kerbal Space Program
  ([`COMPARATORS.md`](COMPARATORS.md)).

## Rows

### Science and reasoning

| ID | Dimension | Comparator | Meets | Below | Evidence | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Q-01 | Scientific clarity | PhET | Every displayed quantity has a unit, every asserted relationship matches [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md), and a science reviewer finds no high-severity defect | Any displayed value or claim contradicts the frozen model, or a high-severity science finding is open | ML-03/04 golden fixtures; science review record | ML-11, ML-13, ML-16 |
| Q-02 | Measurement clarity | PhET, Algodoo | Each instrument names the quantity and unit, and its displayed value equals the authoritative value formatted by the frozen rounding rule | An instrument shows an unlabelled, unitless, or ambiguously sourced value | Instrument-to-fixture test (ML-07); screenshot review | ML-11, ML-14 |
| Q-03 | Visual force representation | PhET | Force arrows encode direction redundantly (arrowhead + text label + sign) and their magnitudes are consistent with authoritative net force | Direction or magnitude is conveyed by colour alone, or a visual force disagrees with authoritative net force | ML-06 render test; accessibility review | ML-11 |
| Q-04 | Inspectability of state | PhET | The learner can read position, velocity, acceleration, net force, and elapsed time as text at any time during a trial | Any of those values is only obtainable from canvas geometry | Semantic DOM inspection; keyboard journey | ML-11, ML-14 |
| Q-05 | Evidence dependence | none (Motion Lab specific) | A scripted click-everything strategy with no controlled trials fails every assessed mission; a correct claim with no cited evidence is not accepted | Any assessed mission can be completed without producing and citing controlled evidence | ML-10 state-machine tests; ML-13 guess-strategy test | ML-11, ML-13 |
| Q-06 | Graph interpretation required | none (Motion Lab specific) | ≥1 production scenario cannot be solved without reading a position-time or velocity-time graph as evidence | Every mission is solvable with numeric instruments alone | Scenario provenance flags; ML-11 journey test | ML-11, ML-13 |

### Experimentation and iteration

| ID | Dimension | Comparator | Meets | Below | Evidence | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Q-07 | Experimentation / trial design | Algodoo | The learner chooses which variable to change in at least the Supported level and above, and the domain records the trial as a controlled comparison | The game fixes every variable in every assessed comparison, or an uncontrolled trial counts as evidence | ML-04 control-variable tests; ML-13 scenario flags | ML-11, ML-13 |
| Q-08 | Visual cause-and-effect | Algodoo | Changing net force or mass produces an immediately visible change in motion consistent with the authoritative trace | The visible motion contradicts or lags the authoritative trace | ML-06 render-vs-trace comparison | ML-11 |
| Q-09 | Graph usability and honesty | Algodoo | Graphs use authoritative data, labelled axes and units, deterministic scales, an explicit origin, and provide a table equivalent | A graph uses pixel geometry, unlabelled units, smoothed data, or a truncated axis that changes the interpretation | ML-09 graph fixtures; accessibility review | ML-11, ML-14 |
| Q-10 | Rapid trial iteration | Algodoo, Poly Bridge 3 | Running and recording a second trial is reachable in a small, bounded number of actions, and no animation dwell blocks the next trial | A trial cannot be repeated without leaving the mission or waiting on presentation timing | Interaction-count test; state-transition latency evidence | ML-11 |
| Q-11 | Revision / recovery cycle | Poly Bridge 3 | Retry is unlimited or clearly bounded, non-punitive, and creates a new trial identity without rewriting prior evidence | Retry loses evidence, punishes the learner, or silently overwrites trial history | ML-04/ML-10 recovery tests | ML-11 |

### Presentation and game feel

| ID | Dimension | Comparator | Meets | Below | Evidence | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Q-12 | Game feel / immediate feedback | Poly Bridge 3 | A committed action produces visible feedback within the recorded state-transition latency budget, excluding intentional dwell | An action produces no feedback, or feedback is delayed beyond the recorded budget | Latency evidence (ML-14) | ML-11, ML-12 |
| Q-13 | Clarity of simulation outcome | Poly Bridge 3 | After a run, the learner can state what happened and why from the displayed evidence without external help | The outcome is ambiguous or requires guessing which evidence matters | Target-age playtest record (ML-16); debrief review | ML-11, ML-16 |
| Q-14 | Presentation quality | Poly Bridge 3 | Production art is original, consistent, crisp at the tested viewports, and free of placeholder art in released screens | Placeholder or inconsistent art ships, or art breaks at a tested viewport | Asset provenance; screenshot review | ML-12, ML-16 |
| Q-15 | Mission clarity (first use) | none (Motion Lab specific) | A first-time learner identifies the mission objective without external instruction | A first-time learner cannot state the objective from the brief and first screen | Target-age playtest record (ML-16) | ML-11, ML-16 |

### Architecture, accessibility, performance, integrity

| ID | Dimension | Comparator | Meets | Below | Evidence | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| Q-16 | Deterministic authority separation | none (Motion Lab specific) | Architecture tests fail on any forbidden edge (science/domain importing React/Phaser/DOM/storage/network), and no authoritative value derives from renderer state | A forbidden import exists, or a scientific value is derivable from pixels/sprites/collisions/animation | Architecture-boundary tests; import lint | ML-02, ML-11, ML-14 |
| Q-17 | Determinism and replay | none (Motion Lab specific) | The same seed and configuration produce bit-identical authoritative evidence across runs and across renderer frame rates | Evidence differs between runs or between frame rates | Golden/property tests; replay test | ML-03, ML-14 |
| Q-18 | Accessibility / input parity | none (higher bar than all comparators) | The keyboard, screen-reader, reduced-motion, zoom, and non-colour journeys each complete a representative mission and obtain all required evidence; automated axe checks pass with no serious/critical violations | Any required journey cannot complete, or evidence is canvas-only, or a serious/critical axe violation is open | ML-14 automated lane + ML-16 manual record | ML-11, ML-14, ML-16 |
| Q-19 | Performance / responsiveness | none (Motion Lab specific) | Every ML-02 baseline metric is measured against the pinned baseline, material regressions are remediated or explicitly waived, and no new long task or memory trend is introduced | A material regression is unaddressed, or a metric is claimed without measurement | ML-14 evidence manifest | ML-14 |
| Q-20 | Privacy integrity | none (Motion Lab specific) | Qualified flows show no unintended learner-data transmission and no prohibited runtime dependency; no telemetry/LLM/account path exists | Any learner-data transmission, tracker, analytics SDK, or account path exists | Network assertion; dependency review | ML-02, ML-14 |
| Q-21 | Originality / IP separation | none (Motion Lab specific) | No comparator art, audio, name, character, text, or layout ships; asset provenance is complete; the IP review finds no unresolved issue | Any comparator-derived content ships, or an asset has unknown provenance | Asset provenance manifest; ML-16 IP review | ML-12, ML-16 |
| Q-22 | Content completeness | none (Motion Lab specific) | All four mission families are playable end-to-end with provenance manifests for every scenario and no `unreviewed` scenario in a production build | A required family is missing, or a shipped scenario lacks provenance or review | Content validator; ML-13 inventory | ML-13 |
| Q-23 | Content originality of science copy | none (Motion Lab specific) | Debrief and mission copy are original and reviewed for reading level at grades 6–8 | Copy is copied, or its reading level is not reviewed | Reading-level review; provenance | ML-13 |

## Gate summary

| Gate | Rows that must not be `Below` |
| --- | --- |
| ML-11 (vertical slice) | Q-01, Q-02, Q-03, Q-04, Q-05, Q-07, Q-08, Q-10, Q-11, Q-13, Q-15, Q-16, Q-18 |
| ML-13 (content) | Q-05, Q-06, Q-07, Q-22, Q-23 |
| ML-14 (automated qualification) | Q-02, Q-04, Q-09, Q-16, Q-17, Q-19, Q-20 |
| ML-16 (human/comparator) | every row; no `Below` and no unresolved `Not assessed` on a release-relevant row |

## Maintenance

Rows are added when a new dimension is introduced; rows are removed only with a `DECISIONS.md`
entry. The machine-readable copy in [`../contracts/quality-scorecard.v1.json`](../contracts/quality-scorecard.v1.json)
is the form the consistency checker validates; the two must stay in agreement.
