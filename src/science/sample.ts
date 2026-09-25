/**
 * Deterministic trajectory sampling at requested timestamps.
 *
 * There is no fixed simulation tick. Callers choose the sample times; the kernel
 * evaluates stateAt(t) analytically at each (docs/SCIENCE_MODEL.md §6).
 */

import { ScienceValidationError } from "./errors.js";
import { stateAt } from "./motion.js";
import type { MotionDeclaration } from "./motion-types.js";
import type { MotionSample } from "./types.js";

/**
 * Sample the authoritative trajectory at explicit timestamps (seconds).
 * Times must lie inside [0, observationWindowSeconds].
 */
export function sampleAtTimes(
  declaration: MotionDeclaration,
  timesSeconds: readonly number[]
): readonly MotionSample[] {
  if (timesSeconds.length === 0) {
    throw new ScienceValidationError(
      "invalid-segment",
      "sampleAtTimes requires at least one timestamp"
    );
  }
  return timesSeconds.map((elapsedSeconds) => ({
    elapsedSeconds,
    state: stateAt(declaration, elapsedSeconds),
  }));
}

/**
 * Sample at a fixed number of evenly spaced instants over the observation window,
 * inclusive of both endpoints. sampleCount must be an integer >= 2.
 */
export function sampleTrajectory(
  declaration: MotionDeclaration,
  sampleCount: number
): readonly MotionSample[] {
  const window = declaration.observationWindowSeconds;
  if (!Number.isFinite(window) || window <= 0) {
    throw new ScienceValidationError(
      "invalid-observation-window",
      "observationWindowSeconds must be a finite, positive number"
    );
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new ScienceValidationError(
      "invalid-segment",
      "sampleCount must be an integer >= 2"
    );
  }
  const step = window / (sampleCount - 1);
  const times = Array.from({ length: sampleCount }, (_, index) =>
    Number((index * step).toFixed(9))
  );
  return sampleAtTimes(declaration, times);
}
