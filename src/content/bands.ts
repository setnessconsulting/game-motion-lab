/**
 * Frozen authored-value bands and display-safety helpers (GAME-389 / ML-05).
 *
 * The numbers here are transcribed from docs/SCIENCE_MODEL.md section 8 and
 * section 7.3. They are deliberately *authoring* bands, not physics: they
 * exist so the reasoning carries the difficulty and so a displayed value can
 * always be read two ways at most never.
 *
 * Nothing in this module computes motion. It only decides whether a number an
 * author typed is admissible content, and whether that number would survive a
 * round trip through the display rounding rule.
 */

import {
  DISPLAY_DECIMALS,
  TOLERANCE_FLOORS,
  roundForDisplay,
  type QuantityId,
} from "../science/index.js";

/** The frozen authored bands, in SI units. */
export const AUTHORED_BANDS = {
  /** One decimal place on authored masses (e.g. 1.5 kg). */
  cartMassKilograms: { min: 1.0, max: 4.0, decimals: 1, name: "mass" },
  /** Whole newtons, signed; the magnitude band is 1 N to 12 N. */
  appliedForceNewtons: { minMagnitude: 1, maxMagnitude: 12, decimals: 0, name: "force" },
  /** Whole newtons, never negative. */
  resistiveForceNewtons: { min: 0, max: 3, decimals: 0, name: "force" },
  /** The authored observation span, in seconds. */
  observationSpanSeconds: { min: 0, max: 6, name: "time" },
  /** The modelled track band, in metres. */
  positionMetres: { min: -2, max: 12, name: "position" },
  /** Only where a scenario explicitly declares an initial velocity. */
  initialVelocityMetresPerSecond: { min: -2, max: 2, name: "velocity" },
  /**
   * Acceleration is emergent, never authored. The frozen closed interval is
   * [1 N / 4.0 kg, 12 N / 1.0 kg] = [0.25, 12] m/s^2 for a nonzero net force.
   * A zero net force legitimately yields a = 0, which is the balanced control
   * the Calibration Run family exists to teach, so zero is admitted only when
   * the net force is exactly zero.
   */
  accelerationMetresPerSecondSquared: { minNonZero: 0.25, max: 12, name: "acceleration" },
} as const satisfies Readonly<Record<string, Readonly<Record<string, number | string>>>>;

/**
 * How close an authoritative value may come to a display rounding boundary.
 *
 * docs/SCIENCE_MODEL.md section 7.3 requires content to avoid values within
 * 1e-9 of a boundary, because an exact half-way point is the one place where
 * two reasonable readers of the same display rule can print two different
 * strings.
 */
export const DISPLAY_BOUNDARY_EPSILON = 1e-9;

/**
 * True when `value` sits exactly on a display rounding boundary for its
 * quantity, i.e. when rounding it is genuinely two-valued.
 *
 * A value that is an exact multiple of the display increment (7.5 at two
 * decimals) is *not* ambiguous: it prints identically under any rounding mode.
 * Only the half-way points between two increments are.
 */
export function isOnDisplayRoundingBoundary(value: number, quantity: QuantityId): boolean {
  if (!Number.isFinite(value)) return false;
  const decimals = DISPLAY_DECIMALS[quantity];
  const scaled = Math.abs(value) * 10 ** decimals;
  const distanceToHalf = Math.abs(scaled - Math.floor(scaled) - 0.5);
  return distanceToHalf <= DISPLAY_BOUNDARY_EPSILON * 10 ** decimals;
}

/**
 * True when a displayed value can be read back verbatim and still be within
 * the frozen tolerance floor (docs/SCIENCE_MODEL.md section 7.3 invariant).
 */
export function isDisplayRoundTripSafe(value: number, quantity: QuantityId): boolean {
  return Math.abs(roundForDisplay(quantity, value) - value) <= TOLERANCE_FLOORS[quantity];
}

/** True when a value is a whole number of the quantity's authored unit. */
export function isWholeNumber(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value);
}

/** True when a mass carries exactly the authored number of decimal places. */
export function hasAtMostDecimals(value: number, decimals: number): boolean {
  if (!Number.isFinite(value)) return false;
  const factor = 10 ** decimals;
  return Math.abs(value * factor - Math.round(value * factor)) <= DISPLAY_BOUNDARY_EPSILON * factor;
}
