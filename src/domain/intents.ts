import {
  RESTING_CART,
  sampleTrajectory,
  singleSegmentDeclaration,
} from "../science/index.js";
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
 * This reducer proves the *bounded intent* boundary: the presentation layers may only
 * ask for one of these intents, and the engine decides the new authoritative state.
 *
 * Motion sampling uses the ML-03 analytical kernel (GAME-386). The trial/evidence
 * contract remains GAME-388 (ML-04).
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
 * Applied force is signed and spans the SCIENCE_MODEL applied-force magnitude band
 * including 0 for balanced-force demos. Mass uses the frozen 1–4 kg band.
 */
export const BOOTSTRAP_BOUNDS: TrialConfigBounds = {
  cartMassKilograms: [1.0, 4.0],
  appliedForceNewtons: [-12, 12],
  initialVelocityMetresPerSecond: [-2, 2],
  observationWindowSeconds: [1, 6],
};

/** Default preview remains the balanced-force foundation case (F=0, v0=1.5, t=4 → x=6). */
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

const PREVIEW_SAMPLE_COUNT = 25;

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
      const never: never = intent;
      throw new Error(`Unsupported mission intent: ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Build a preview trial record from the analytical kernel.
 *
 * Samples come from src/science (ML-03). ML-04 replaces this record shape with the
 * real provenance-carrying immutable trial.
 */
export function createPreviewTrial(
  missionId: string,
  index: number,
  config: TrialConfig
): TrialRecord {
  const declaration = singleSegmentDeclaration({
    massKilograms: config.cartMassKilograms,
    initialPositionMetres: 0,
    initialVelocityMetresPerSecond: config.initialVelocityMetresPerSecond,
    appliedForcesNewtons: [config.appliedForceNewtons],
    observationWindowSeconds: config.observationWindowSeconds,
  });
  const samples = sampleTrajectory(declaration, PREVIEW_SAMPLE_COUNT);
  const last = samples[samples.length - 1];
  return {
    id: `${missionId}-t${index + 1}`,
    index,
    config,
    samples,
    finalState: last ? last.state : RESTING_CART,
  };
}
