# Motion Lab documentation index of record

This file is the documentation index of record for `setnessconsulting/game-motion-lab`. A document
that is not listed here is not a Motion Lab authority.

**Jira authority:** [GAME-382](https://setnessconsulting.atlassian.net/browse/GAME-382) (Epic) and
its child stories. **Frozen by:** [GAME-383](https://setnessconsulting.atlassian.net/browse/GAME-383)
(ML-01).

## How to read this set

1. Read [`PRODUCT.md`](PRODUCT.md) for what the game is and is not.
2. Read [`CURRICULUM.md`](CURRICULUM.md) for the standards boundary.
3. Read [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) before writing any physics.
4. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`adr/`](adr/) before writing any code.
5. Read [`DECISIONS.md`](DECISIONS.md) before proposing a change to any of the above.

## Contract documents

| Document | Freezes | Downstream issues that depend on it |
| --- | --- | --- |
| [`PRODUCT.md`](PRODUCT.md) | vision, learner profile, session shape, non-goals | ML-02, ML-05, ML-11, ML-13 |
| [`CURRICULUM.md`](CURRICULUM.md) | NGSS MS-PS2-2 mapping, v1 assessment boundary | ML-03, ML-05, ML-11 |
| [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) | 1D analytical model, units, sign convention, resistance policy, rounding/tolerance | ML-03, ML-04, ML-07, ML-09, ML-10 |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) + [`adr/`](adr/) | authority flow, package boundaries, technology baseline | ML-02, ML-06, ML-08, ML-09 |
| [`MISSIONS.md`](MISSIONS.md) | four canonical mission families, difficulty progression | ML-05, ML-11, ML-13 |
| [`COMPARATORS.md`](COMPARATORS.md) | scored comparator registry, dimension mapping, IP boundary | ML-16 |
| [`QUALITY_SCORECARD.md`](QUALITY_SCORECARD.md) | measurable quality rows with Meets/Below evidence | ML-11, ML-13, ML-14, ML-16 |
| [`ACCESSIBILITY.md`](ACCESSIBILITY.md) | assistive pathway contract and evidence rules | ML-02, ML-06, ML-07, ML-08, ML-09, ML-11, ML-14, ML-16 |
| [`PRIVACY.md`](PRIVACY.md) | learner-runtime privacy boundary | ML-02, ML-14 |
| [`PERFORMANCE.md`](PERFORMANCE.md) | measurement methodology and baseline capture | ML-02, ML-11, ML-14 |
| [`PROVENANCE.md`](PROVENANCE.md) | scenario/science provenance schema | ML-05, ML-13, ML-14 |
| [`RELEASE.md`](RELEASE.md) | candidate identity, qualification, promotion, rollback | ML-15, ML-PROMOTE, ML-18 |
| [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) | issue and Epic Definition of Done | all |

## Machine-readable contracts

[`../contracts/`](../contracts/) holds the machine-readable form of the same contracts. The
consistency checker asserts that the prose and the machine-readable contracts agree:

```bash
node scripts/verify-contracts.mjs
```

## Change control

A frozen contract changes only by an explicit, recorded decision in [`DECISIONS.md`](DECISIONS.md)
with a Jira reference. Silent drift between a document, `contracts/`, the code, and Jira is a
defect. When implementation reveals that a frozen decision is materially wrong, the finding is
recorded and the contract is amended — the implementation is not quietly allowed to diverge.
