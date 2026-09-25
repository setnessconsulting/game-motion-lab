/**
 * Derived measurements (GAME-388 / ML-04).
 *
 * Every measurement in a trial record is produced *here*, from the ML-03
 * kernel, and never accepted from a caller. That is the mechanical reason the
 * presentation layer cannot forge a measurement that scoring will later
 * accept: no request, intent, or view-model type carries a measured value, so
 * there is no value to forge.
 *
 * The module also does no physics of its own. Time-to-position is located by
 * deterministic bisection *on* the authoritative `stateAt(t)`, so it inherits
 * the kernel's exactness instead of re-deriving kinematics and risking a
 * second, divergent implementation.
 */

import { stateAt, type MotionDeclaration, type MotionSample, type QuantityId } from "../science/index.js";
import type { Measurement, MeasurementId } from "./experiment-types.js";

/** Bisection is run to a fixed iteration count so the result is deterministic. */
const BISECTION_ITERATIONS = 60;

/** Time-to-position is reported to this resolution (seconds). */
const TIME_RESOLUTION_SECONDS = 1e-9;

function roundToResolution(value: number, resolution: number): number {
  const rounded = Math.round(value / resolution) * resolution;
  // Normalise -0 so two equivalent paths cannot produce different records.
  return rounded === 0 ? 0 : rounded;
}

function measurement(
  id: MeasurementId,
  quantity: QuantityId,
  value: number,
  derivation: string,
  targetMetres?: number
): Measurement {
  return targetMetres === undefined
    ? { id, quantity, value, derivation }
    : { id, quantity, value, targetMetres, derivation };
}

function signChange(left: number, right: number): boolean {
  return (left < 0 && right > 0) || (left > 0 && right < 0);
}

/**
 * Locate the first instant at which the authoritative position reaches
 * `targetMetres`, by bisecting a bracketing pair of samples against
 * `stateAt`. Returns null when the target is never reached in the span.
 */
function timeToPosition(
  declaration: MotionDeclaration,
  samples: readonly MotionSample[],
  targetMetres: number
): number | null {
  if (samples.length === 0) return null;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const residual = sample.state.positionMetres - targetMetres;
    if (residual === 0) return roundToResolution(sample.elapsedSeconds, TIME_RESOLUTION_SECONDS);

    const next = samples[index + 1];
    if (next === undefined) break;
    const nextResidual = next.state.positionMetres - targetMetres;
    if (!signChange(residual, nextResidual)) continue;

    let low = sample.elapsedSeconds;
    let high = next.elapsedSeconds;
    for (let step = 0; step < BISECTION_ITERATIONS; step += 1) {
      const mid = (low + high) / 2;
      const midResidual = stateAt(declaration, mid).positionMetres - targetMetres;
      if (midResidual === 0) {
        low = mid;
        high = mid;
        break;
      }
      if (signChange(residual, midResidual)) {
        high = mid;
      } else {
        low = mid;
      }
    }
    return roundToResolution((low + high) / 2, TIME_RESOLUTION_SECONDS);
  }

  return null;
}

export interface DerivedMeasurements {
  readonly measurements: readonly Measurement[];
  /** Requested position markers that the cart never reached in the span. */
  readonly unreachedPositionTargetsMetres: readonly number[];
}

/**
 * Derive the full measurement set for one authoritative run.
 *
 * The returned values are unrounded. Display rounding is presentation-only and
 * is never applied here (ADR 0004).
 */
export function deriveMeasurements(
  declaration: MotionDeclaration,
  samples: readonly MotionSample[],
  positionTargetsMetres: readonly number[] = []
): DerivedMeasurements {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error("deriveMeasurements requires at least one sample");
  }

  const span = last.state.elapsedSeconds - first.state.elapsedSeconds;
  const displacement = last.state.positionMetres - first.state.positionMetres;
  const averageVelocity = span > 0 ? displacement / span : 0;

  // Honest bound: this is the maximum speed across the sampled instants, not a
  // continuous-time maximum, and the derivation string says so.
  let maxSpeed = 0;
  for (const sample of samples) {
    const speed = Math.abs(sample.state.velocityMetresPerSecond);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  const collected: Measurement[] = [
    measurement(
      "finalPosition",
      "position",
      last.state.positionMetres,
      "x at the end of the declared observation span, read from the authoritative kernel"
    ),
    measurement(
      "finalVelocity",
      "velocity",
      last.state.velocityMetresPerSecond,
      "v at the end of the declared observation span, read from the authoritative kernel"
    ),
    measurement(
      "averageVelocity",
      "velocity",
      averageVelocity,
      "displacement divided by elapsed time across the declared observation span"
    ),
    measurement(
      "maxSpeed",
      "velocity",
      maxSpeed,
      "maximum of |v| across the sampled instants (a sampled maximum, not a continuous-time maximum)"
    ),
  ];

  const unreached: number[] = [];
  for (const target of positionTargetsMetres) {
    const arrival = timeToPosition(declaration, samples, target);
    if (arrival === null) {
      unreached.push(target);
      continue;
    }
    collected.push(
      measurement(
        "timeToPosition",
        "time",
        arrival,
        "first instant the authoritative position reaches the marker, located by deterministic bisection on stateAt(t)",
        target
      )
    );
  }

  return { measurements: collected, unreachedPositionTargetsMetres: unreached };
}

/** Find one measurement by id, optionally disambiguated by its target. */
export function findMeasurement(
  measurements: readonly Measurement[],
  id: MeasurementId,
  targetMetres?: number
): Measurement | undefined {
  return measurements.find(
    (entry) =>
      entry.id === id &&
      (targetMetres === undefined ||
        entry.targetMetres === undefined ||
        entry.targetMetres === targetMetres)
  );
}
