# Motion Lab — provenance contract

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Schema:** [`../contracts/scenario-provenance.schema.json`](../contracts/scenario-provenance.schema.json).
**Authored by:** ML-05 (science provenance), ML-12 (asset provenance). **Reviewed by:** ML-05, ML-13, ML-16.

Provenance makes science review **reviewable and repeatable**. Every production scenario declares
its science in machine-readable form, and every nontrivial asset declares its origin and license.

## 1. Scenario provenance (science)

Every canonical production scenario has a provenance manifest that satisfies
[`../contracts/scenario-provenance.schema.json`](../contracts/scenario-provenance.schema.json).
At minimum it records:

| Field | Meaning |
| --- | --- |
| `scenarioId` | stable, unique, kebab-case identifier |
| `targetStandard` | the standard assessed, e.g. `NGSS MS-PS2-2` |
| `scienceConcepts` | the concepts the scenario teaches (net force, mass, acceleration, …) |
| `independentVariable` | the single variable the learner changes in the assessed comparison |
| `dependentVariable` | the variable measured |
| `controlledVariables` | the variables held fixed, each named |
| `units` | the SI units for every quantity used, consistent with [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) |
| `initialConditions` | `x0`, `v0`, declared applied forces, declared resistive force (if any) |
| `expectedRelationship` | the authoritative relationship, stated expressly (e.g. `a = Fnet/m`, proportionality claim) |
| `acceptedEvidence` | what counts as sufficient evidence for a complete claim |
| `misconceptions` | each misconception mapped to its authored remediation text |
| `debriefExplanation` | the authored explanatory debrief |
| `reviewStatus` | one of `unreviewed`, `in-review`, `reviewed`, `changes-required` |
| `reviewer` | reviewer identity (or `null` while unreviewed) |
| `referenceBasis` | external reference material where scientific reference matters, or `null` |
| `answerTolerance` | the explicit tolerance used for numeric answers (see [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §7.4) |
| `expectedTraces` | references to the golden traces that back the expected values |
| `difficultyLevel` | `guided` \| `supported` \| `independent` \| `diagnosis` \| `evidence-challenge` |
| `graphRequirement` | `none` \| `required` and which graph(s) |

Additional binding rules:

- A scenario whose `reviewStatus` is not `reviewed` with a named `reviewer` **may not ship in a
  production build**. The content validator (ML-05) fails closed on it.
- `expectedTraces` must resolve to ML-03/ML-04 golden traces; a scenario may not assert expected
  values that no trace supports.
- `answerTolerance` may not be absent, and may not default silently.
- A variant must carry its own provenance (same relationship, its own values, its own review
  record).

## 2. Asset provenance (art, audio, fonts)

Every nontrivial shipped asset — image, spritesheet, audio file, font, icon, or generated texture —
records:

| Field | Meaning |
| --- | --- |
| `assetId` | stable identifier |
| `path` | repository path of the shipped file |
| `kind` | `image` \| `spritesheet` \| `audio` \| `font` \| `icon` \| `generated` |
| `origin` | `original` \| `generated-in-repo` \| `licensed` \| `public-domain` |
| `author` / `tool` | who or what produced it |
| `license` | license identifier, or `original-work` |
| `sourceUrl` | reference where applicable, otherwise `null` |
| `derivedFrom` | upstream asset ids for derivatives, otherwise `[]` |
| `notes` | generation parameters or attribution requirements |

Binding rules:

- An asset of unknown or untraceable origin may not ship.
- No comparator asset may ever appear ([`COMPARATORS.md`](COMPARATORS.md)).
- Generated assets record the tool and the parameters so they are reproducible.
- Third-party licensed assets record the license and any attribution requirement, and the
  attribution is surfaced where the license requires it.

## 3. Build and release provenance

Build/release provenance (source SHA, lockfile identity, build hash, published prefix, pointer
identity) is specified in [`RELEASE.md`](RELEASE.md) and is not duplicated here.

## 4. Repository provenance

Because this repository begins from an initial commit with no prior implementation, migration
provenance is intentionally empty. If any content is later imported from another repository, this
file records source repository, ref, commit, and the mapping to destinations — and the source is
not modified by the import.

## 5. Review workflow

1. Author the scenario + provenance manifest + golden trace references.
2. Run the content validator (schema + cross-reference + display boundary + evidence coverage).
3. Independent science review: a reviewer other than the author checks the science, the evidence
   rule, and the misconception remediation, and either approves or returns `changes-required` with
   findings.
4. Record reviewer, date, and scenario version. Re-review is required whenever the scenario's
   science changes.
5. A high-severity science finding blocks release until it is closed and the review is re-run.

Automated validation proves internal consistency and completeness; it **cannot** certify scientific
correctness. No document may claim science approval that did not happen.
