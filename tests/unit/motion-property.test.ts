import { describe, expect, it } from "vitest";
import {
  accelerationFor,
  composeNetForce,
  singleSegmentDeclaration,
  stateAt,
} from "../../src/science/index.js";

/**
 * Property / invariant tests across bounded generated values (GAME-386).
 *
 * Draws stay inside the frozen SCIENCE_MODEL value bands. No RNG enters the
 * kernel itself — randomness is only in the test harness.
 */

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand: () => number, min: number, max: number, step: number): number {
  const steps = Math.round((max - min) / step);
  return min + Math.round(rand() * steps) * step;
}

describe("property invariants within frozen value bands", () => {
  const rand = mulberry32(0x4d4c3033); // "ML03"

  it("a === Fnet/m and kinematics identities hold for 200 bounded draws", () => {
    for (let index = 0; index < 200; index += 1) {
      const mass = pick(rand, 1, 4, 0.5);
      const force = pick(rand, -12, 12, 1);
      // Avoid mid-segment reversal: start from rest, or choose v0 with the same sign as a.
      const acceleration = force / mass;
      let v0 = 0;
      if (acceleration !== 0 && rand() > 0.5) {
        const speed = pick(rand, 0, 2, 0.25);
        v0 = Math.sign(acceleration) * speed;
      }
      const window = pick(rand, 1, 6, 0.5);
      const declaration = singleSegmentDeclaration({
        massKilograms: mass,
        initialVelocityMetresPerSecond: v0,
        appliedForcesNewtons: [force],
        observationWindowSeconds: window,
      });

      expect(composeNetForce([force])).toBe(force);
      expect(accelerationFor({ massKilograms: mass, appliedForcesNewtons: [force], observationWindowSeconds: window })).toBe(
        force / mass
      );

      const t = window;
      const state = stateAt(declaration, t);
      expect(state.netForceNewtons).toBe(force);
      expect(state.accelerationMetresPerSecondSquared).toBe(force / mass);
      expect(state.velocityMetresPerSecond).toBe(v0 + (force / mass) * t);
      expect(state.positionMetres).toBe(0 + v0 * t + 0.5 * (force / mass) * t * t);
    }
  });

  it("same seed and configuration always reproduce identical traces", () => {
    const build = (seed: number) => {
      const r = mulberry32(seed);
      const mass = pick(r, 1, 4, 0.5);
      const force = pick(r, 0, 12, 1);
      const window = pick(r, 1, 6, 0.5);
      return stateAt(
        singleSegmentDeclaration({
          massKilograms: mass,
          appliedForcesNewtons: [force],
          observationWindowSeconds: window,
        }),
        window
      );
    };
    expect(build(42)).toStrictEqual(build(42));
  });
});
