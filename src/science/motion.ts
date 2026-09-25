/**
 * Deterministic analytical 1D motion kernel (GAME-386 / ML-03).
 *
 * Governing relations (docs/SCIENCE_MODEL.md §3):
 *   Fnet = ΣF
 *   a    = Fnet / m
 *   v(t) = v0 + a·t
 *   x(t) = x0 + v0·t + ½·a·t²
 *
 * Closed-form only. No integrator, no physics engine, no renderer timestep.
 */

import { ScienceValidationError } from "./errors.js";
import { composeNetForce } from "./forces.js";
import type {
  ForceModelId,
  MotionDeclaration,
  MotionSegmentDeclaration,
  SingleSegmentMotionInput,
} from "./motion-types.js";
import type { CartState } from "./types.js";

const SUPPORTED_FORCE_MODELS: ReadonlySet<ForceModelId> = new Set(["constant-collinear"]);

/** Internal resolved segment with precomputed Fnet and a. */
export interface ResolvedSegment {
  readonly massKilograms: number;
  readonly initialPositionMetres: number;
  readonly initialVelocityMetresPerSecond: number;
  readonly netForceNewtons: number;
  readonly accelerationMetresPerSecondSquared: number;
  readonly durationSeconds: number;
  /** Absolute start time of this segment within the trial (seconds). */
  readonly startSeconds: number;
  /** Absolute end time (start + duration). */
  readonly endSeconds: number;
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new ScienceValidationError("non-finite-input", `${label} must be a finite number`);
  }
  return value;
}

function validateForceModel(forceModel: ForceModelId): void {
  if (!SUPPORTED_FORCE_MODELS.has(forceModel)) {
    throw new ScienceValidationError(
      "unsupported-force-model",
      `Unsupported force model ${JSON.stringify(forceModel)}; v1 supports only constant-collinear`
    );
  }
}

/**
 * Analytic time at which velocity reverses sign on a constant-acceleration segment.
 * Returns null when a = 0 or when velocity never crosses zero for t >= 0 within
 * the kinematics of this segment's initial conditions.
 */
export function reversalTimeSeconds(
  initialVelocityMetresPerSecond: number,
  accelerationMetresPerSecondSquared: number
): number | null {
  if (accelerationMetresPerSecondSquared === 0) {
    return null;
  }
  const t = -initialVelocityMetresPerSecond / accelerationMetresPerSecondSquared;
  if (!Number.isFinite(t) || t < 0) {
    return null;
  }
  // Normalise -0 from (−0)/a when v0 is +0.
  return t === 0 ? 0 : t;
}

function resolveSegment(
  segment: MotionSegmentDeclaration,
  startSeconds: number
): ResolvedSegment {
  validateForceModel(segment.forceModel);

  const mass = requireFinite(segment.massKilograms, "massKilograms");
  if (mass <= 0) {
    throw new ScienceValidationError(
      "non-positive-mass",
      "massKilograms must be finite and > 0"
    );
  }

  const x0 = requireFinite(segment.initialPositionMetres, "initialPositionMetres");
  const v0 = requireFinite(
    segment.initialVelocityMetresPerSecond,
    "initialVelocityMetresPerSecond"
  );
  const duration = requireFinite(segment.durationSeconds, "durationSeconds");
  if (duration <= 0) {
    throw new ScienceValidationError(
      "invalid-segment",
      "durationSeconds must be finite and > 0"
    );
  }

  const netForce = composeNetForce(segment.appliedForcesNewtons, segment.resistive);
  const acceleration = netForce / mass;

  // Reject only a *mid-segment* sign change. t_reverse = 0 means start-from-rest
  // (not a reversal). t_reverse = duration means the segment ends at rest without
  // continuing into the opposite-sign regime.
  const tReverse = reversalTimeSeconds(v0, acceleration);
  if (tReverse !== null && tReverse > 0 && tReverse < duration) {
    throw new ScienceValidationError(
      "reversal-crossing-window",
      `Velocity reverses at t_reverse=${tReverse}s inside the segment of duration ${duration}s; ` +
        "split into separate segments at the reversal (SCIENCE_MODEL §4)"
    );
  }

  return {
    massKilograms: mass,
    initialPositionMetres: x0,
    initialVelocityMetresPerSecond: v0,
    netForceNewtons: netForce,
    accelerationMetresPerSecondSquared: acceleration,
    durationSeconds: duration,
    startSeconds,
    endSeconds: startSeconds + duration,
  };
}

/** Validate and resolve every segment; reject invalid declarations closed. */
export function resolveMotion(declaration: MotionDeclaration): readonly ResolvedSegment[] {
  const window = requireFinite(
    declaration.observationWindowSeconds,
    "observationWindowSeconds"
  );
  if (window < 0) {
    throw new ScienceValidationError(
      "invalid-observation-window",
      "observationWindowSeconds must be finite and >= 0"
    );
  }
  if (declaration.segments.length === 0) {
    throw new ScienceValidationError(
      "invalid-segment",
      "MotionDeclaration requires at least one segment"
    );
  }

  const resolved: ResolvedSegment[] = [];
  let cursor = 0;
  for (const segment of declaration.segments) {
    const next = resolveSegment(segment, cursor);
    resolved.push(next);
    cursor = next.endSeconds;
  }

  // Continuous boundary check: each segment's start state must match the prior
  // segment's end state when callers author multi-segment trials. Single-segment
  // declarations are always continuous by construction.
  for (let index = 1; index < resolved.length; index += 1) {
    const prior = resolved[index - 1]!;
    const current = resolved[index]!;
    const priorEnd = evaluateSegmentState(prior, prior.durationSeconds);
    if (
      priorEnd.positionMetres !== current.initialPositionMetres ||
      priorEnd.velocityMetresPerSecond !== current.initialVelocityMetresPerSecond
    ) {
      throw new ScienceValidationError(
        "invalid-segment",
        `Segment ${index} initial conditions are discontinuous with the end of segment ${index - 1}`
      );
    }
  }

  return resolved;
}

/** Build a single-segment MotionDeclaration from a convenience input. */
export function singleSegmentDeclaration(
  input: SingleSegmentMotionInput
): MotionDeclaration {
  const observationWindowSeconds = requireFinite(
    input.observationWindowSeconds,
    "observationWindowSeconds"
  );
  if (observationWindowSeconds <= 0) {
    throw new ScienceValidationError(
      "invalid-observation-window",
      "observationWindowSeconds must be finite and > 0 for a single-segment trial"
    );
  }
  return {
    observationWindowSeconds,
    segments: [
      {
        massKilograms: input.massKilograms,
        initialPositionMetres: input.initialPositionMetres ?? 0,
        initialVelocityMetresPerSecond: input.initialVelocityMetresPerSecond ?? 0,
        appliedForcesNewtons: input.appliedForcesNewtons,
        resistive: input.resistive,
        forceModel: input.forceModel ?? "constant-collinear",
        durationSeconds: observationWindowSeconds,
      },
    ],
  };
}

function evaluateSegmentState(segment: ResolvedSegment, localSeconds: number): CartState {
  const t = localSeconds;
  const a = segment.accelerationMetresPerSecondSquared;
  const v0 = segment.initialVelocityMetresPerSecond;
  const x0 = segment.initialPositionMetres;
  return {
    positionMetres: x0 + v0 * t + 0.5 * a * t * t,
    velocityMetresPerSecond: v0 + a * t,
    accelerationMetresPerSecondSquared: a,
    netForceNewtons: segment.netForceNewtons,
    elapsedSeconds: segment.startSeconds + t,
  };
}

/**
 * Internal consistency checks (SCIENCE_MODEL §3). Used only as assertions —
 * never as the primary evaluator.
 */
export function assertKinematicConsistency(state: CartState, segment: ResolvedSegment): void {
  const t = state.elapsedSeconds - segment.startSeconds;
  const a = segment.accelerationMetresPerSecondSquared;
  const v0 = segment.initialVelocityMetresPerSecond;
  const x0 = segment.initialPositionMetres;
  const v = state.velocityMetresPerSecond;
  const x = state.positionMetres;

  const torricelli = v0 * v0 + 2 * a * (x - x0);
  const averageForm = x0 + 0.5 * (v0 + v) * t;

  // Allow a tiny absolute epsilon for floating-point; identities are exact for
  // the closed-form path so this should be bit-close under normal inputs.
  const eps = 1e-9 * Math.max(1, Math.abs(x), Math.abs(v), Math.abs(a));
  if (Math.abs(v * v - torricelli) > eps) {
    throw new Error(
      `Internal consistency failed (torricelli): v²=${v * v} vs ${torricelli}`
    );
  }
  if (Math.abs(x - averageForm) > eps) {
    throw new Error(
      `Internal consistency failed (average-velocity): x=${x} vs ${averageForm}`
    );
  }
}

function findSegment(
  segments: readonly ResolvedSegment[],
  atSeconds: number
): ResolvedSegment {
  const last = segments[segments.length - 1]!;
  // Inclusive end on the final segment so sampling at the window endpoint works.
  if (atSeconds === last.endSeconds) {
    return last;
  }
  for (const segment of segments) {
    if (atSeconds >= segment.startSeconds && atSeconds < segment.endSeconds) {
      return segment;
    }
  }
  throw new ScienceValidationError(
    "sample-outside-window",
    `Requested time ${atSeconds}s is outside the resolved segment timeline [0, ${last.endSeconds}]`
  );
}

/**
 * Authoritative cart state at an arbitrary requested time.
 *
 * Pure and deterministic: same declaration and time → bit-identical CartState.
 * Renderer frame rate and deltaTime are not inputs.
 */
export function stateAt(declaration: MotionDeclaration, atSeconds: number): CartState {
  if (!Number.isFinite(atSeconds)) {
    throw new ScienceValidationError("non-finite-input", "atSeconds must be a finite number");
  }
  if (atSeconds < 0) {
    throw new ScienceValidationError("negative-time", "atSeconds must be >= 0");
  }

  const window = requireFinite(
    declaration.observationWindowSeconds,
    "observationWindowSeconds"
  );
  if (atSeconds > window) {
    throw new ScienceValidationError(
      "sample-outside-window",
      `Requested time ${atSeconds}s is beyond the observation window of ${window}s`
    );
  }

  const segments = resolveMotion(declaration);
  const segment = findSegment(segments, atSeconds);
  const local = atSeconds - segment.startSeconds;
  const state = evaluateSegmentState(segment, local);
  assertKinematicConsistency(state, segment);
  return state;
}

/** Net force for a resolved single-segment convenience input (for tests/UI). */
export function netForceFor(input: SingleSegmentMotionInput): number {
  return composeNetForce(input.appliedForcesNewtons, input.resistive);
}

/** Acceleration a = Fnet/m for a convenience input. */
export function accelerationFor(input: SingleSegmentMotionInput): number {
  const mass = requireFinite(input.massKilograms, "massKilograms");
  if (mass <= 0) {
    throw new ScienceValidationError(
      "non-positive-mass",
      "massKilograms must be finite and > 0"
    );
  }
  return netForceFor(input) / mass;
}
