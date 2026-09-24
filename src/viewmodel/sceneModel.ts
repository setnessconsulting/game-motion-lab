import {
  RESTING_CART,
  formatQuantity,
  roundForDisplay,
  SI_UNITS,
  type CartState,
  type QuantityId,
} from "../science/index.js";
import type { MissionPhase, MissionState } from "../domain/index.js";

/**
 * The typed view model shared by React and Phaser (ADR 0002).
 *
 * This is the ONLY thing the renderer is allowed to consume. It is:
 *   - read-only and JSON-safe;
 *   - expressed in SI units, never in pixels or screen coordinates, so there is no
 *     pixel-space value that could be mistaken for science; and
 *   - fully derived from authoritative domain state by a pure function.
 *
 * The renderer converts metres to pixels itself, as presentation. Nothing converts
 * pixels back.
 */

export interface SceneReadout {
  readonly id: QuantityId;
  readonly label: string;
  /** Display string, e.g. "1.50 kg". Presentation only (ADR 0004). */
  readonly text: string;
  /** Display-rounded numeric value, for chart-style presentation. Presentation only. */
  readonly displayValue: number;
  readonly unit: string;
}

export interface SceneSamplePoint {
  readonly atSeconds: number;
  readonly positionMetres: number;
}

export interface SceneModel {
  readonly missionId: string;
  readonly phase: MissionPhase;
  readonly track: {
    readonly startMetres: number;
    readonly endMetres: number;
    /** Always stated so direction is never conveyed by colour alone. */
    readonly positiveDirection: "rightward";
  };
  readonly cart: {
    readonly positionMetres: number;
    readonly velocityMetresPerSecond: number;
    readonly netForceNewtons: number;
  };
  readonly forceArrow: {
    readonly newtons: number;
    readonly direction: "positive" | "negative" | "balanced";
    /** Redundant text cue, e.g. "4.0 N to the right" or "balanced (0.0 N)". */
    readonly label: string;
  };
  readonly readouts: readonly SceneReadout[];
  readonly playback: {
    readonly samples: readonly SceneSamplePoint[];
    readonly activeIndex: number;
    readonly running: boolean;
    readonly totalSeconds: number;
  };
  readonly reducedMotion: boolean;
  /** Screen-reader announcement for the current playback state. */
  readonly announcement: string;
}

export interface SceneViewModelInput {
  /** Presentation-only playback clock. It never changes authoritative results. */
  readonly playbackSeconds: number;
  readonly running: boolean;
  readonly reducedMotion: boolean;
}

/** The largest position the track needs to show for the current trial, in metres. */
function trackEndMetres(samples: readonly SceneSamplePoint[]): number {
  const maxPosition = samples.reduce((max, sample) => Math.max(max, sample.positionMetres), 0);
  // Always leave headroom so the cart never sits on the track edge, and never
  // collapse to a zero-length track when the cart does not move.
  return Math.max(1, Math.ceil((maxPosition + 1) * 2) / 2);
}

function describeForce(netForceNewtons: number): SceneModel["forceArrow"] {
  const rounded = roundForDisplay("netForce", netForceNewtons);
  if (rounded === 0) {
    return { newtons: 0, direction: "balanced", label: "balanced (0.0 N)" };
  }
  const direction = rounded > 0 ? "positive" : "negative";
  const word = rounded > 0 ? "to the right" : "to the left";
  return {
    newtons: rounded,
    direction,
    label: `${Math.abs(rounded).toFixed(1)} N ${word}`,
  };
}

function readoutsFor(state: CartState): readonly SceneReadout[] {
  const entries: ReadonlyArray<readonly [QuantityId, string, number]> = [
    ["position", "Position", state.positionMetres],
    ["velocity", "Velocity", state.velocityMetresPerSecond],
    ["acceleration", "Acceleration", state.accelerationMetresPerSecondSquared],
    ["netForce", "Net force", state.netForceNewtons],
    ["time", "Elapsed time", state.elapsedSeconds],
  ];
  return entries.map(([id, label, value]) => ({
    id,
    label,
    text: formatQuantity(id, value),
    displayValue: roundForDisplay(id, value),
    unit: SI_UNITS[id],
  }));
}

/**
 * Project authoritative state into the shared view model. Pure and deterministic.
 *
 * `playbackSeconds` is a presentation clock: it selects which already-computed
 * authoritative sample is shown. It cannot change a sample, a measurement, or a result.
 */
export function toSceneModel(
  state: MissionState,
  input: SceneViewModelInput
): SceneModel {
  const latest = state.trials.length > 0 ? state.trials[state.trials.length - 1] : undefined;
  const samples: readonly SceneSamplePoint[] = (latest?.samples ?? []).map((sample) => ({
    atSeconds: sample.elapsedSeconds,
    positionMetres: sample.state.positionMetres,
  }));

  const totalSeconds = samples.length > 0 ? (samples[samples.length - 1]?.atSeconds ?? 0) : 0;
  const clampedSeconds = Math.min(Math.max(input.playbackSeconds, 0), totalSeconds);

  let activeIndex = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample && sample.atSeconds <= clampedSeconds) activeIndex = index;
  }

  const activeState = latest?.samples[activeIndex]?.state ?? RESTING_CART;

  return {
    missionId: state.missionId,
    phase: state.phase,
    track: {
      startMetres: 0,
      endMetres: trackEndMetres(samples),
      positiveDirection: "rightward",
    },
    cart: {
      positionMetres: activeState.positionMetres,
      velocityMetresPerSecond: activeState.velocityMetresPerSecond,
      netForceNewtons: activeState.netForceNewtons,
    },
    forceArrow: describeForce(activeState.netForceNewtons),
    readouts: readoutsFor(activeState),
    playback: {
      samples,
      activeIndex,
      running: input.running,
      totalSeconds,
    },
    reducedMotion: input.reducedMotion,
    announcement:
      latest === undefined
        ? "No trial has been run yet."
        : `Trial ${latest.index + 1}: at ${formatQuantity("time", activeState.elapsedSeconds)}, ` +
          `position ${formatQuantity("position", activeState.positionMetres)}, ` +
          `velocity ${formatQuantity("velocity", activeState.velocityMetresPerSecond)}.`,
  };
}

/** Read the cart mass readout for a trial configuration (no active sample needed). */
export function massReadout(cartMassKilograms: number): SceneReadout {
  return {
    id: "mass",
    label: "Cart mass",
    text: formatQuantity("mass", cartMassKilograms),
    displayValue: roundForDisplay("mass", cartMassKilograms),
    unit: SI_UNITS.mass,
  };
}
