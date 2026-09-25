/**
 * Net-force composition for collinear 1D forces (docs/SCIENCE_MODEL.md §3–§4).
 *
 * Fnet = ΣF. When a resistive force is explicitly declared, its constant magnitude
 * opposes the declared motion direction and is subtracted from the applied sum.
 */

import { ScienceValidationError } from "./errors.js";
import type { ResistiveForceDeclaration } from "./motion-types.js";

/** Signed sum of collinear applied forces along the track axis. */
export function sumAppliedForces(appliedForcesNewtons: readonly number[]): number {
  if (appliedForcesNewtons.length === 0) {
    throw new ScienceValidationError(
      "empty-force-list",
      "At least one applied force entry is required (use [0] for balanced forces)"
    );
  }
  let sum = 0;
  for (const force of appliedForcesNewtons) {
    if (!Number.isFinite(force)) {
      throw new ScienceValidationError(
        "non-finite-input",
        "Every applied force must be a finite number"
      );
    }
    sum += force;
  }
  return sum;
}

/**
 * Signed contribution of a declared resistive force.
 *
 * Magnitude is non-negative. The force acts opposite the declared motion
 * direction: signed = −direction × magnitude.
 */
export function signedResistiveForce(
  resistive: ResistiveForceDeclaration | undefined
): number {
  if (resistive === undefined) {
    return 0;
  }
  if (!Number.isFinite(resistive.magnitudeNewtons) || resistive.magnitudeNewtons < 0) {
    throw new ScienceValidationError(
      "invalid-resistive-magnitude",
      "Resistive magnitude must be a finite number >= 0"
    );
  }
  if (resistive.opposingDirection !== 1 && resistive.opposingDirection !== -1) {
    throw new ScienceValidationError(
      "invalid-resistive-direction",
      "Resistive opposingDirection must be +1 (+x) or -1 (−x)"
    );
  }
  return -resistive.opposingDirection * resistive.magnitudeNewtons;
}

/**
 * Compose net force: Fnet = ΣF_applied + signed(resistive).
 *
 * Equivalent to F_applied − F_resistive when motion is in +x and resistive
 * magnitude is positive (SCIENCE_MODEL §4).
 */
export function composeNetForce(
  appliedForcesNewtons: readonly number[],
  resistive?: ResistiveForceDeclaration
): number {
  return sumAppliedForces(appliedForcesNewtons) + signedResistiveForce(resistive);
}
