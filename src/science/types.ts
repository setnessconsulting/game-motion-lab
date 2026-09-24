/**
 * Authoritative motion types. JSON-safe, renderer-independent (ADR 0001).
 *
 * Sign convention (docs/SCIENCE_MODEL.md §2): +x is rightward along the track,
 * x = 0 at the start gate, and acceleration shares the sign of the net force.
 */

/** The authoritative state of the cart at one instant. */
export interface CartState {
  /** `x(t)` in metres from the start gate. */
  readonly positionMetres: number;
  /** `v(t)` in metres per second (signed). */
  readonly velocityMetresPerSecond: number;
  /** `a(t)` in metres per second squared (signed). */
  readonly accelerationMetresPerSecondSquared: number;
  /** `Fnet` in newtons (signed), the sum of the collinear forces. */
  readonly netForceNewtons: number;
  /** `t` in seconds elapsed since the trial run began. */
  readonly elapsedSeconds: number;
}

/** One sampled point of an authoritative trajectory. */
export interface MotionSample {
  readonly elapsedSeconds: number;
  readonly state: CartState;
}

export const RESTING_CART: CartState = {
  positionMetres: 0,
  velocityMetresPerSecond: 0,
  accelerationMetresPerSecondSquared: 0,
  netForceNewtons: 0,
  elapsedSeconds: 0,
};
