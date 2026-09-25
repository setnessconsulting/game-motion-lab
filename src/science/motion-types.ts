/**
 * Declaration types for the analytical 1D motion kernel.
 *
 * JSON-safe, renderer-independent. Implements docs/SCIENCE_MODEL.md.
 */

/** Track-axis direction: +1 is +x (right), −1 is −x (left). */
export type MotionDirection = 1 | -1;

/**
 * Supported v1 force models. Anything else fails closed with a typed error.
 * (docs/SCIENCE_MODEL.md §4, contracts/science-conventions.v1.json)
 */
export type ForceModelId = "constant-collinear";

/**
 * Explicit resistive force. Never implicit — only when a scenario declares it.
 *
 * Magnitude is constant and non-negative. It opposes `opposingDirection`, the
 * declared direction of motion for the segment.
 */
export interface ResistiveForceDeclaration {
  readonly magnitudeNewtons: number;
  readonly opposingDirection: MotionDirection;
}

/**
 * One constant-net-force segment evaluated with closed-form kinematics.
 *
 * Segments compose into piecewise trajectories with continuous boundary
 * conditions (SCIENCE_MODEL §1).
 */
export interface MotionSegmentDeclaration {
  readonly massKilograms: number;
  readonly initialPositionMetres: number;
  readonly initialVelocityMetresPerSecond: number;
  /** Signed collinear applied forces; use `[0]` for balanced. */
  readonly appliedForcesNewtons: readonly number[];
  readonly resistive?: ResistiveForceDeclaration;
  readonly forceModel: ForceModelId;
  /** Segment duration in seconds; must be finite and > 0. */
  readonly durationSeconds: number;
}

/**
 * A complete motion declaration: one or more piecewise-constant segments and
 * an observationWindowSeconds bound used to reject out-of-range samples.
 */
export interface MotionDeclaration {
  readonly segments: readonly MotionSegmentDeclaration[];
  readonly observationWindowSeconds: number;
}

/** Convenience: a single constant-force segment spanning observationWindowSeconds. */
export interface SingleSegmentMotionInput {
  readonly massKilograms: number;
  readonly initialPositionMetres?: number;
  readonly initialVelocityMetresPerSecond?: number;
  readonly appliedForcesNewtons: readonly number[];
  readonly resistive?: ResistiveForceDeclaration;
  readonly forceModel?: ForceModelId;
  readonly observationWindowSeconds: number;
}
