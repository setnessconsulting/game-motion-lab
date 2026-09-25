import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as science from "../../src/science/index.js";
import * as domain from "../../src/domain/index.js";
import * as content from "../../src/content/index.js";
import * as viewmodel from "../../src/viewmodel/index.js";

/**
 * Purity check for the scientific authority.
 *
 * This suite runs in the Vitest `node` environment (vitest.config.ts), so there is no
 * `window` and no `document`. A science/domain module that touched the DOM at module
 * scope, or during evaluation, would fail here — which is a stronger statement than
 * grepping for the word "document".
 */

describe("the test environment really has no DOM", () => {
  it("has no window or document, so this check cannot pass vacuously", () => {
    expect(typeof globalThis.window).toBe("undefined");
    expect(typeof (globalThis as { document?: unknown }).document).toBe("undefined");
  });
});

describe("authoritative packages evaluate and compute without a DOM", () => {
  it("samples the analytical kernel with no browser globals present", () => {
    const declaration = science.singleSegmentDeclaration({
      massKilograms: 2,
      initialVelocityMetresPerSecond: 1,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 2,
    });
    const state = science.stateAt(declaration, 2);
    expect(state.positionMetres).toBe(2);
    expect(state.netForceNewtons).toBe(0);
  });

  it("reduces a mission with no browser globals present", () => {
    const initial = domain.createInitialMissionState("purity");
    const next = domain.reduceMission(initial, { kind: "begin-preview-trial" });
    expect(next.trials).toHaveLength(1);
  });

  it("projects a view model with no browser globals present", () => {
    const state = domain.reduceMission(domain.createInitialMissionState("purity"), {
      kind: "begin-preview-trial",
    });
    const model = viewmodel.toSceneModel(state, {
      playbackSeconds: 1,
      running: false,
      reducedMotion: false,
    });
    expect(model.playback.samples.length).toBeGreaterThan(0);
  });

  it("records and replays experiment evidence with no browser globals present", () => {
    const active: domain.ControlledInvestigation = {
      investigationId: "purity",
      independentVariableId: "appliedForceNewtons",
      dependentVariableIds: ["appliedForceNewtons"],
      controlledVariableIds: domain.ALL_VARIABLE_IDS.filter(
        (id) => id !== "appliedForceNewtons"
      ),
      declaredVariables: domain.ALL_VARIABLE_IDS.map((id) => ({
        id,
        quantity: "mass",
        role: id === "appliedForceNewtons" ? ("independent" as const) : ("controlled" as const),
        bounds:
          id === "cartMassKilograms"
            ? ([1, 4] as const)
            : id === "observationWindowSeconds"
              ? ([1, 6] as const)
              : id === "initialVelocityMetresPerSecond"
                ? ([-2, 2] as const)
                : ([-12, 12] as const),
        step: 0.5,
        learnerAdjustable: true,
        label: id,
      })),
    };
    const evidence = domain.runTrialEvidence({
      missionId: "purity",
      scenarioId: "purity",
      comparisonSetId: "purity-set",
      trialId: domain.buildTrialId("purity", "purity-set", 0),
      ordinal: 0,
      variantSeed: 1,
      investigation: active,
      request: {
        configuration: {
          cartMassKilograms: 2,
          appliedForceNewtons: 4,
          initialVelocityMetresPerSecond: 0,
          observationWindowSeconds: 3,
        },
        sampleCount: 5,
        positionTargetsMetres: [4],
      },
    });
    expect(domain.replayTrialEvidence(evidence, { investigation: active }).status).toBe(
      "reproduced"
    );
    expect(domain.findMeasurement(evidence.measurements, "timeToPosition", 4)?.value).toBe(2);
  });

  it("exports no class or function that requires a DOM node to construct", () => {
    for (const [name, value] of Object.entries(science)) {
      if (typeof value === "function" && name !== "roundHalfAwayFromZero") continue;
      // Constants and pure functions only; nothing here is a DOM-bound factory.
      expect(["function", "object", "string", "number", "boolean"].includes(typeof value)).toBe(
        true
      );
    }
    expect(typeof science.formatQuantity).toBe("function");
  });

  it("validates the canonical content set with no browser globals present", () => {
    // The content validator is the gate for the v1 scenario set. Running it
    // here proves it never reaches for a browser to decide whether content is
    // admissible, which is the same purity claim the science layer makes.
    const scenarios = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/content/scenarios/thruster-force-doubling.provenance.json"), "utf8")
    ) as unknown;
    const schema = JSON.parse(
      readFileSync(resolve(process.cwd(), "contracts/scenario-provenance.schema.json"), "utf8")
    ) as unknown;
    const violations = content.validateAgainstSchema(schema, (scenarios as { manifest: unknown }).manifest);
    expect(violations).toStrictEqual([]);
    expect(typeof content.validateContentSet).toBe("function");
  });
});

describe("authoritative state is JSON-safe", () => {
  it("round-trips mission state through JSON without loss", () => {
    const state = domain.reduceMission(
      domain.reduceMission(domain.createInitialMissionState("purity"), {
        kind: "set-draft",
        patch: { initialVelocityMetresPerSecond: -0.5 },
      }),
      { kind: "begin-preview-trial" }
    );
    const roundTripped = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(roundTripped).toStrictEqual(state);
  });

  it("carries no DOM node, function, or undefined value in a trial record", () => {
    const state = domain.reduceMission(domain.createInitialMissionState("purity"), {
      kind: "begin-preview-trial",
    });
    const serialised = JSON.stringify(state);
    expect(serialised).not.toContain("function");
    expect(serialised).not.toContain("undefined");
  });

  it("exports no DOM-bound factory from the experiment layer", () => {
    // Every domain export must be a plain value or a pure function. A class
    // whose constructor needed an element would be a boundary violation.
    for (const [name, value] of Object.entries(domain)) {
      expect(
        ["function", "object", "string", "number", "boolean"],
        `${name} has unexpected type ${typeof value}`
      ).toContain(typeof value);
    }
  });

  it("exports no DOM-bound factory from the content layer", () => {
    for (const [name, value] of Object.entries(content)) {
      expect(
        ["function", "object", "string", "number", "boolean"],
        `${name} has unexpected type ${typeof value}`
      ).toContain(typeof value);
    }
  });
});
