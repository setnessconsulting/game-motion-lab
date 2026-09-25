import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP_BOUNDS,
  BOOTSTRAP_CONFIG,
  clampConfig,
  createInitialMissionState,
  createPreviewTrial,
  reduceMission,
  type MissionIntent,
  type MissionState,
} from "../../src/domain/index.js";
import { singleSegmentDeclaration, stateAt } from "../../src/science/index.js";

describe("analytical kernel balanced-force invariants (Fnet = 0)", () => {
  it("holds velocity constant and reports zero net force and zero acceleration", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialPositionMetres: 0,
      initialVelocityMetresPerSecond: 1.5,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 4,
    });
    const atTwo = stateAt(declaration, 2);
    expect(atTwo.velocityMetresPerSecond).toBe(1.5);
    expect(atTwo.accelerationMetresPerSecondSquared).toBe(0);
    expect(atTwo.netForceNewtons).toBe(0);
    expect(atTwo.positionMetres).toBeCloseTo(3, 9);
    expect(atTwo.elapsedSeconds).toBe(2);
  });

  it("moves left for a negative declared velocity, matching the +x sign convention", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialPositionMetres: 4,
      initialVelocityMetresPerSecond: -2,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 2,
    });
    const state = stateAt(declaration, 1.5);
    expect(state.positionMetres).toBeCloseTo(1, 9);
  });

  it("is deterministic: the same declaration and time always agree", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialPositionMetres: 0.5,
      initialVelocityMetresPerSecond: -0.75,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 4,
    });
    expect(stateAt(declaration, 3.25)).toStrictEqual(stateAt(declaration, 3.25));
  });

  it("rejects invalid sampling inputs instead of guessing", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialPositionMetres: 0,
      initialVelocityMetresPerSecond: 1,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 2,
    });
    expect(() => stateAt(declaration, -1)).toThrow();
  });
});

describe("configuration bounds", () => {
  it("clamps every authored value into the declared bands", () => {
    const clamped = clampConfig({
      cartMassKilograms: 99,
      appliedForceNewtons: -99,
      initialVelocityMetresPerSecond: -99,
      observationWindowSeconds: 0.1,
    });
    expect(clamped.cartMassKilograms).toBe(BOOTSTRAP_BOUNDS.cartMassKilograms[1]);
    expect(clamped.appliedForceNewtons).toBe(BOOTSTRAP_BOUNDS.appliedForceNewtons[0]);
    expect(clamped.initialVelocityMetresPerSecond).toBe(
      BOOTSTRAP_BOUNDS.initialVelocityMetresPerSecond[0]
    );
    expect(clamped.observationWindowSeconds).toBe(BOOTSTRAP_BOUNDS.observationWindowSeconds[0]);
  });

  it("substitutes the lower bound for a non-finite value rather than propagating NaN", () => {
    const clamped = clampConfig({
      cartMassKilograms: Number.NaN,
      appliedForceNewtons: 0,
      initialVelocityMetresPerSecond: 1,
      observationWindowSeconds: 2,
    });
    expect(Number.isFinite(clamped.cartMassKilograms)).toBe(true);
  });

  it("allows signed applied force across the SCIENCE_MODEL magnitude band including balanced 0", () => {
    expect(BOOTSTRAP_BOUNDS.appliedForceNewtons).toStrictEqual([-12, 12]);
  });
});

describe("bounded intents", () => {
  const id = "test-mission";

  const apply = (state: MissionState, intents: MissionIntent[]): MissionState =>
    intents.reduce((current, intent) => reduceMission(current, intent), state);

  it("starts in the brief phase with no trials", () => {
    const state = createInitialMissionState(id);
    expect(state.phase).toBe("brief");
    expect(state.trials).toHaveLength(0);
    expect(state.draft).toStrictEqual(BOOTSTRAP_CONFIG);
  });

  it("advances phases in the authored order and stops at the last one", () => {
    let state = createInitialMissionState(id);
    const phases = [state.phase];
    for (let step = 0; step < 10; step += 1) {
      state = reduceMission(state, { kind: "advance-phase" });
      phases.push(state.phase);
    }
    expect(phases.slice(0, 7)).toStrictEqual([
      "brief",
      "predict",
      "design",
      "run",
      "record",
      "compare",
      "debrief",
    ]);
    expect(phases.at(-1)).toBe("debrief");
  });

  it("appends an immutable-by-convention trial record and moves to the run phase", () => {
    const state = apply(createInitialMissionState(id), [{ kind: "begin-preview-trial" }]);
    expect(state.phase).toBe("run");
    expect(state.trials).toHaveLength(1);
    expect(state.trials[0]?.id).toBe(`${id}-t1`);
    expect(state.trials[0]?.samples.length).toBeGreaterThan(1);
  });

  it("never rewrites an earlier trial when a later one is added", () => {
    const first = apply(createInitialMissionState(id), [{ kind: "begin-preview-trial" }]);
    const snapshot = JSON.stringify(first.trials[0]);
    const second = apply(first, [{ kind: "begin-preview-trial" }]);
    expect(JSON.stringify(second.trials[0])).toBe(snapshot);
    expect(second.trials).toHaveLength(2);
    expect(second.trials[1]?.id).toBe(`${id}-t2`);
  });

  it("is deterministic: the same intent sequence yields identical state", () => {
    const sequence: MissionIntent[] = [
      { kind: "set-prediction", text: "constant speed" },
      { kind: "set-draft", patch: { initialVelocityMetresPerSecond: 0.5 } },
      { kind: "begin-preview-trial" },
      { kind: "advance-phase" },
    ];
    const a = apply(createInitialMissionState(id), sequence);
    const b = apply(createInitialMissionState(id), sequence);
    expect(a).toStrictEqual(b);
  });

  it("clamps a draft patch through the engine rather than trusting the caller", () => {
    const state = reduceMission(createInitialMissionState(id), {
      kind: "set-draft",
      patch: { initialVelocityMetresPerSecond: 500 },
    });
    expect(state.draft.initialVelocityMetresPerSecond).toBe(
      BOOTSTRAP_BOUNDS.initialVelocityMetresPerSecond[1]
    );
  });

  it("does not let a renderer change the configuration mid-run", () => {
    const running = apply(createInitialMissionState(id), [{ kind: "begin-preview-trial" }]);
    const attempted = reduceMission(running, {
      kind: "set-draft",
      patch: { initialVelocityMetresPerSecond: 2 },
    });
    expect(attempted).toBe(running);
  });

  it("reset returns to a fresh session", () => {
    const used = apply(createInitialMissionState(id), [
      { kind: "set-prediction", text: "x" },
      { kind: "begin-preview-trial" },
    ]);
    expect(reduceMission(used, { kind: "reset-session" })).toStrictEqual(
      createInitialMissionState(id)
    );
  });

  it("throws on an unknown intent instead of silently ignoring it", () => {
    expect(() =>
      reduceMission(createInitialMissionState(id), { kind: "nope" } as unknown as MissionIntent)
    ).toThrow(/Unsupported mission intent/);
  });
});

describe("preview trial records", () => {
  it("starts at the origin and ends at the stated uniform-motion position", () => {
    const config = {
      ...BOOTSTRAP_CONFIG,
      initialVelocityMetresPerSecond: 2,
      observationWindowSeconds: 3,
    };
    const trial = createPreviewTrial("m", 0, config);
    expect(trial.samples[0]?.state.positionMetres).toBe(0);
    expect(trial.finalState.positionMetres).toBeCloseTo(6, 6);
    expect(trial.finalState.velocityMetresPerSecond).toBeCloseTo(2, 9);
  });

  it("produces the same samples for the same configuration", () => {
    const a = createPreviewTrial("m", 0, BOOTSTRAP_CONFIG);
    const b = createPreviewTrial("m", 0, BOOTSTRAP_CONFIG);
    expect(a.samples).toStrictEqual(b.samples);
  });

  it("uses mass and applied force through the analytical kernel", () => {
    const trial = createPreviewTrial("m", 0, {
      cartMassKilograms: 2,
      appliedForceNewtons: 4,
      initialVelocityMetresPerSecond: 0,
      observationWindowSeconds: 2,
    });
    expect(trial.finalState.accelerationMetresPerSecondSquared).toBe(2);
    expect(trial.finalState.velocityMetresPerSecond).toBe(4);
    expect(trial.finalState.positionMetres).toBe(4);
  });
});
