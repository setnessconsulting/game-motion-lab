/**
 * Motion Lab science package — the only scientific authority in the application.
 *
 * Boundary contract (ADR 0001, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): nothing in this package may import React,
 * Phaser, the DOM, storage, or the network.
 *
 * Content status: ML-02 bootstrap. See ./bootstrap-motion.ts for what is and is not
 * implemented yet, and docs/DECISIONS.md for which issue owns each remaining piece.
 */

export { SI_UNITS, DISPLAY_DECIMALS, TOLERANCE_FLOORS } from "./units.js";
export type { QuantityId } from "./units.js";
export { roundHalfAwayFromZero, roundForDisplay, formatQuantity } from "./units.js";
export type { CartState, MotionSample } from "./types.js";
export { RESTING_CART } from "./types.js";
export type { BootstrapMotionDeclaration } from "./bootstrap-motion.js";
export {
  sampleBootstrapLinearState,
  sampleBootstrapTrajectory,
} from "./bootstrap-motion.js";
