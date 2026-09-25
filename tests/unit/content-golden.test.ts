/**
 * The golden traces reproduce, and they reproduce from the right place.
 *
 * GAME-389 acceptance criterion 2 says the expected outputs are backed by
 * ML-03/ML-04 golden traces. This suite proves three distinct things:
 *
 * 1. every authored measurement, final state, and whole-trajectory digest
 *    still matches what the kernel produces today;
 * 2. the hand arithmetic written into each golden (the check a science
 *    reviewer would do with a calculator) agrees with the kernel, so the
 *    goldens are not merely a recording of current behaviour;
 * 3. where ML-04's trial runner can express a trial, it produces bit-identical
 *    numbers to the direct kernel call, so the experiment layer and the
 *    science layer have not drifted apart.
 */

import { describe, expect, it } from "vitest";
import { digestOf } from "../../src/domain/index.js";
import { AUTHORED_BANDS } from "../../src/content/index.js";
import { GOLDENS, SCENARIOS, executeContentSet } from "./content-loader.js";

const EXECUTED = executeContentSet();
const TOLERANCE = 1e-9;

describe("every golden trace exists for every scenario", () => {
  it("has a golden trace per scenario and no orphans", () => {
    expect(GOLDENS.size).toBe(SCENARIOS.length);
    for (const scenario of SCENARIOS) {
      expect(GOLDENS.has(scenario.manifest.scenarioId), scenario.manifest.scenarioId).toBe(true);
    }
  });
});

for (const scenario of SCENARIOS) {
  const id = scenario.manifest.scenarioId;
  const golden = GOLDENS.get(id)!;
  const runs = EXECUTED.get(id) ?? [];

  describe(`${id}`, () => {
    it("has a golden trial for every authored trial", () => {
      expect(golden.trials.map((entry) => entry.trialKey).sort()).toStrictEqual(
        scenario.design.trials.map((trial) => trial.trialKey).sort()
      );
    });

    for (const run of runs) {
      const entry = golden.trials.find((t) => t.trialKey === run.trial.trialKey)!;

      it(`${run.trial.trialKey}: the whole sampled trajectory still matches the golden digest`, () => {
        expect(run.samplesDigest).toBe(entry.expectedSamplesDigest);
      });

      it(`${run.trial.trialKey}: the final state still matches the golden`, () => {
        for (const [key, value] of Object.entries(entry.expectedFinalState)) {
          expect(run.samples[run.samples.length - 1]).toBeDefined();
          const actual = (run.samples[run.samples.length - 1] as unknown as Record<string, number>)[
            key
          ];
          expect(Math.abs((actual as number) - (value as number))).toBeLessThanOrEqual(TOLERANCE);
        }
      });

      it(`${run.trial.trialKey}: every derived measurement still matches the golden`, () => {
        expect(run.measurements.length).toBe(entry.expectedMeasurements.length);
        for (const expected of entry.expectedMeasurements) {
          // timeToPosition is emitted once per position marker, so it must be
          // matched on the marker as well as the id.
          const actual = run.measurements.find(
            (m) => m.id === expected.id && m.targetMetres === expected.targetMetres
          );
          expect(actual, `${expected.id}${expected.targetMetres ?? ""} is missing`).toBeDefined();
          expect(Math.abs(actual!.value - expected.value)).toBeLessThanOrEqual(TOLERANCE);
        }
      });

      it(`${run.trial.trialKey}: the unreached markers still match the golden`, () => {
        expect(run.unreachedTargetsMetres).toStrictEqual([
          ...entry.expectedUnreachedTargetsMetres,
        ]);
      });

      it(`${run.trial.trialKey}: the hand arithmetic in the golden matches the kernel`, () => {
        const hand = (entry as unknown as {
          handCheck: {
            netForceNewtons: number;
            acceleration: number;
            finalPositionMetres: number;
            finalVelocityMetresPerSecond: number;
          };
        }).handCheck;
        expect(Math.abs(run.netForceNewtons - hand.netForceNewtons)).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(run.acceleration - hand.acceleration)).toBeLessThanOrEqual(TOLERANCE);
        const last = run.samples[run.samples.length - 1]!;
        expect(Math.abs(last.positionMetres - hand.finalPositionMetres)).toBeLessThanOrEqual(
          TOLERANCE
        );
        expect(
          Math.abs(last.velocityMetresPerSecond - hand.finalVelocityMetresPerSecond)
        ).toBeLessThanOrEqual(TOLERANCE);
      });

      it(`${run.trial.trialKey}: the golden states the equations a reviewer can check`, () => {
        const equations = (entry as unknown as { equations: readonly string[] }).equations;
        expect(equations.length).toBeGreaterThanOrEqual(3);
        expect(equations.join(" ")).toContain("Fnet");
      });
    }

    it("is reproduced by the ML-04 trial runner wherever that runner can express it", () => {
      const expressible = runs.filter((run) => {
        const entry = golden.trials.find((t) => t.trialKey === run.trial.trialKey);
        return (entry as unknown as { kernelDeclaration?: unknown }).kernelDeclaration === undefined;
      });
      expect(expressible.length).toBeGreaterThan(0);
      for (const run of expressible) {
        expect(run.reproducedByMl04, `${run.trial.trialKey} drifted from ML-04`).toBe(true);
      }
    });

    it("keeps every authoritative value inside the frozen authored bands", () => {
      for (const run of runs) {
        for (const sample of run.samples) {
          expect(Math.abs(sample.positionMetres)).toBeLessThanOrEqual(
            AUTHORED_BANDS.positionMetres.max
          );
          expect(sample.positionMetres).toBeGreaterThanOrEqual(AUTHORED_BANDS.positionMetres.min);
          if (Math.abs(sample.netForceNewtons) > 1e-12) {
            const magnitude = Math.abs(sample.accelerationMetresPerSecondSquared);
            expect(magnitude).toBeGreaterThanOrEqual(
              AUTHORED_BANDS.accelerationMetresPerSecondSquared.minNonZero
            );
            expect(magnitude).toBeLessThanOrEqual(
              AUTHORED_BANDS.accelerationMetresPerSecondSquared.max
            );
          }
        }
      }
    });
  });
}

describe("the digest is an integrity invariant, and the goldens rely on it", () => {
  it("changes when any stored sample changes", () => {
    const run = (EXECUTED.get("thruster-force-doubling") ?? [])[0]!;
    const original = run.samplesDigest;
    const tampered = run.samples.map((sample, index) =>
      index === 1 ? { ...sample, positionMetres: sample.positionMetres + 0.5 } : sample
    );
    expect(digestOf(tampered)).not.toBe(original);
  });
});
