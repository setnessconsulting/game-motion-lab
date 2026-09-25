import {
  SI_UNITS,
  formatQuantity,
  roundForDisplay,
  type CartState,
  type QuantityId,
} from "../science/index.js";
import type { Measurement, MeasurementId } from "../domain/index.js";

/**
 * The lab's instruments (GAME-391 / ML-07).
 *
 * ML-07's job is to make authoritative science observable rather than hidden behind
 * animation. This module is the design-independent half of that job: which instruments exist,
 * what each one reports, in what unit, from which origin — and none of it is a visual decision.
 * The learner-facing panel that arranges them is GAME-387's, and is deliberately not here.
 *
 * Three rules are enforced here rather than merely intended:
 *
 *   1. **Display values are never authoritative.** Every reading carries the unrounded
 *      `value` alongside the `displayValue` and `text`, so a correctness check can use the
 *      real number and a screen can use the rounded one. Nothing rounds twice: `text` comes
 *      from ML-01's frozen `formatQuantity`, so there is one formatter in the product.
 *   2. **Measured and configured values are distinguishable.** The trial's recorded position
 *      and the cart mass the learner set are different kinds of thing, and a learner who
 *      cannot tell them apart cannot reason about a controlled comparison. `origin` says
 *      which is which.
 *   3. **One direction convention.** "to the right" used to be inlined where the force label
 *      was built, "+x (right is positive)" in the Phaser scene, and the canvas status line
 *      hand-formatted its own units. Three places meant three chances to disagree about what
 *      the positive direction is; AC5 asks for consistency, so it now has one home.
 */

/** The one source of truth for axis and direction wording. */
export const DIRECTION_CONVENTION = {
  /** Shown on the laboratory axis so the positive direction is never implied by colour. */
  axis: "+x (right is positive)",
  positive: "rightward",
  negative: "leftward",
  balanced: "balanced",
  towardPositive: "to the right",
  towardNegative: "to the left",
} as const;

export type Direction = "positive" | "negative" | "balanced";

/** Display labels for the live quantities. Units come from the science package. */
export const QUANTITY_LABELS: Record<QuantityId, string> = {
  mass: "Cart mass",
  force: "Applied force",
  netForce: "Net force",
  position: "Position",
  time: "Elapsed time",
  velocity: "Velocity",
  acceleration: "Acceleration",
};

/** Display labels for the ML-04 derived measurements. */
export const MEASUREMENT_LABELS: Record<MeasurementId, string> = {
  finalPosition: "Final position",
  finalVelocity: "Final velocity",
  averageVelocity: "Average velocity",
  maxSpeed: "Max speed",
  timeToPosition: "Time to reach target",
};

/** Where an instrument's number comes from. */
export type ReadingOrigin =
  /** Recorded by the trial, or derived from what it recorded. */
  | "measured"
  /** A value the learner set with a control, before the trial ran. */
  | "configured";

export interface InstrumentReading {
  /**
   * Stable instrument identity, e.g. `position`, `finalPosition`, `appliedForce`.
   *
   * Distinct from `quantity`: the configured applied force and the measured net force are both
   * newtons, and the average and maximum speeds are both velocities, but a learner reads them
   * off different instruments and they must not collide in a lookup.
   */
  readonly id: string;
  /** The frozen quantity this instrument reports, which fixes its unit and display precision. */
  readonly quantity: QuantityId;
  readonly label: string;
  /** Full precision. Never shown; present so rounding cannot become the truth by accident. */
  readonly value: number;
  /** Display-rounded, for chart-style presentation. Presentation only. */
  readonly displayValue: number;
  /** The display string, e.g. "6.00 m". Presentation only. */
  readonly text: string;
  readonly unit: string;
  readonly origin: ReadingOrigin;
  /**
   * For a measurement that targeted a position, the position it targeted.
   *
   * ML-04 emits `timeToPosition` once per position marker, so two of them can share a
   * measurement id. The instrument id carries the target as well (see `measurementReadingsFor`)
   * or a lookup would silently return whichever one happened to be first.
   */
  readonly targetMetres?: number;
}

/** Build a reading for a quantity, using the frozen unit table and display precision. */
export function quantityReading(
  id: QuantityId,
  value: number,
  origin: ReadingOrigin
): InstrumentReading {
  return {
    id,
    quantity: id,
    label: QUANTITY_LABELS[id],
    value,
    displayValue: roundForDisplay(id, value),
    text: formatQuantity(id, value),
    unit: SI_UNITS[id],
    origin,
  };
}

/**
 * The stopwatch.
 *
 * It reads the elapsed time of a **recorded sample**. There is deliberately no variant that
 * takes the presentation clock: the playback clock decides which sample is shown, and if the
 * stopwatch showed that instead, a display driven by frame rate would disagree with the trial
 * record. `tests/unit/instruments.test.ts` holds that line for every playback position.
 */
export function stopwatchReading(elapsedSecondsOfRecordedSample: number): InstrumentReading {
  return quantityReading("time", elapsedSecondsOfRecordedSample, "measured");
}

/** The live instruments, read from one recorded sample of a trial. */
export function measuredReadingsFor(state: CartState): readonly InstrumentReading[] {
  return [
    quantityReading("position", state.positionMetres, "measured"),
    quantityReading("velocity", state.velocityMetresPerSecond, "measured"),
    quantityReading("acceleration", state.accelerationMetresPerSecondSquared, "measured"),
    quantityReading("netForce", state.netForceNewtons, "measured"),
    stopwatchReading(state.elapsedSeconds),
  ];
}

/**
 * The five derived measurements ML-04 produces, as instruments.
 *
 * The quantity comes from the measurement itself, so a display cannot pair, say, a speed with
 * metre units. An unknown quantity fails closed rather than rendering a bare number.
 */
export function measurementReadingsFor(
  measurements: readonly Measurement[]
): readonly InstrumentReading[] {
  return measurements.map((measurement) => {
    const quantity = measurement.quantity;
    if (!(quantity in SI_UNITS)) {
      throw new Error(
        `Measurement ${measurement.id} reports unknown quantity ${String(quantity)}; ` +
          "the display would have no unit for it."
      );
    }
    const baseLabel = MEASUREMENT_LABELS[measurement.id] ?? measurement.id;
    const target = measurement.targetMetres;
    return {
      // Uniqueness is an invariant of this list, and a targeted measurement is the one case
      // that can break it: two "time to reach" readings at different markers are two
      // instruments, and a lookup by id must land on the one the learner is reading.
      id: target === undefined ? measurement.id : `${measurement.id}@${target}`,
      quantity,
      label:
        target === undefined ? baseLabel : `${baseLabel} ${formatQuantity("position", target)}`,
      value: measurement.value,
      displayValue: roundForDisplay(quantity, measurement.value),
      text: formatQuantity(quantity, measurement.value),
      unit: SI_UNITS[quantity],
      origin: "measured" as const,
      ...(target === undefined ? {} : { targetMetres: target }),
    };
  });
}

/** The four settings a trial was run under, structurally compatible with ML-04's TrialConfig. */
export interface ConfiguredValues {
  readonly cartMassKilograms: number;
  readonly appliedForceNewtons: number;
  readonly initialVelocityMetresPerSecond: number;
  readonly observationWindowSeconds: number;
}

/**
 * The control settings, as instruments.
 *
 * These are the values the learner chose. They are marked `configured` so the UI can separate
 * "what I set" from "what happened", which is the distinction a controlled investigation turns
 * on — and the distinction AC4's rule about not altering results depends on.
 */
export function configuredReadingsFor(config: ConfiguredValues): readonly InstrumentReading[] {
  return [
    configuredReading("cartMass", "mass", "Cart mass", config.cartMassKilograms),
    configuredReading("appliedForce", "force", "Applied force", config.appliedForceNewtons),
    configuredReading(
      "initialVelocity",
      "velocity",
      "Initial velocity",
      config.initialVelocityMetresPerSecond
    ),
    configuredReading(
      "observationWindow",
      "time",
      "Observation window",
      config.observationWindowSeconds
    ),
  ];
}

function configuredReading(
  id: string,
  quantity: QuantityId,
  label: string,
  value: number
): InstrumentReading {
  return {
    id,
    quantity,
    label,
    value,
    displayValue: roundForDisplay(quantity, value),
    text: formatQuantity(quantity, value),
    unit: SI_UNITS[quantity],
    origin: "configured",
  };
}

/**
 * The direction of a net force, and the words that say so.
 *
 * The words come from the convention, so the arrow label, the accessible name and anything
 * else that has to state a direction cannot drift apart. Direction is always stated in words:
 * colour alone never carries it (docs/ACCESSIBILITY.md §6).
 */
export function directionWords(netForceNewtons: number): {
  readonly direction: Direction;
  readonly words: string;
  readonly label: string;
} {
  const rounded = roundForDisplay("netForce", netForceNewtons);
  if (rounded === 0) {
    return {
      direction: "balanced",
      words: DIRECTION_CONVENTION.balanced,
      // A balanced cart states the number as well as the conclusion, because "0.0 N" is the
      // evidence and "balanced" is the reading of it.
      label: `${DIRECTION_CONVENTION.balanced} (0.0 N)`,
    };
  }
  const positive = rounded > 0;
  return {
    direction: positive ? "positive" : "negative",
    words: positive ? DIRECTION_CONVENTION.towardPositive : DIRECTION_CONVENTION.towardNegative,
    label: `${Math.abs(rounded).toFixed(1)} N ${positive ? DIRECTION_CONVENTION.towardPositive : DIRECTION_CONVENTION.towardNegative}`,
  };
}

/** Look one reading up by instrument id. */
export function findReading(
  readings: readonly InstrumentReading[],
  id: string
): InstrumentReading | undefined {
  return readings.find((reading) => reading.id === id);
}

/** A tick on the position ruler, in metres. */
export interface RulerTick {
  readonly metres: number;
  readonly label: string;
}

/**
 * The most intervals a ruler may be divided into before its labels stop being readable.
 *
 * A span divided into n intervals carries n+1 ticks, so the tick count is one more than this.
 */
export const RULER_MAX_TICKS = 12;

const RULER_STEPS: readonly number[] = [1, 2, 5, 10];

/**
 * Choose a tick spacing that keeps the ruler readable across the whole track.
 *
 * A fixed spacing cannot work: one metre is right for a six-metre track and eleven labels on a
 * thirteen-metre track is a smear. The rule is the smallest nice step that stays within the
 * tick budget, so the ruler stays legible without any screen-size knowledge — which is what
 * keeps it a data decision rather than a layout one.
 */
export function rulerStepMetres(spanMetres: number): number {
  const span = Number.isFinite(spanMetres) && spanMetres > 0 ? spanMetres : 1;
  for (const step of RULER_STEPS) {
    if (span / step <= RULER_MAX_TICKS) return step;
  }
  return RULER_STEPS[RULER_STEPS.length - 1] as number;
}

/**
 * The ruler, in metres.
 *
 * Ticks are the multiples of the step inside the span, ascending, each labelled with its unit
 * through the same formatter the rest of the product uses. A span too short to hold two ticks
 * still gets one reference tick at its start rather than an empty ruler, because a ruler with
 * nothing on it is not a ruler.
 */
export function rulerTicks(
  startMetres: number,
  endMetres: number,
  stepMetres?: number
): readonly RulerTick[] {
  const start = Number.isFinite(startMetres) ? startMetres : 0;
  const end = Number.isFinite(endMetres) ? endMetres : start;
  const step = stepMetres ?? rulerStepMetres(end - start);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`Ruler step must be finite and positive, received ${String(step)}.`);
  }

  const ticks: RulerTick[] = [];
  const firstIndex = Math.ceil(start / step - 1e-9);
  const lastIndex = Math.floor(end / step + 1e-9);
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const metres = Number((index * step).toFixed(9));
    ticks.push({ metres, label: formatQuantity("position", metres) });
  }
  if (ticks.length === 0) {
    ticks.push({ metres: start, label: formatQuantity("position", start) });
  }
  return ticks;
}
