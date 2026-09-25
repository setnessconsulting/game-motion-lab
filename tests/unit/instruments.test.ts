import { describe, expect, it } from "vitest";
import {
  SI_UNITS,
  formatQuantity,
  roundForDisplay,
  type CartState,
  type QuantityId,
} from "../../src/science/index.js";
import {
  createInitialMissionState,
  reduceMission,
  type Measurement,
  type MeasurementId,
  type MissionState,
} from "../../src/domain/index.js";
import {
  DIRECTION_CONVENTION,
  MEASUREMENT_LABELS,
  QUANTITY_LABELS,
  RULER_MAX_TICKS,
  configuredReadingsFor,
  directionWords,
  findReading,
  measurementReadingsFor,
  measuredReadingsFor,
  quantityReading,
  rulerStepMetres,
  rulerTicks,
  stopwatchReading,
  toSceneModel,
} from "../../src/viewmodel/index.js";

/**
 * The instrument layer (GAME-391 / ML-07).
 *
 * These are the properties ML-07's rules reduce to, checked where they are checkable without a
 * browser: one direction convention, a real measured-versus-configured distinction, display
 * rounding that cannot become truth, a ruler that stays readable, and — the one that matters
 * most — a stopwatch and a set of readings that can only ever show what a trial recorded.
 */

const cartState = (overrides: Partial<CartState> = {}): CartState => ({
  positionMetres: 0,
  velocityMetresPerSecond: 0,
  accelerationMetresPerSecondSquared: 0,
  netForceNewtons: 0,
  elapsedSeconds: 0,
  ...overrides,
});

/** A real mission with a real recorded trial behind it, not a hand-built state. */
const recordedMission = (): MissionState =>
  reduceMission(
    reduceMission(createInitialMissionState("m"), {
      kind: "set-draft",
      patch: { initialVelocityMetresPerSecond: 1.5, observationWindowSeconds: 4 },
    }),
    { kind: "begin-preview-trial" }
  );

describe("the direction convention has exactly one home", () => {
  it("states a positive force to the right and a negative one to the left", () => {
    const positive = directionWords(4);
    expect(positive.direction).toBe("positive");
    expect(positive.words).toBe(DIRECTION_CONVENTION.towardPositive);
    expect(positive.label).toBe(`4.0 N ${DIRECTION_CONVENTION.towardPositive}`);

    const negative = directionWords(-4);
    expect(negative.direction).toBe("negative");
    expect(negative.words).toBe(DIRECTION_CONVENTION.towardNegative);
    expect(negative.label).toBe(`4.0 N ${DIRECTION_CONVENTION.towardNegative}`);
  });

  it("calls a zero net force balanced, and still states the number", () => {
    const balanced = directionWords(0);
    expect(balanced.direction).toBe("balanced");
    expect(balanced.words).toBe(DIRECTION_CONVENTION.balanced);
    // The evidence and the reading of it are both present: "0.0 N" is what was measured,
    // "balanced" is what it means.
    expect(balanced.label).toBe("balanced (0.0 N)");
  });

  it("treats a force that displays as zero as balanced", () => {
    // -0.04 N rounds to 0.0 N at the frozen display precision. What a learner reads is
    // "balanced", so the instrument must not claim a direction the display denies.
    expect(directionWords(-0.04).direction).toBe("balanced");
    expect(directionWords(0.04).direction).toBe("balanced");
  });

  it("carries the convention in the view model instead of letting the renderer restate it", () => {
    const model = toSceneModel(recordedMission(), {
      playbackSeconds: 0,
      running: false,
      reducedMotion: false,
    });
    expect(model.track.positiveDirection).toBe(DIRECTION_CONVENTION.positive);
    expect(model.directionAxis).toBe(DIRECTION_CONVENTION.axis);
    expect(model.forceArrow.label).toBe(directionWords(model.forceArrow.newtons).label);
  });

  it("labels every quantity exactly once, and no label is empty", () => {
    const labels = Object.values(QUANTITY_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});

describe("measured and configured values are distinguishable", () => {
  it("marks the five live instruments as measured", () => {
    const readings = measuredReadingsFor(cartState({ positionMetres: 6, elapsedSeconds: 4 }));
    expect(readings.map((reading) => reading.id)).toStrictEqual([
      "position",
      "velocity",
      "acceleration",
      "netForce",
      "time",
    ]);
    for (const reading of readings) expect(reading.origin).toBe("measured");
  });

  it("marks the four control settings as configured", () => {
    const readings = configuredReadingsFor({
      cartMassKilograms: 2,
      appliedForceNewtons: 4,
      initialVelocityMetresPerSecond: 1.5,
      observationWindowSeconds: 4,
    });
    expect(readings.map((reading) => reading.id)).toStrictEqual([
      "cartMass",
      "appliedForce",
      "initialVelocity",
      "observationWindow",
    ]);
    for (const reading of readings) expect(reading.origin).toBe("configured");
    expect(readings.map((reading) => reading.text)).toStrictEqual([
      "2.00 kg",
      "4.0 N",
      "1.50 m/s",
      "4.00 s",
    ]);
  });

  it("keeps the applied force and the net force apart although both are newtons", () => {
    const configured = configuredReadingsFor({
      cartMassKilograms: 2,
      appliedForceNewtons: 4,
      initialVelocityMetresPerSecond: 0,
      observationWindowSeconds: 2,
    });
    const measured = measuredReadingsFor(cartState({ netForceNewtons: 3 }));
    const applied = findReading(configured, "appliedForce");
    const net = findReading(measured, "netForce");
    expect(applied?.quantity).toBe("force");
    expect(net?.quantity).toBe("netForce");
    expect(applied?.unit).toBe(net?.unit);
    // Distinct instruments: a controlled comparison is about the difference between what was
    // set and what the cart actually felt, so they must never collide in a lookup.
    expect(applied?.id).not.toBe(net?.id);
    expect(findReading(measured, "appliedForce")).toBeUndefined();
  });
});

describe("display rounding never becomes the truth", () => {
  it("keeps full precision beside the displayed value", () => {
    const reading = quantityReading("position", 6.0049, "measured");
    expect(reading.value).toBe(6.0049);
    expect(reading.displayValue).toBe(6.0);
    expect(reading.text).toBe("6.00 m");
    // The rounded value is recoverable from the exact one, and never the other way round.
    expect(reading.displayValue).toBe(roundForDisplay("position", reading.value));
  });

  it("formats every reading with the one frozen formatter and the frozen unit table", () => {
    const values = [0, 1.5, -2.25, 12, 0.004];
    for (const quantity of Object.keys(SI_UNITS) as QuantityId[]) {
      for (const value of values) {
        const reading = quantityReading(quantity, value, "measured");
        expect(reading.text).toBe(formatQuantity(quantity, value));
        expect(reading.unit).toBe(SI_UNITS[quantity]);
        expect(reading.label).toBe(QUANTITY_LABELS[quantity]);
        expect(reading.text.endsWith(reading.unit)).toBe(true);
      }
    }
  });

  it("reports an unavailable quantity as unavailable rather than as a number", () => {
    const reading = quantityReading("velocity", Number.NaN, "measured");
    expect(reading.text).not.toMatch(/\d/);
    expect(reading.text).toContain("unavailable");
  });
});

describe("the derived measurements are instruments with the right quantity", () => {
  const EXPECTED_QUANTITY: Record<MeasurementId, QuantityId> = {
    finalPosition: "position",
    finalVelocity: "velocity",
    averageVelocity: "velocity",
    maxSpeed: "velocity",
    timeToPosition: "time",
  };

  const measurement = (id: MeasurementId, value: number, targetMetres?: number): Measurement => ({
    id,
    quantity: EXPECTED_QUANTITY[id],
    value,
    ...(targetMetres === undefined ? {} : { targetMetres }),
    derivation: `test/${id}`,
  });

  it("pairs each measurement with its own quantity, unit and label", () => {
    const readings = measurementReadingsFor([
      measurement("finalPosition", 4),
      measurement("finalVelocity", 4),
      measurement("averageVelocity", 2),
      measurement("maxSpeed", 4),
      measurement("timeToPosition", 1.414213562, 2),
    ]);
    expect(readings.map((reading) => reading.id)).toStrictEqual([
      "finalPosition",
      "finalVelocity",
      "averageVelocity",
      "maxSpeed",
      // A targeted measurement carries its target in the id: the loader emits one of these per
      // position marker, and two of them with the same id would make lookup ambiguous.
      "timeToPosition@2",
    ]);
    for (const reading of readings) {
      const id = reading.id.split("@")[0] as MeasurementId;
      expect(reading.quantity).toBe(EXPECTED_QUANTITY[id]);
      expect(reading.unit).toBe(SI_UNITS[EXPECTED_QUANTITY[id]]);
      // A targeted measurement appends its marker to the label, so it starts with the base
      // label rather than equalling it.
      expect(reading.label.startsWith(MEASUREMENT_LABELS[id])).toBe(true);
      expect(reading.origin).toBe("measured");
    }
    // Two speeds, two instruments, and neither is the position.
    expect(findReading(readings, "averageVelocity")?.text).toBe("2.00 m/s");
    expect(findReading(readings, "finalPosition")?.text).toBe("4.00 m");
  });

  it("keeps two time-to-position markers apart, and says which one each is", () => {
    const readings = measurementReadingsFor([
      measurement("timeToPosition", 1.414213562, 2),
      measurement("timeToPosition", 2, 4),
    ]);
    expect(readings.map((reading) => reading.id)).toStrictEqual([
      "timeToPosition@2",
      "timeToPosition@4",
    ]);
    expect(new Set(readings.map((reading) => reading.id)).size).toBe(readings.length);
    // The label names the marker, because "Time to reach target" twice with different numbers
    // is worse than useless to a learner.
    expect(readings[0]?.label).toContain("2.00 m");
    expect(readings[1]?.label).toContain("4.00 m");
    expect(readings[0]?.targetMetres).toBe(2);
    expect(readings[1]?.targetMetres).toBe(4);
  });

  it("fails closed when a measurement reports a quantity it cannot have a unit for", () => {
    const broken = { ...measurement("finalPosition", 4), quantity: "bogus" as QuantityId };
    // Rendering it would put a bare number where a unit belongs, which is the failure this
    // whole module exists to prevent.
    expect(() => measurementReadingsFor([broken])).toThrow(/unknown quantity/);
  });
});

describe("the position ruler stays readable across the whole track", () => {
  it("chooses the smallest nice step that fits the tick budget", () => {
    expect(rulerStepMetres(6)).toBe(1);
    expect(rulerStepMetres(12)).toBe(1);
    expect(rulerStepMetres(13)).toBe(2);
    expect(rulerStepMetres(30)).toBe(5);
    // 60 m in 5 m intervals is exactly the twelve-interval budget, so 5 is still chosen and
    // 10 would be needlessly coarse.
    expect(rulerStepMetres(60)).toBe(5);
    expect(rulerStepMetres(65)).toBe(10);
    // A span of nothing, or of nonsense, still gets a usable step rather than a division by
    // zero or an infinite number of ticks.
    for (const span of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(rulerStepMetres(span)).toBeGreaterThan(0);
    }
  });

  it("never exceeds the tick budget, for any span the frozen value range allows", () => {
    for (let span = 0.5; span <= 14; span += 0.25) {
      expect(rulerTicks(0, span).length).toBeLessThanOrEqual(RULER_MAX_TICKS + 1);
    }
  });

  it("ascends, stays inside the span, and is evenly spaced", () => {
    const ticks = rulerTicks(0, 6);
    expect(ticks.map((tick) => tick.metres)).toStrictEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const tick of ticks) {
      expect(tick.metres).toBeGreaterThanOrEqual(0);
      expect(tick.metres).toBeLessThanOrEqual(6);
      // Same formatter, same unit, one implementation.
      expect(tick.label).toBe(formatQuantity("position", tick.metres));
    }
    const spacings = ticks.slice(1).map((tick, index) => tick.metres - (ticks[index]?.metres ?? 0));
    expect(new Set(spacings).size).toBe(1);
  });

  it("covers the span, so the final position can always be read off it", () => {
    for (const span of [1, 3, 6, 7.5, 13.5, 40]) {
      const ticks = rulerTicks(0, span);
      const last = ticks[ticks.length - 1]?.metres ?? 0;
      const step = ticks.length > 1 ? (ticks[1]?.metres ?? 1) - (ticks[0]?.metres ?? 0) : span;
      expect(last).toBeGreaterThanOrEqual(span - step);
    }
  });

  it("supports a span that starts behind the origin", () => {
    // The frozen position range runs from -2 m, and a leftward push really does put the cart
    // behind the start gate, so the ruler must be able to say so.
    expect(rulerTicks(-2, 2).map((tick) => tick.metres)).toStrictEqual([-2, -1, 0, 1, 2]);
  });

  it("gives a degenerate span one reference tick rather than an empty ruler", () => {
    expect(rulerTicks(3, 3).map((tick) => tick.metres)).toStrictEqual([3]);
    expect(rulerTicks(5, 1).map((tick) => tick.metres)).toStrictEqual([5]);
  });

  it("refuses a step it cannot use", () => {
    for (const step of [0, -1, Number.NaN]) {
      expect(() => rulerTicks(0, 6, step)).toThrow(/step/);
    }
  });
});

describe("playback cannot alter a recorded result", () => {
  const state = recordedMission();
  const trial = state.trials[state.trials.length - 1]!;

  /** Every presentation clock a learner could reach, including ones outside the window. */
  const sweep: number[] = [];
  for (let seconds = -1; seconds <= 5; seconds += 0.05) sweep.push(Number(seconds.toFixed(4)));
  for (const sample of trial.samples) sweep.push(sample.state.elapsedSeconds);

  /** The recorded field each instrument must reproduce, read straight off the trial record. */
  const RECORDED_FIELD: Record<string, keyof (typeof trial.samples)[number]["state"]> = {
    position: "positionMetres",
    velocity: "velocityMetresPerSecond",
    acceleration: "accelerationMetresPerSecondSquared",
    netForce: "netForceNewtons",
    time: "elapsedSeconds",
  };

  it("shows a recorded sample's numbers at every playback position", () => {
    for (const seconds of sweep) {
      for (const running of [true, false]) {
        for (const reducedMotion of [true, false]) {
          const model = toSceneModel(state, { playbackSeconds: seconds, running, reducedMotion });
          const sample = trial.samples[model.playback.activeIndex];
          expect(sample).toBeDefined();
          if (!sample) continue;
          for (const [id, field] of Object.entries(RECORDED_FIELD)) {
            const reading = findReading(model.readouts, id);
            expect(reading, id).toBeDefined();
            // Compared against the trial record directly, not against another call to the
            // function under test. Exact equality, not closeness: a reading that drifted would
            // be a number no trial ever produced.
            expect(reading?.value).toBe(sample.state[field]);
            expect(reading?.text).toBe(formatQuantity(reading?.quantity ?? "position", sample.state[field]));
          }
        }
      }
    }
  });

  it("never shows a value the trial did not record", () => {
    for (const [id, field] of Object.entries(RECORDED_FIELD)) {
      const recordedValues = new Set(trial.samples.map((sample) => sample.state[field]));
      const shown = new Set<number>();
      for (const seconds of sweep) {
        const model = toSceneModel(state, {
          playbackSeconds: seconds,
          running: false,
          reducedMotion: false,
        });
        const reading = findReading(model.readouts, id);
        expect(reading, id).toBeDefined();
        shown.add(reading?.value ?? Number.NaN);
      }
      expect(shown.size).toBeGreaterThan(0);
      expect([...shown].every((value) => recordedValues.has(value))).toBe(true);
    }
  });

  it("gives the stopwatch a recorded instant, never the presentation clock", () => {
    const recordedTimes = new Set(trial.samples.map((sample) => sample.state.elapsedSeconds));
    for (const seconds of sweep) {
      const model = toSceneModel(state, {
        playbackSeconds: seconds,
        running: true,
        reducedMotion: false,
      });
      const stopwatch = findReading(model.readouts, "time");
      expect(stopwatch).toBeDefined();
      expect(recordedTimes.has(stopwatch?.value ?? Number.NaN)).toBe(true);
    }
    // And the stopwatch is the same instrument however the record is read.
    expect(stopwatchReading(1.25).text).toBe("1.25 s");
    expect(stopwatchReading(1.25).origin).toBe("measured");
  });
});
