import { describe, expect, it } from "vitest";
import {
  SI_UNITS,
  formatQuantity,
  roundForDisplay,
  type QuantityId,
} from "../../src/science/index.js";
import type { Measurement, MeasurementId } from "../../src/domain/index.js";
import { measurementReadingsFor, measuredReadingsFor } from "../../src/viewmodel/index.js";
import { GOLDENS, SCENARIOS, executeContentSet } from "./content-loader.js";

/**
 * The instruments read the golden traces (GAME-391 / ML-07 AC1).
 *
 * AC1 says instrument values match the golden fixtures across representative trials. The
 * numbers come from the real content set and the real kernel — `content-loader.ts` re-derives
 * every trial through ML-03/ML-04 rather than replaying a stored trajectory, so this suite
 * cannot pass by copying the answer out of the golden.
 *
 * What is being checked is deliberately narrow and unglamorous: that the *display layer* does
 * not move a value. The kernel already agrees with the goldens (tests/unit/content-golden.test.ts
 * owns that). What was unchecked until now is that a value can go from the kernel, through the
 * instruments, to a learner's screen without acquiring a unit it should not have, losing its
 * precision to a second rounding, or being paired with the wrong quantity.
 */

const EXECUTED = executeContentSet();
const TOLERANCE = 1e-9;

/** Which frozen quantity each key of a golden's `expectedFinalState` is about. */
const QUANTITY_OF_FINAL_STATE_KEY: Record<string, QuantityId> = {
  positionMetres: "position",
  velocityMetresPerSecond: "velocity",
  accelerationMetresPerSecondSquared: "acceleration",
  netForceNewtons: "netForce",
  elapsedSeconds: "time",
};

/** Which frozen quantity each ML-04 measurement is about, and therefore its unit. */
const QUANTITY_OF_MEASUREMENT: Record<MeasurementId, QuantityId> = {
  finalPosition: "position",
  finalVelocity: "velocity",
  averageVelocity: "velocity",
  maxSpeed: "velocity",
  timeToPosition: "time",
};

describe("the instrument layer and the golden traces cover each other", () => {
  it("has a quantity for every key a golden can declare, and no orphans", () => {
    const declaredKeys = new Set<string>();
    const declaredMeasurements = new Set<string>();
    for (const golden of GOLDENS.values()) {
      for (const trial of golden.trials) {
        for (const key of Object.keys(trial.expectedFinalState)) declaredKeys.add(key);
        for (const measurement of trial.expectedMeasurements) {
          declaredMeasurements.add(measurement.id);
        }
      }
    }
    expect(declaredKeys.size).toBeGreaterThan(0);
    for (const key of declaredKeys) {
      // A key with no quantity has no unit, so an instrument built from it would show a bare
      // number. Declaring a new key is fine; declaring one nothing can label is not.
      expect(QUANTITY_OF_FINAL_STATE_KEY[key], key).toBeDefined();
    }
    // The five ML-04 measurements, all of them, and nothing invented.
    expect([...declaredMeasurements].sort()).toStrictEqual(
      Object.keys(QUANTITY_OF_MEASUREMENT).sort()
    );
  });
});

for (const scenario of SCENARIOS) {
  const scenarioId = scenario.manifest.scenarioId;
  const golden = GOLDENS.get(scenarioId);
  const runs = EXECUTED.get(scenarioId) ?? [];

  describe(`${scenarioId}`, () => {
    it("has a golden trace and a re-derived run to compare", () => {
      expect(golden).toBeDefined();
      expect(runs.length).toBeGreaterThan(0);
    });

    for (const run of runs) {
      const entry = golden?.trials.find((trial) => trial.trialKey === run.trial.trialKey);
      const trialKey = run.trial.trialKey;

      it(`${trialKey}: the live instruments read the golden's final state`, () => {
        expect(entry).toBeDefined();
        const final = run.samples[run.samples.length - 1];
        expect(final).toBeDefined();
        if (!entry || !final) return;

        // `final` is the kernel's own last sample, not the golden's stored numbers.
        const readings = measuredReadingsFor(final);
        const expectedKeys = Object.keys(entry.expectedFinalState);
        expect(readings.map((reading) => reading.id).sort()).toStrictEqual(
          expectedKeys.map((key) => QUANTITY_OF_FINAL_STATE_KEY[key]).sort()
        );

        for (const [key, expected] of Object.entries(entry.expectedFinalState)) {
          const quantity = QUANTITY_OF_FINAL_STATE_KEY[key] as QuantityId;
          const reading = readings.find((candidate) => candidate.id === quantity);
          expect(reading, key).toBeDefined();
          if (!reading) continue;
          expect(Math.abs(reading.value - expected)).toBeLessThanOrEqual(TOLERANCE);
          // One rounding, from the frozen policy, and one formatter.
          expect(reading.displayValue).toBe(roundForDisplay(quantity, expected));
          expect(reading.text).toBe(formatQuantity(quantity, expected));
          expect(reading.unit).toBe(SI_UNITS[quantity]);
          expect(reading.text.endsWith(reading.unit)).toBe(true);
        }
      });

      it(`${trialKey}: the measurement instruments read the golden's measurements`, () => {
        expect(entry).toBeDefined();
        if (!entry) return;

        const measurements: readonly Measurement[] = run.measurements.map((measured) => ({
          id: measured.id as MeasurementId,
          quantity: measured.quantity as QuantityId,
          value: measured.value,
          ...(measured.targetMetres === undefined ? {} : { targetMetres: measured.targetMetres }),
          derivation: `${scenarioId}/${trialKey}/${measured.id}`,
        }));
        const readings = measurementReadingsFor(measurements);

        // timeToPosition is emitted once per position marker, so a measurement can be matched
        // only on its marker as well as its id. That is also why the instrument id carries the
        // target: without it, two of these would collide and a lookup would return an arbitrary
        // one — which is exactly what this suite caught when it first ran.
        const readingId = (expected: { id: string; targetMetres?: number }) =>
          expected.targetMetres === undefined
            ? expected.id
            : `${expected.id}@${expected.targetMetres}`;

        expect(readings.map((reading) => reading.id).sort()).toStrictEqual(
          entry.expectedMeasurements.map((expected) => readingId(expected)).sort()
        );
        // One instrument per reading: a duplicated id would make lookup ambiguous.
        expect(new Set(readings.map((reading) => reading.id)).size).toBe(readings.length);

        for (const expected of entry.expectedMeasurements) {
          const reading = readings.find(
            (candidate) => candidate.id === readingId(expected)
          );
          expect(reading, expected.id).toBeDefined();
          if (!reading) continue;
          const id = expected.id as MeasurementId;
          // The measurement's own quantity, and the quantity the instrument claims it is —
          // a speed labelled in metres would be the failure this asserts against.
          expect(reading.quantity).toBe(QUANTITY_OF_MEASUREMENT[id]);
          expect(reading.unit).toBe(SI_UNITS[QUANTITY_OF_MEASUREMENT[id]]);
          expect(Math.abs(reading.value - expected.value)).toBeLessThanOrEqual(TOLERANCE);
          expect(reading.displayValue).toBe(
            roundForDisplay(QUANTITY_OF_MEASUREMENT[id], expected.value)
          );
          expect(reading.text).toBe(formatQuantity(QUANTITY_OF_MEASUREMENT[id], expected.value));
        }
      });
    }
  });
}
