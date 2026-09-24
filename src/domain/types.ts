import type { CartState, MotionSample } from "../science/index.js";

/**
 * ============================================================================
 * BOOTSTRAP SKELETON — the full domain contract is GAME-388 (ML-04).
 * ============================================================================
 *
 * ML-02 only needs enough renderer-independent, JSON-safe state to prove the
 * authority flow: engine state -> typed view model -> React/Phaser presentation ->
 * bounded intent -> engine. ML-04 adds measured trials, controlled-variable
 * enforcement, immutable evidence records, comparison sets, replay and scoring.
 *
 * What is deliberately NOT here yet: evidence records, claim/evidence selection,
 * controlled-variable validity, misconception metadata, scoring, replay.
 */

/** The bounded mission phases (docs/PRODUCT.md, session shape). */
export type MissionPhase =
  | "brief"
  | "predict"
  | "design"
  | "run"
  | "record"
  | "compare"
  | "debrief";

export const MISSION_PHASE_ORDER: readonly MissionPhase[] = [
  "brief",
  "predict",
  "design",
  "run",
  "record",
  "compare",
  "debrief",
];

/** The configuration of one trial. Units are SI (docs/SCIENCE_MODEL.md §2). */
export interface TrialConfig {
  readonly cartMassKilograms: number;
  readonly appliedForceNewtons: number;
  readonly initialVelocityMetresPerSecond: number;
  readonly observationWindowSeconds: number;
}

/** Declared bounds for a bootstrap mission's configuration. */
export interface TrialConfigBounds {
  readonly cartMassKilograms: readonly [number, number];
  readonly appliedForceNewtons: readonly [number, number];
  readonly initialVelocityMetresPerSecond: readonly [number, number];
  readonly observationWindowSeconds: readonly [number, number];
}

/** A completed, immutable-by-convention trial record (ML-04 makes this airtight). */
export interface TrialRecord {
  readonly id: string;
  readonly index: number;
  readonly config: TrialConfig;
  readonly samples: readonly MotionSample[];
  readonly finalState: CartState;
}

/** The whole authoritative game state the presentation layers may read. */
export interface MissionState {
  readonly missionId: string;
  readonly phase: MissionPhase;
  readonly prediction: string;
  readonly draft: TrialConfig;
  readonly trials: readonly TrialRecord[];
}
