import { describe, expect, it } from "vitest";
import {
  ScienceValidationError,
  accelerationFor,
  composeNetForce,
  formatQuantity,
  reversalTimeSeconds,
  roundForDisplay,
  sampleTrajectory,
  singleSegmentDeclaration,
  stateAt,
} from "../../src/science/index.js";

describe("net-force composition", () => {
  it("sums collinear applied forces", () => {
    expect(composeNetForce([3, -1, 2])).toBe(4);
  });

  it("subtracts an explicitly declared resistive force opposing +x", () => {
    expect(composeNetForce([6], { magnitudeNewtons: 2, opposingDirection: 1 })).toBe(4);
  });

  it("adds resistive magnitude when opposing −x motion", () => {
    expect(composeNetForce([-6], { magnitudeNewtons: 2, opposingDirection: -1 })).toBe(-4);
  });

  it("rejects empty force lists and non-finite entries", () => {
    expect(() => composeNetForce([])).toThrow(ScienceValidationError);
    expect(() => composeNetForce([Number.NaN])).toThrow(ScienceValidationError);
  });

  it("rejects negative or non-finite resistive magnitude", () => {
    expect(() =>
      composeNetForce([1], { magnitudeNewtons: -1, opposingDirection: 1 })
    ).toThrow(ScienceValidationError);
  });
});

describe("analytical kinematics", () => {
  it("implements a = Fnet/m, v(t), and x(t) for constant force from rest", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      appliedForcesNewtons: [4],
      observationWindowSeconds: 2,
    });
    const atTwo = stateAt(declaration, 2);
    expect(atTwo.netForceNewtons).toBe(4);
    expect(atTwo.accelerationMetresPerSecondSquared).toBe(2);
    expect(atTwo.velocityMetresPerSecond).toBe(4);
    expect(atTwo.positionMetres).toBe(4);
  });

  it("keeps velocity constant when Fnet = 0", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialVelocityMetresPerSecond: 1.5,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 4,
    });
    const atFour = stateAt(declaration, 4);
    expect(atFour.accelerationMetresPerSecondSquared).toBe(0);
    expect(atFour.velocityMetresPerSecond).toBe(1.5);
    expect(atFour.positionMetres).toBe(6);
  });

  it("scales acceleration with force at fixed mass", () => {
    expect(accelerationFor({ massKilograms: 2, appliedForcesNewtons: [4], observationWindowSeconds: 1 })).toBe(2);
    expect(accelerationFor({ massKilograms: 2, appliedForcesNewtons: [8], observationWindowSeconds: 1 })).toBe(4);
  });

  it("scales acceleration inversely with mass at fixed force", () => {
    expect(accelerationFor({ massKilograms: 2, appliedForcesNewtons: [4], observationWindowSeconds: 1 })).toBe(2);
    expect(accelerationFor({ massKilograms: 4, appliedForcesNewtons: [4], observationWindowSeconds: 1 })).toBe(1);
  });

  it("is deterministic: identical inputs produce bit-identical outputs", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 1.5,
      initialVelocityMetresPerSecond: 0.5,
      appliedForcesNewtons: [3],
      observationWindowSeconds: 3,
    });
    expect(stateAt(declaration, 1.25)).toStrictEqual(stateAt(declaration, 1.25));
    expect(sampleTrajectory(declaration, 11)).toStrictEqual(sampleTrajectory(declaration, 11));
  });

  it("exposes analytic reversal time and rejects mid-segment reversals", () => {
    expect(reversalTimeSeconds(2, -1)).toBe(2);
    expect(reversalTimeSeconds(0, 2)).toBe(0);
    const crossing = singleSegmentDeclaration({
      massKilograms: 1,
      initialVelocityMetresPerSecond: 2,
      appliedForcesNewtons: [-1],
      observationWindowSeconds: 3,
    });
    expect(() => stateAt(crossing, 1)).toThrow(ScienceValidationError);
    try {
      stateAt(crossing, 1);
    } catch (error) {
      expect(error).toBeInstanceOf(ScienceValidationError);
      expect((error as ScienceValidationError).code).toBe("reversal-crossing-window");
    }
  });
});

describe("validation rejects rather than clamps", () => {
  it("rejects non-positive mass, negative time, and out-of-window samples", () => {
    expect(() =>
      stateAt(
        singleSegmentDeclaration({
          massKilograms: 0,
          appliedForcesNewtons: [1],
          observationWindowSeconds: 1,
        }),
        0
      )
    ).toThrow(ScienceValidationError);

    const ok = singleSegmentDeclaration({
      massKilograms: 2,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 2,
    });
    expect(() => stateAt(ok, -0.1)).toThrow(ScienceValidationError);
    expect(() => stateAt(ok, 2.1)).toThrow(ScienceValidationError);
  });

  it("fails closed on an unsupported force model", () => {
    const declaration = {
      observationWindowSeconds: 1,
      segments: [
        {
          massKilograms: 1,
          initialPositionMetres: 0,
          initialVelocityMetresPerSecond: 0,
          appliedForcesNewtons: [1] as const,
          forceModel: "velocity-proportional-drag",
          durationSeconds: 1,
        },
      ],
    };
    expect(() => stateAt(declaration as never, 0.5)).toThrow(ScienceValidationError);
  });
});

describe("display rounding never feeds back into science", () => {
  it("leaves authoritative state full-precision while formatQuantity is presentation-only", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 3,
      appliedForcesNewtons: [1],
      observationWindowSeconds: 1,
    });
    const state = stateAt(declaration, 1);
    const displayed = formatQuantity("position", state.positionMetres);
    const rounded = roundForDisplay("position", state.positionMetres);
    expect(state.positionMetres).not.toBe(rounded);
    expect(displayed).toContain("m");
    // Re-evaluating after formatting does not change authoritative output.
    expect(stateAt(declaration, 1)).toStrictEqual(state);
  });
});
