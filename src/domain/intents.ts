import { RESTING_CART, sampleBootstrapTrajectory } from "../science/index.js";
import {
  MISSION_PHASE_ORDER,
  type MissionPhase,
  type MissionState,
  type TrialConfig,
  type TrialConfigBounds,
  type TrialRecord,
} from "./types.js";

/**
 * ============================================================================
 * BOOTSTRAP SKELETON — the full state machine is GAME-394 (ML-10).
 * ============================================================================
 *
 * This reducer exists so the foundation can prove the *bounded intent* boundary: the
 * presentation layers may only ask for one of these intents, and the engine decides
 * what the new authoritative state is. A renderer cannot set a position, a measurement,
 * a phase, or a score directly.
 *
 * Only the balanced-force case (`Fnet = 0`) is sampled in this milestone; the general
 * analytical kernel is GAME-386 (ML-03) and the trial/evidence contract is GAME-388
 * (ML-04).
 */

/** The complete, closed set of things the presentation layers may request. */
export type MissionIntent =
  | { readonly kind: "set-draft"; readonly patch: Partial<TrialConfig> }
  | { readonly kind: "set-prediction"; readonly text: string }
  | { readonly kind: "advance-phase" }
  | { readonly kind: "begin-preview-trial" }
  | { readonly kind: "reset-session" };

/**
 * Declared bounds for the bootstrap preview.
 *
 * `appliedForceNewtons` is pinned to 0 in this milestone: unbalanced motion needs the
 * ML-03 kernel, and inventing a relationship here would be exactly the kind of
 * unreviewed science the contract forbids.
 */
export const BOOTSTRAP_BOUNDS: TrialConfigBounds = {
  cartMassKilograms: [1.0, 4.0],
  appliedForceNewtons: [0, 0],
  initialVelocityMetresPerSecond: [-2, 2],
  observationWindowSeconds: [1, 6],
};

export const BOOTSTRAP_CONFIG: TrialConfig = {
  cartMassKilograms: 2,
  appliedForceNewtons: 0,
  initialVelocityMetresPerSecond: 1.5,
  observationWindowSeconds: 4,
};

function clampToBounds(value: number, [min, max]: readonly [number, number]): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp a drafted configuration into the declared bounds. Never trusts the caller. */
export function clampConfig(config: TrialConfig): TrialConfig {
  return {
    cartMassKilograms: clampToBounds(
      config.cartMassKilograms,
      BOOTSTRAP_BOUNDS.cartMassKilograms
    ),
    appliedForceNewtons: clampToBounds(
      config.appliedForceNewtons,
      BOOTSTRAP_BOUNDS.appliedForceNewtons
    ),
    initialVelocityMetresPerSecond: clampToBounds(
      config.initialVelocityMetresPerSecond,
      BOOTSTRAP_BOUNDS.initialVelocityMetresPerSecond
    ),
    observationWindowSeconds: clampToBounds(
      config.observationWindowSeconds,
      BOOTSTRAP_BOUNDS.observationWindowSeconds
    ),
  };
}

export function createInitialMissionState(missionId: string): MissionState {
  return {
    missionId,
    phase: "brief",
    prediction: "",
    draft: BOOTSTRAP_CONFIG,
    trials: [],
  };
}

function nextPhase(phase: MissionPhase): MissionPhase {
  const index = MISSION_PHASE_ORDER.indexOf(phase);
  if (index < 0 || index === MISSION_PHASE_ORDER.length - 1) return phase;
  return MISSION_PHASE_ORDER[index + 1] as MissionPhase;
}

const BOOTSTRAP_SAMPLE_COUNT = 25;

/**
 * Apply one bounded intent. Pure and deterministic: no clock, no randomness, no
 * renderer input. The same state and intent always yield the same new state.
 */
export function reduceMission(state: MissionState, intent: MissionIntent): MissionState {
  switch (intent.kind) {
    case "set-draft": {
      if (state.phase === "run") return state;
      return { ...state, draft: clampConfig({ ...state.draft, ...intent.patch }) };
    }
    case "set-prediction": {
      return { ...state, prediction: intent.text };
    }
    case "advance-phase": {
      return { ...state, phase: nextPhase(state.phase) };
    }
    case "begin-preview-trial": {
      const config = clampConfig(state.draft);
      const trial = createPreviewTrial(state.missionId, state.trials.length, config);
      return { ...state, phase: "run", trials: [...state.trials, trial] };
    }
    case "reset-session": {
      return createInitialMissionState(state.missionId);
    }
    default: {
      // Exhaustive: an unknown intent is a programming error, not a silent no-op.
      const never: never = intent;
      throw new Error(`Unsupported mission intent: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Build a preview trial record from the balanced-force placeholder.
 *
 * The samples come from src/science/bootstrap-motion.ts (the `Fnet = 0` case only).
 * ML-03 replaces the sampler; ML-04 replaces this record shape with the real,
 * provenance-carrying immutable trial.
 */
export function createPreviewTrial(
  missionId: string,
  index: number,
  config: TrialConfig
): TrialRecord {
  const samples = sampleBootstrapTrajectory(
    {
      initialPositionMetres: 0,
      velocityMetresPerSecond: config.initialVelocityMetresPerSecond,
    },
    config.observationWindowSeconds,
    BOOTSTRAP_SAMPLE_COUNT
  );
  const last = samples[samples.length - 1];
  return {
    id: `${missionId}-t${index + 1}`,
    index,
    config,
    samples,
    finalState: last ? last.state : RESTING_CART,
  };
}
