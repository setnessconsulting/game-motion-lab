/**
 * The schema-subset validator is correct, and it fails closed.
 *
 * The fail-closed behaviour is the part that matters. A validator that ignores
 * a keyword it does not understand would report a scenario as valid because of
 * a constraint nobody actually checked, which is the worst possible failure
 * mode for a gate that exists to catch un-reviewed content.
 */

import { describe, expect, it } from "vitest";
import { validateAgainstSchema } from "../../src/content/index.js";
import { FROZEN_PROVENANCE_SCHEMA, SCENARIOS } from "./content-loader.js";

const VALID = SCENARIOS[0]!.manifest;

function paths(value: unknown): readonly string[] {
  return validateAgainstSchema(FROZEN_PROVENANCE_SCHEMA, value).map(
    (entry) => `manifest${entry.path === "" ? "" : `.${entry.path}`}`
  );
}

describe("a conformant manifest validates cleanly", () => {
  it("returns no violations", () => {
    expect(validateAgainstSchema(FROZEN_PROVENANCE_SCHEMA, VALID)).toStrictEqual([]);
  });
});

describe("the validator enforces every keyword the frozen schema uses", () => {
  it("enforces required properties", () => {
    const { title, ...withoutTitle } = VALID as unknown as Record<string, unknown>;
    expect(title).toBeDefined();
    expect(paths(withoutTitle)).toContain("manifest.title");
  });

  it("enforces const", () => {
    expect(paths({ ...VALID, targetStandard: "NGSS MS-PS1-1" })).toContain(
      "manifest.targetStandard"
    );
    expect(paths({ ...VALID, schemaVersion: 2 })).toContain("manifest.schemaVersion");
  });

  it("enforces enum", () => {
    expect(paths({ ...VALID, familyId: "rocket-lab" })).toContain("manifest.familyId");
  });

  it("enforces type, including union types", () => {
    expect(paths({ ...VALID, scienceConcepts: "balanced-force" })).toContain(
      "manifest.scienceConcepts"
    );
    expect(paths({ ...VALID, reviewer: 7 })).toContain("manifest.reviewer");
    expect(paths({ ...VALID, referenceBasis: null })).toStrictEqual([]);
  });

  it("enforces additionalProperties: false", () => {
    expect(paths({ ...VALID, smuggled: 1 })).toContain("manifest.smuggled");
  });

  it("enforces pattern", () => {
    expect(paths({ ...VALID, scenarioId: "Not Kebab Case" })).toContain("manifest.scenarioId");
    expect(paths({ ...VALID, scenarioId: "ok-kebab-case" })).toStrictEqual([]);
  });

  it("enforces minLength", () => {
    expect(paths({ ...VALID, title: "" })).toContain("manifest.title");
  });

  it("enforces minItems and uniqueItems", () => {
    expect(paths({ ...VALID, acceptedEvidence: [] })).toContain("manifest.acceptedEvidence");
    expect(paths({ ...VALID, scienceConcepts: ["mass", "mass"] })).toContain(
      "manifest.scienceConcepts"
    );
  });

  it("enforces minimum and maximum on the answer tolerance", () => {
    expect(
      paths({
        ...VALID,
        answerTolerance: { ...VALID.answerTolerance, relative: 0.001 },
      })
    ).toContain("manifest.answerTolerance.relative");
    expect(
      paths({
        ...VALID,
        answerTolerance: { ...VALID.answerTolerance, relative: 0.5 },
      })
    ).toContain("manifest.answerTolerance.relative");
  });

  it("enforces exclusiveMinimum on the observation span", () => {
    expect(
      paths({
        ...VALID,
        initialConditions: { ...VALID.initialConditions, observationWindowSeconds: 0 },
      })
    ).toContain("manifest.initialConditions.observationWindowSeconds");
  });

  it("enforces the allOf/if/then rule that binds graph level to the graph list", () => {
    expect(paths({ ...VALID, graphRequirement: { level: "none", graphs: ["velocity-time"] } })).toContain(
      "manifest.graphRequirement.graphs"
    );
    expect(paths({ ...VALID, graphRequirement: { level: "required", graphs: [] } })).toContain(
      "manifest.graphRequirement.graphs"
    );
    expect(
      paths({ ...VALID, graphRequirement: { level: "none", graphs: [] } })
    ).toStrictEqual([]);
  });

  it("checks the date format on a present review date", () => {
    expect(paths({ ...VALID, reviewDate: "last tuesday" })).toContain("manifest.reviewDate");
    expect(paths({ ...VALID, reviewDate: "2026-09-25" })).toStrictEqual([]);
  });
});

describe("the validator refuses to guess", () => {
  it("reports an unimplemented schema keyword instead of ignoring it", () => {
    const withExoticKeyword = {
      type: "object",
      properties: { a: { type: "string", patternProperties: { "^x": { type: "string" } } } },
    };
    const violations = validateAgainstSchema(withExoticKeyword, { a: "xy" });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]!.message).toContain("unimplemented keyword");
  });

  it("refuses a schema that is not an object at all", () => {
    expect(validateAgainstSchema("not a schema", {})).toHaveLength(1);
  });
});
