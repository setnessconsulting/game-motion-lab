/**
 * Motion Lab units, display rounding, and tolerance floors.
 *
 * Pure and renderer-free. Implements the frozen contract in docs/SCIENCE_MODEL.md and
 * contracts/science-conventions.v1.json (GAME-383 / ML-01).
 *
 * Display rounding here is PRESENTATION ONLY. A value returned by `formatQuantity`
 * must never be written back into domain state or used for scoring (ADR 0004).
 */

export const SI_UNITS = {
  mass: "kg",
  force: "N",
  netForce: "N",
  position: "m",
  time: "s",
  velocity: "m/s",
  acceleration: "m/s\u00b2",
} as const;

export type QuantityId = keyof typeof SI_UNITS;

/** Frozen display decimal counts (docs/SCIENCE_MODEL.md §2). */
export const DISPLAY_DECIMALS: Record<QuantityId, number> = {
  mass: 2,
  force: 1,
  netForce: 1,
  position: 2,
  time: 2,
  velocity: 2,
  acceleration: 2,
};

/**
 * Frozen numeric answer tolerance floors (docs/SCIENCE_MODEL.md §2 and §7.4).
 *
 * Invariant asserted by tests/unit/units.test.ts and by scripts/verify-contracts.mjs:
 *   floor >= 2 * (10^-decimals / 2)
 * so a learner who reads a displayed value and enters it verbatim always passes.
 */
export const TOLERANCE_FLOORS: Record<QuantityId, number> = {
  mass: 0.01,
  force: 0.1,
  netForce: 0.1,
  position: 0.05,
  time: 0.05,
  velocity: 0.05,
  acceleration: 0.05,
};

/**
 * The frozen display-rounding algorithm (round-half-away-from-zero):
 *
 *   sign(value) * floor(|value| * 10^decimals + 0.5) / 10^decimals
 *
 * This is the *only* rounding rule for displayed scientific values. It is deliberately
 * not locale-dependent and not `toLocaleString`.
 */
export function roundHalfAwayFromZero(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const magnitude = Math.floor(Math.abs(value) * factor + 0.5) / factor;
  const signed = value < 0 ? -magnitude : magnitude;
  // Normalise negative zero so display strings are stable.
  return signed === 0 ? 0 : signed;
}

/** Round a value to a quantity's frozen display precision. */
export function roundForDisplay(quantity: QuantityId, value: number): number {
  return roundHalfAwayFromZero(value, DISPLAY_DECIMALS[quantity]);
}

/**
 * Format a quantity for display, with its unit. Presentation only.
 *
 * Returns e.g. "1.50 kg", "-2.40 m/s", "0.0 N".
 */
export function formatQuantity(quantity: QuantityId, value: number): string {
  if (!Number.isFinite(value)) return `${quantity}: unavailable`;
  return `${roundForDisplay(quantity, value).toFixed(DISPLAY_DECIMALS[quantity])} ${SI_UNITS[quantity]}`;
}
