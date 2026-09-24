import type { CartState, MotionSample } from "./types.js";

/**
 * ============================================================================
 * BOOTSTRAP PLACEHOLDER — NOT THE ML-03 SCIENCE KERNEL. DO NOT CITE AS SCIENCE.
 * ============================================================================
 *
 * GAME-384 (ML-02) is the repository/application foundation. Its acceptance criteria
 * only require that the minimal app boots with a semantic React shell and a real Phaser
 * scene "without science logic in the renderer" — proving the authority boundary works.
 *
 * The real authoritative kernel (net-force composition, `a = Fnet/m`, bounded resistive
 * force, validation, golden traces) is GAME-386 (ML-03). Until that lands, the bootstrap
 * implements exactly ONE case from the frozen model: balanced forces.
 *
 * From docs/SCIENCE_MODEL.md §3: if `Fnet = 0` then `a = 0`, `v(t) = v0` and
 * `x(t) = x0 + v0*t`. A cart moving with balanced forces continues at constant velocity.
 * That is the whole of this placeholder — it makes no claim about unbalanced forces,
 * mass, or how acceleration depends on force.
 *
 * It must not be used in a mission, a scored trial, or a graph. ML-03 replaces it with the
 * general analytical kernel.
 */

/** A declared balanced-force state for the foundation scene (`Fnet = 0`). */
export interface BootstrapMotionDeclaration {
  readonly initialPositionMetres: number;
  readonly velocityMetresPerSecond: number;
}

/**
 * Sample the balanced-force (`Fnet = 0`) case at an exact requested time.
 *
 * Deterministic and pure: the same declaration and time always produce the same state,
 * and no frame rate, delta, or pixel can influence the result. Sampling is at requested
 * timestamps — there is no fixed simulation tick.
 */
export function sampleBootstrapLinearState(
  declaration: BootstrapMotionDeclaration,
  atSeconds: number
): CartState {
  if (!Number.isFinite(atSeconds) || atSeconds < 0) {
    throw new RangeError("atSeconds must be a finite, non-negative number");
  }
  if (!Number.isFinite(declaration.initialPositionMetres)) {
    throw new RangeError("initialPositionMetres must be finite");
  }
  if (!Number.isFinite(declaration.velocityMetresPerSecond)) {
    throw new RangeError("velocityMetresPerSecond must be finite");
  }
  return {
    positionMetres:
      declaration.initialPositionMetres + declaration.velocityMetresPerSecond * atSeconds,
    velocityMetresPerSecond: declaration.velocityMetresPerSecond,
    accelerationMetresPerSecondSquared: 0,
    netForceNewtons: 0,
    elapsedSeconds: atSeconds,
  };
}

/**
 * Sample the bootstrap trajectory at a fixed number of evenly spaced instants.
 *
 * The count and interval are inputs, so the sample set is independent of the renderer.
 */
export function sampleBootstrapTrajectory(
  declaration: BootstrapMotionDeclaration,
  windowSeconds: number,
  sampleCount: number
): readonly MotionSample[] {
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new RangeError("windowSeconds must be a finite, positive number");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new RangeError("sampleCount must be an integer >= 2");
  }
  const step = windowSeconds / (sampleCount - 1);
  return Array.from({ length: sampleCount }, (_, index) => {
    const elapsedSeconds = Number((index * step).toFixed(9));
    return {
      elapsedSeconds,
      state: sampleBootstrapLinearState(declaration, elapsedSeconds),
    };
  });
}
