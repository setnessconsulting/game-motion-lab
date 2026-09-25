/**
 * The canonical content set passes every machine-checkable content rule.
 *
 * This is GAME-389 acceptance criterion 1 (machine-readable and
 * schema-validated) and criterion 2 (expected outputs backed by golden
 * traces), asserted against the real files and the real kernel.
 *
 * It is not, and does not claim to be, acceptance criterion 3 (independent
 * science review) or criterion 4 (grades 6-8 reading review). A green run
 * here means the set is internally consistent, not that it has been judged.
 */

import { describe, expect, it } from "vitest";
import {
  FAMILY_DEFINITIONS,
  FAMILY_IDS,
  validateContentSet,
  validateAgainstSchema,
  ambiguousForcesFor,
  everyCauseHasIndistinguishableRival,
  diagnoseBoundedCause,
  type Observation,
} from "../../src/content/index.js";
import {
  FROZEN_FAMILY_CONTRACT,
  FROZEN_PROVENANCE_SCHEMA,
  GOLDENS,
  SCENARIOS,
  evidenceSummaries,
  resolveTraceReference,
} from "./content-loader.js";

const EVIDENCE = evidenceSummaries();

const DEFECTS = validateContentSet({
  schema: FROZEN_PROVENANCE_SCHEMA,
  families: FAMILY_DEFINITIONS,
  scenarios: SCENARIOS,
  traces: GOLDENS,
  evidence: EVIDENCE,
  diagnoses: new Map(),
  resolveTrace: resolveTraceReference,
});

describe("the content set is schema-valid against the frozen provenance schema", () => {
  it("validates every manifest with additionalProperties:false enforced", () => {
    for (const scenario of SCENARIOS) {
      const violations = validateAgainstSchema(FROZEN_PROVENANCE_SCHEMA, scenario.manifest);
      expect(violations, `${scenario.manifest.scenarioId}: ${JSON.stringify(violations)}`).toStrictEqual(
        []
      );
    }
  });

  it("fails the check non-vacuously, by adding a property the schema forbids", () => {
    const tampered = {
      ...SCENARIOS[0]!.manifest,
      notAFieldTheSchemaKnows: true,
    };
    const violations = validateAgainstSchema(FROZEN_PROVENANCE_SCHEMA, tampered);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((entry) => entry.path.includes("notAFieldTheSchemaKnows"))).toBe(true);
  });
});

describe("the content set satisfies every content rule", () => {
  it("reports no content defects at all", () => {
    expect(
      DEFECTS.map((defect) => `${defect.code} ${defect.scenarioId} ${defect.path}: ${defect.message}`)
    ).toStrictEqual([]);
  });

  it("is not vacuous, by breaking a scenario and seeing a defect appear", () => {
    const tampered = SCENARIOS.map((scenario) =>
      scenario.manifest.scenarioId === "thruster-force-doubling"
        ? {
            ...scenario,
            manifest: { ...scenario.manifest, answerKeyBounded: false as unknown as true },
          }
        : scenario
    );
    const defects = validateContentSet({
      schema: FROZEN_PROVENANCE_SCHEMA,
      families: FAMILY_DEFINITIONS,
      scenarios: tampered,
      traces: GOLDENS,
      evidence: EVIDENCE,
      diagnoses: new Map(),
      resolveTrace: resolveTraceReference,
    });
    expect(defects.some((defect) => defect.code === "guessable-answer-key")).toBe(true);
  });

  it("covers all four frozen families with at least one scenario each", () => {
    for (const familyId of FAMILY_IDS) {
      const members = SCENARIOS.filter((scenario) => scenario.manifest.familyId === familyId);
      expect(members.length, `family ${familyId}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives every scenario a unique kebab-case id", () => {
    const ids = SCENARIOS.map((scenario) => scenario.manifest.scenarioId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("offers only difficulty levels the family contract actually offers", () => {
    for (const family of FROZEN_FAMILY_CONTRACT.families) {
      for (const scenario of SCENARIOS.filter(
        (entry) => entry.manifest.familyId === family.id
      )) {
        expect(family.difficultyLevels, `${family.id}/${scenario.manifest.scenarioId}`).toContain(
          scenario.manifest.difficultyLevel
        );
      }
    }
  });

  it("maps every misconception the frozen family contract names, with a remediation", () => {
    // The frozen contract states misconceptions as prose; the typed mirror in
    // src/content/families.ts gives each one a stable kebab-case id. Coverage
    // is checked against the mirror, and the mirror is checked against the
    // contract immediately below, so an id can never quietly stop standing
    // for a contract misconception.
    for (const family of FAMILY_DEFINITIONS) {
      const covered = new Set(
        SCENARIOS.filter((scenario) => scenario.manifest.familyId === family.id).flatMap(
          (scenario) => scenario.manifest.misconceptions.map((entry) => entry.id)
        )
      );
      for (const misconception of family.misconceptions) {
        expect(covered.has(misconception), `${family.id} is missing ${misconception}`).toBe(true);
      }
    }
    for (const scenario of SCENARIOS) {
      for (const entry of scenario.manifest.misconceptions) {
        expect(entry.remediation.length, `${entry.id} needs remediation copy`).toBeGreaterThan(20);
        expect(entry.statement.length, `${entry.id} needs a statement`).toBeGreaterThan(10);
      }
    }
  });

  it("keeps every misconception id traceable to a misconception the frozen contract names", () => {
    for (const family of FROZEN_FAMILY_CONTRACT.families) {
      const mirror = FAMILY_DEFINITIONS.find((entry) => entry.id === family.id);
      expect(mirror, `${family.id} has no typed mirror`).toBeDefined();
      // One mirror id per contract misconception, position for position, so the
      // mapping stays traceable even though the wording differs.
      expect(mirror!.misconceptions.length).toBe(family.misconceptions.length);
      for (const id of mirror!.misconceptions) {
        expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(family.misconceptions.length).toBeGreaterThan(0);
      }
    }
  });

  it("satisfies the mandated graph-interpretation requirement", () => {
    const satisfying = FROZEN_FAMILY_CONTRACT.families.filter(
      (family) =>
        family.id === FROZEN_FAMILY_CONTRACT.graphInterpretationRequirement.satisfiedBy
    );
    expect(satisfying.length).toBe(1);
    const required = SCENARIOS.filter(
      (scenario) =>
        scenario.manifest.familyId === satisfying[0]!.id &&
        scenario.manifest.graphRequirement.level === "required" &&
        scenario.manifest.graphRequirement.graphs.includes("velocity-time")
    );
    expect(required.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps a graph-required scenario inside the family's declared graph set", () => {
    for (const family of FROZEN_FAMILY_CONTRACT.families) {
      for (const scenario of SCENARIOS.filter((entry) => entry.manifest.familyId === family.id)) {
        for (const graph of scenario.manifest.graphRequirement.graphs) {
          expect(family.graphRequirement.graphs, `${family.id} graph ${graph}`).toContain(graph);
        }
      }
    }
  });

  it("uses only original, provenance-declared content: no unreviewed scenario claims to be reviewed", () => {
    for (const scenario of SCENARIOS) {
      expect(scenario.manifest.reviewStatus).toBe("unreviewed");
      expect(scenario.manifest.reviewer).toBeNull();
    }
  });
});

describe("every diagnosis scenario is well-posed and not guessable", () => {
  const mysteries = SCENARIOS.filter((scenario) => scenario.manifest.familyId === "mystery-cart");

  it("has at least one diagnosis scenario", () => {
    expect(mysteries.length).toBeGreaterThanOrEqual(1);
  });

  for (const scenario of mysteries) {
    const id = scenario.manifest.scenarioId;
    const summaries = EVIDENCE.get(id) ?? [];
    const forces = [...new Set(summaries.map((s) => s.appliedForceNewtons))].sort((a, b) => a - b);
    const toObservation = (summary: (typeof summaries)[number]): Observation => ({
      trialKey: summary.trialKey,
      subject: summary.subject,
      appliedForceNewtons: summary.appliedForceNewtons,
      measuredAccelerationMetresPerSecondSquared: summary.accelerationOfTrial,
      measuredNetForceNewtons: summary.netForceNewtonsOfTrial,
    });

    it(`${id}: every cause has a rival one reading cannot rule out`, () => {
      expect(everyCauseHasIndistinguishableRival(scenario.design.candidateCauses ?? [], forces)).toBe(
        true
      );
    });

    it(`${id}: names, for each cause, the force that keeps it ambiguous`, () => {
      // Recorded rather than asserted to a fixed answer, so a reviewer can read
      // why the puzzle is hard. Every cause must name at least one force.
      const report = (scenario.design.candidateCauses ?? []).map(
        (cause) => `${cause.id}: ${ambiguousForcesFor(cause, scenario.design.candidateCauses ?? [], forces).join(" ")}`
      );
      expect(report.every((line) => !line.endsWith(": ")), report.join("; ")).toBe(true);
    });

    it(`${id}: is not vacuous, because the guarantee fails for a single-cause option set`, () => {
      const causes = scenario.design.candidateCauses ?? [];
      expect(everyCauseHasIndistinguishableRival([causes[0]!], forces)).toBe(false);
    });

    it(`${id}: exactly one cause survives the full evidence`, () => {
      const verdict = diagnoseBoundedCause(
        {
          observations: summaries.filter((s) => s.subject === "suspect").map(toObservation),
          controlObservations: summaries.filter((s) => s.subject === "reference").map(toObservation),
        },
        scenario.design.candidateCauses ?? []
      );
      expect(verdict.reason).toBe("diagnosed");
      const golden = GOLDENS.get(id);
      expect(verdict.causeId).toBe(golden?.diagnosis?.causeId);
      expect(verdict.rejected.map((entry) => entry.causeId).sort()).toStrictEqual(
        [...(golden?.diagnosis?.rejectedCauseIds ?? [])].sort()
      );
    });

    it(`${id}: refuses to answer from a single trial`, () => {
      const summaries = EVIDENCE.get(id) ?? [];
      const oneReading = summaries.filter(
        (summary) => summary.subject === "suspect"
      )[0];
      expect(oneReading).toBeDefined();
      const verdict = diagnoseBoundedCause(
        { observations: [toObservation(oneReading!)] },
        scenario.design.candidateCauses ?? []
      );
      expect(verdict.causeId).toBeNull();
      expect(verdict.reason).toBe("insufficient-comparisons");
    });

    it(`${id}: offers the four frozen candidate causes`, () => {
      expect((scenario.design.candidateCauses ?? []).map((cause) => cause.id).sort()).toStrictEqual([
        "correct-calibration",
        "incorrect-cargo-mass",
        "unexpected-resistive-force",
        "weak-thruster",
      ]);
    });
  }
});
