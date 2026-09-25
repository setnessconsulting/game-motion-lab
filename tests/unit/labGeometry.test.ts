import { describe, expect, it } from "vitest";
import { createInitialMissionState, reduceMission, type MissionState } from "../../src/domain/index.js";
import { toSceneModel, type SceneModel } from "../../src/viewmodel/index.js";
// Imported from the module, not from the renderer package barrel: the barrel statically
// exports the Phaser game, and Phaser needs a browser. Keeping the geometry free of Phaser
// is what lets this suite run in the Node environment at all, and
// scripts/verify-contracts.mjs checks that this file never gains a Phaser import.
import {
  fitViewport,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  positionToCanvasX,
  sceneGeometry,
  TRACK_END_X,
  TRACK_START_X,
} from "../../src/renderer/labGeometry.js";

/**
 * Presentation geometry (GAME-390 / ML-06, acceptance criterion 3).
 *
 * The point of these tests is that the metre-to-canvas mapping is a pure function of the
 * view model. If that is true then geometry cannot vary with refresh rate, because refresh
 * rate is not an input — there is no frame count, frame delta, clock, or device pixel ratio
 * anywhere in the signature. The browser lane then checks that the real scene draws exactly
 * what this function computes.
 */

function missionWith(patch: Record<string, number>): MissionState {
  return reduceMission(
    reduceMission(createInitialMissionState("geometry"), { kind: "set-draft", patch }),
    { kind: "begin-preview-trial" }
  );
}

function modelFor(patch: Record<string, number>, playbackSeconds = 4, running = false): SceneModel {
  return toSceneModel(missionWith(patch), { playbackSeconds, running, reducedMotion: false });
}

const BALANCED = { initialVelocityMetresPerSecond: 1.5, observationWindowSeconds: 4 };
const PUSHED = { ...BALANCED, appliedForceNewtons: 4 };
// A negative force with a positive initial velocity would reverse inside the window, and
// the kernel refuses that with a typed error rather than inventing a trajectory. The
// leftward case therefore starts already moving left, which is the physically coherent
// negative-force run the content set can actually express.
const PULLED = {
  ...BALANCED,
  appliedForceNewtons: -4,
  initialVelocityMetresPerSecond: -1.5,
};

/** The fields that come from authoritative metres, i.e. everything a viewport must not move. */
function logicalOnly(geometry: ReturnType<typeof sceneGeometry>) {
  return {
    logicalWidth: geometry.logicalWidth,
    logicalHeight: geometry.logicalHeight,
    pixelsPerMetre: geometry.track.pixelsPerMetre,
    cartCenterX: geometry.cart.centerX,
    cartCenterY: geometry.cart.centerY,
    trackStartX: geometry.track.startX,
    trackEndX: geometry.track.endX,
    forceFromX: geometry.force.fromX,
    forceToX: geometry.force.toX,
    emphasis: geometry.emphasis,
    playedFraction: geometry.playedFraction,
  };
}

describe("sceneGeometry is a pure function of the model", () => {
  it("returns deeply equal geometry for the same model, however many times it is called", () => {
    const model = modelFor(PUSHED);
    const first = sceneGeometry(model);
    // Calling it repeatedly stands in for "frames have been drawn in between": there is no
    // frame input, so nothing about the call site can change the answer.
    for (let call = 0; call < 25; call += 1) {
      expect(sceneGeometry(model)).toStrictEqual(first);
    }
  });

  it("does not mutate the model it is given", () => {
    const model = modelFor(PUSHED);
    const before = JSON.stringify(model);
    sceneGeometry(model);
    expect(JSON.stringify(model)).toBe(before);
  });

  it("produces JSON-safe output, so it is safe to publish through the readback", () => {
    const geometry = sceneGeometry(modelFor(PUSHED));
    const roundTripped = JSON.parse(JSON.stringify(geometry)) as typeof geometry;
    expect(roundTripped).toStrictEqual(geometry);
    expect(JSON.stringify(geometry)).not.toContain("null,\"undefined\"");
  });

  it("puts every metre-derived value in a fixed logical space", () => {
    const geometry = sceneGeometry(modelFor(PUSHED));
    expect(geometry.logicalWidth).toBe(LOGICAL_WIDTH);
    expect(geometry.logicalHeight).toBe(LOGICAL_HEIGHT);
    expect(geometry.track.startX).toBe(TRACK_START_X);
    expect(geometry.track.endX).toBe(TRACK_END_X);
  });
});

describe("the metre-to-canvas mapping", () => {
  it("is monotone in position and agrees with the shared mapping function", () => {
    const state = missionWith(PUSHED);
    const window = modelFor(PUSHED).track.endMetres;
    let previous = -Infinity;

    for (let seconds = 0; seconds <= 4; seconds += 0.25) {
      const model = toSceneModel(state, { playbackSeconds: seconds, running: false, reducedMotion: false });
      const geometry = sceneGeometry(model);
      expect(geometry.cart.centerX).toBeCloseTo(
        positionToCanvasX(model.cart.positionMetres, window),
        9
      );
      expect(geometry.cart.centerX).toBeGreaterThanOrEqual(previous);
      previous = geometry.cart.centerX;
    }
  });

  it("places position zero at the track start and the track end at the far edge", () => {
    expect(positionToCanvasX(0, 6)).toBe(TRACK_START_X);
    expect(positionToCanvasX(6, 6)).toBe(TRACK_END_X);
  });

  it("clamps rather than drawing off the track, and stays finite for nonsense input", () => {
    for (const position of [-99, -0.1, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      const x = positionToCanvasX(position, 6);
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(TRACK_START_X);
      expect(x).toBeLessThanOrEqual(TRACK_END_X);
    }
    // A degenerate track span must not divide by zero.
    expect(Number.isFinite(positionToCanvasX(0, 0))).toBe(true);
  });

  it("draws one tick per whole metre, ascending and spanning the track exactly", () => {
    const geometry = sceneGeometry(modelFor(BALANCED));
    const { tickXs, startX, endX, startMetres, endMetres } = geometry.track;

    expect(tickXs.length).toBe(Math.floor(endMetres - startMetres) + 1);
    expect(tickXs[0]).toBe(startX);
    expect(tickXs[tickXs.length - 1]).toBeCloseTo(endX, 9);
    for (let index = 1; index < tickXs.length; index += 1) {
      expect(tickXs[index]).toBeGreaterThan(tickXs[index - 1] as number);
    }
  });
});

describe("the force vector encodes direction redundantly", () => {
  it("points right for a positive net force and left for a negative one, and says so in words", () => {
    const pushed = sceneGeometry(modelFor(PUSHED));
    const pulled = sceneGeometry(modelFor(PULLED));

    expect(pushed.force.direction).toBe("positive");
    expect(pushed.force.fromX).not.toBeNull();
    expect(pushed.force.toX as number).toBeGreaterThan(pushed.force.fromX as number);

    expect(pulled.force.direction).toBe("negative");
    expect(pulled.force.toX as number).toBeLessThan(pulled.force.fromX as number);

    // The words travel with the model, and the geometry must not contradict them.
    expect(modelFor(PUSHED).forceArrow.label).toContain("to the right");
    expect(modelFor(PULLED).forceArrow.label).toContain("to the left");
  });

  it("draws no arrow at all for balanced forces, rather than a zero-length one", () => {
    const geometry = sceneGeometry(modelFor(BALANCED));
    expect(geometry.force.direction).toBe("balanced");
    expect(geometry.force.magnitude).toBe(0);
    expect(geometry.force.fromX).toBeNull();
    expect(geometry.force.toX).toBeNull();
    expect(geometry.force.headLength).toBe(0);
  });

  it("saturates the arrow at the largest net force the frozen range allows", () => {
    const capped = sceneGeometry(modelFor({ ...BALANCED, appliedForceNewtons: 12 }));
    expect(capped.force.magnitude).toBeLessThanOrEqual(12);
    expect(capped.force.magnitude).toBeGreaterThan(0);
  });

  it("keeps the cart and every arrow inside the logical space, at every position and force", () => {
    // The headless suite found the arrow being clipped off the right edge at large forces
    // near the end of the track, which silently removed the magnitude encoding exactly when
    // it mattered. This enumerates the whole reachable grid so containment is a property of
    // the mapping rather than a coincidence at small forces.
    const base = modelFor(BALANCED);
    let checked = 0;

    for (let force = -12; force <= 12; force += 1) {
      for (let position = 0; position <= base.track.endMetres; position += 0.25) {
        const model: SceneModel = {
          ...base,
          cart: { ...base.cart, positionMetres: position, netForceNewtons: force },
          forceArrow: {
            newtons: force,
            direction: force === 0 ? "balanced" : force > 0 ? "positive" : "negative",
            label: String(force),
          },
        };
        const geometry = sceneGeometry(model);
        checked += 1;

        expect(geometry.cart.centerX - geometry.cart.width / 2).toBeGreaterThanOrEqual(0);
        expect(geometry.cart.centerX + geometry.cart.width / 2).toBeLessThanOrEqual(LOGICAL_WIDTH);
        expect(geometry.cart.centerY - geometry.cart.height).toBeGreaterThan(0);
        expect(geometry.cart.centerY + geometry.cart.wheelRadius).toBeLessThan(LOGICAL_HEIGHT);
        if (geometry.force.toX !== null) {
          expect(geometry.force.toX).toBeGreaterThanOrEqual(0);
          expect(geometry.force.toX).toBeLessThanOrEqual(LOGICAL_WIDTH);
        }
      }
    }

    // 25 forces x 25 positions; a green result over an empty grid would prove nothing.
    expect(checked).toBeGreaterThan(500);
  });
});

describe("presentation emphasis reflects the playback state and nothing else", () => {
  it("is idle before any trial exists", () => {
    const model = toSceneModel(createInitialMissionState("geometry"), {
      playbackSeconds: 0,
      running: false,
      reducedMotion: false,
    });
    expect(sceneGeometry(model).emphasis).toBe("idle");
    expect(sceneGeometry(model).playedFraction).toBe(0);
  });

  it("is playing, paused and settled across the window", () => {
    const state = missionWith(BALANCED);
    const playing = toSceneModel(state, { playbackSeconds: 2, running: true, reducedMotion: false });
    const paused = toSceneModel(state, { playbackSeconds: 2, running: false, reducedMotion: false });
    const settled = toSceneModel(state, { playbackSeconds: 4, running: false, reducedMotion: false });

    expect(sceneGeometry(playing).emphasis).toBe("playing");
    expect(sceneGeometry(paused).emphasis).toBe("paused");
    expect(sceneGeometry(settled).emphasis).toBe("settled");
    expect(sceneGeometry(settled).playedFraction).toBe(1);
    expect(sceneGeometry(paused).playedFraction).toBeGreaterThan(0);
    expect(sceneGeometry(paused).playedFraction).toBeLessThan(1);
  });

  it("reports settled under reduced motion, because there is no animation to be in flight", () => {
    const state = missionWith(BALANCED);
    const model = toSceneModel(state, {
      playbackSeconds: 4,
      running: false,
      reducedMotion: true,
    });
    expect(sceneGeometry(model).emphasis).toBe("settled");
  });
});

describe("the viewport never reaches the geometry's inputs", () => {
  it("scales to fit while leaving every metre-derived value untouched", () => {
    const model = modelFor(PUSHED);
    const small = sceneGeometry(model, fitViewport(320, 240));
    const large = sceneGeometry(model, fitViewport(2560, 1440));

    expect(small.viewport.scale).not.toBe(large.viewport.scale);
    // Entries differ only in the viewport they were told to fit into.
    expect(small).toStrictEqual({ ...large, viewport: small.viewport });
    expect(logicalOnly(small)).toStrictEqual(logicalOnly(large));
  });

  it("fits by the smaller of the two ratios, preserving aspect ratio", () => {
    expect(fitViewport(1440, 900).scale).toBeCloseTo(Math.min(1440 / LOGICAL_WIDTH, 900 / LOGICAL_HEIGHT), 9);
    expect(fitViewport(360, 2000).scale).toBeCloseTo(360 / LOGICAL_WIDTH, 9);
    expect(fitViewport(4000, 300).scale).toBeCloseTo(300 / LOGICAL_HEIGHT, 9);
  });

  it("returns a usable fit for the degenerate boxes a real layout produces", () => {
    for (const [width, height] of [
      [0, 0],
      [-10, 100],
      [Number.NaN, 300],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    ]) {
      const fit = fitViewport(width as number, height as number);
      expect(Number.isFinite(fit.width)).toBe(true);
      expect(Number.isFinite(fit.height)).toBe(true);
      expect(fit.width).toBeGreaterThan(0);
      expect(fit.height).toBeGreaterThan(0);
      expect(Number.isFinite(fit.scale)).toBe(true);
      expect(fit.scale).toBeGreaterThan(0);
    }
  });
});
