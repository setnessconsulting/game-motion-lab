import { describe, expect, it } from "vitest";
import {
  createInitialMissionState,
  reduceMission,
  type MissionState,
} from "../../src/domain/index.js";
import { toSceneModel } from "../../src/viewmodel/index.js";

const mission = (): MissionState =>
  reduceMission(
    reduceMission(createInitialMissionState("m"), {
      kind: "set-draft",
      patch: { initialVelocityMetresPerSecond: 1.5, observationWindowSeconds: 4 },
    }),
    { kind: "begin-preview-trial" }
  );

describe("toSceneModel", () => {
  it("exposes unit-space values only, never pixels or screen coordinates", () => {
    const model = toSceneModel(mission(), {
      playbackSeconds: 2,
      running: false,
      reducedMotion: false,
    });
    const serialised = JSON.stringify(model).toLowerCase();
    for (const forbidden of ["pixel", "screenx", "canvas", "sprite", "transform"]) {
      expect(serialised).not.toContain(forbidden);
    }
    expect(Object.keys(model.cart)).toStrictEqual([
      "positionMetres",
      "velocityMetresPerSecond",
      "netForceNewtons",
    ]);
  });

  it("selects the authoritative sample for the presentation clock, clamped to the window", () => {
    const state = mission();
    const start = toSceneModel(state, { playbackSeconds: 0, running: false, reducedMotion: false });
    const end = toSceneModel(state, { playbackSeconds: 99, running: false, reducedMotion: false });
    const middle = toSceneModel(state, { playbackSeconds: 2, running: false, reducedMotion: false });

    expect(start.playback.activeIndex).toBe(0);
    expect(end.playback.activeIndex).toBe(end.playback.samples.length - 1);
    expect(middle.playback.activeIndex).toBeGreaterThan(0);
    expect(middle.playback.activeIndex).toBeLessThan(end.playback.activeIndex);
  });

  it("reports the balanced force state in words, not colour", () => {
    const model = toSceneModel(mission(), {
      playbackSeconds: 1,
      running: false,
      reducedMotion: false,
    });
    expect(model.forceArrow.direction).toBe("balanced");
    expect(model.forceArrow.label).toBe("balanced (0.0 N)");
  });

  it("gives every readout a label, a unit and a display string", () => {
    const model = toSceneModel(mission(), {
      playbackSeconds: 1,
      running: false,
      reducedMotion: false,
    });
    expect(model.readouts.length).toBeGreaterThan(0);
    for (const readout of model.readouts) {
      expect(readout.label.length).toBeGreaterThan(0);
      expect(readout.unit.length).toBeGreaterThan(0);
      expect(readout.text).toContain(readout.unit);
    }
  });

  it("carries a screen-reader announcement of the same authoritative numbers", () => {
    const model = toSceneModel(mission(), {
      playbackSeconds: 4,
      running: false,
      reducedMotion: false,
    });
    expect(model.announcement).toContain("Trial 1");
    expect(model.announcement).toContain("position");
    expect(model.announcement).toContain("m/s");
  });

  it("says so plainly before any trial exists", () => {
    const model = toSceneModel(createInitialMissionState("m"), {
      playbackSeconds: 0,
      running: false,
      reducedMotion: false,
    });
    expect(model.playback.samples).toHaveLength(0);
    expect(model.announcement).toContain("No trial");
  });

  it("keeps a positive-length track even when the cart does not move", () => {
    const still = reduceMission(
      reduceMission(createInitialMissionState("m"), {
        kind: "set-draft",
        patch: { initialVelocityMetresPerSecond: 0 },
      }),
      { kind: "begin-preview-trial" }
    );
    const model = toSceneModel(still, {
      playbackSeconds: 1,
      running: false,
      reducedMotion: false,
    });
    expect(model.track.endMetres).toBeGreaterThan(0);
  });

  it("propagates the reduced-motion flag to the renderer contract", () => {
    const model = toSceneModel(mission(), {
      playbackSeconds: 1,
      running: false,
      reducedMotion: true,
    });
    expect(model.reducedMotion).toBe(true);
  });
});
