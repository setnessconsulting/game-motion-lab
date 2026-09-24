# Machine-readable contracts

These files are the machine-readable form of the frozen ML-01 contracts. They exist so that
implementation and qualification can be **checked against the freeze mechanically** instead of
re-reading prose, and so a Jira issue, a document, and a test cannot silently disagree.

| File | Machine-readable form of |
| --- | --- |
| [`science-conventions.v1.json`](science-conventions.v1.json) | [`../docs/SCIENCE_MODEL.md`](../docs/SCIENCE_MODEL.md) |
| [`mission-families.v1.json`](mission-families.v1.json) | [`../docs/MISSIONS.md`](../docs/MISSIONS.md) |
| [`comparators.v1.json`](comparators.v1.json) | [`../docs/COMPARATORS.md`](../docs/COMPARATORS.md) |
| [`quality-scorecard.v1.json`](quality-scorecard.v1.json) | [`../docs/QUALITY_SCORECARD.md`](../docs/QUALITY_SCORECARD.md) |
| [`scenario-provenance.schema.json`](scenario-provenance.schema.json) | [`../docs/PROVENANCE.md`](../docs/PROVENANCE.md) |
| [`decisions.v1.json`](decisions.v1.json) | [`../docs/DECISIONS.md`](../docs/DECISIONS.md) |

## Rules

1. Every contract names its Jira authority (`GAME-382`) and the issue that froze it (`GAME-383`).
2. The prose document and the machine-readable contract must agree. A disagreement is a defect, and
   the consistency checker reports it.
3. `scenario-provenance.schema.json` is a **JSON Schema (Draft 2020-12)**. It is the schema that
   ML-05's content validator uses to validate every canonical scenario manifest.
4. These files contain no secrets and no learner data.

## Validation

From the repository root:

```bash
node scripts/verify-contracts.mjs
```

The checker is dependency-free (Node built-ins only) and validates structure, cross-references,
the display round-trip invariant, mass/isolation of an answer-key, graph-requirement coverage, and
documentation/contract agreement.
