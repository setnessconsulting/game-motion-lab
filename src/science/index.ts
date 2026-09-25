/**
 * Motion Lab science package — the only scientific authority in the application.
 *
 * Boundary contract (ADR 0001, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): nothing in this package may import React,
 * Phaser, the DOM, storage, or the network.
 *
 * GAME-386 (ML-03): deterministic analytical 1D kernel. See docs/SCIENCE_MODEL.md.
 */

export { SI_UNITS, DISPLAY_DECIMALS, TOLERANCE_FLOORS } from "./units.js";
export type { QuantityId } from "./units.js";
export { roundHalfAwayFromZero, roundForDisplay, formatQuantity } from "./units.js";

export type { CartState, MotionSample } from "./types.js";
export { RESTING_CART } from "./types.js";

export { ScienceValidationError, isScienceValidationError } from "./errors.js";
export type { ScienceValidationCode } from "./errors.js";

export type {
  ForceModelId,
  MotionDeclaration,
  MotionDirection,
  MotionSegmentDeclaration,
  ResistiveForceDeclaration,
  SingleSegmentMotionInput,
} from "./motion-types.js";

export { composeNetForce, sumAppliedForces, signedResistiveForce } from "./forces.js";

export {
  accelerationFor,
  assertKinematicConsistency,
  netForceFor,
  resolveMotion,
  reversalTimeSeconds,
  singleSegmentDeclaration,
  stateAt,
} from "./motion.js";
export type { ResolvedSegment } from "./motion.js";

export { sampleAtTimes, sampleTrajectory } from "./sample.js";
