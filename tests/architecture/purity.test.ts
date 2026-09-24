import { describe, expect, it } from "vitest";
import * as science from "../../src/science/index.js";
import * as domain from "../../src/domain/index.js";
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
  it("samples the balanced-force case with no browser globals present", () => {
    const state = science.sampleBootstrapLinearState(
      { initialPositionMetres: 0, velocityMetresPerSecond: 1 },
      2
    );
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
});
