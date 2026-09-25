import { RESTING_CART, roundForDisplay, type CartState } from "../science/index.js";
import type { MissionPhase, MissionState } from "../domain/index.js";
import {
  DIRECTION_CONVENTION,
  directionWords,
  findReading,
  measuredReadingsFor,
  type InstrumentReading,
} from "./instruments.js";

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

/**
 * A reading as the renderer and the DOM both consume it (GAME-391 / ML-07).
 *
 * This is now the instrument type itself rather than a parallel shape, so there is one
 * definition of what an instrument reading is and the animated view cannot show something the
 * accessible readouts do not have.
 */
export type SceneReadout = InstrumentReading;

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
    readonly positiveDirection: typeof DIRECTION_CONVENTION.positive;
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
  /**
   * How the positive direction is written on the laboratory axis.
   *
   * Carried in the model rather than inlined in the renderer so the axis and the force labels
   * cannot state the direction differently — and so the renderer keeps no runtime dependency on
   * the view-model package, which it currently consumes as types only.
   */
  readonly directionAxis: string;
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
  // Both the direction word and the arrow label come from the one convention (ML-07 AC5).
  const { direction, label } = directionWords(netForceNewtons);
  return { newtons: roundForDisplay("netForce", netForceNewtons), direction, label };
}

function readoutsFor(state: CartState): readonly SceneReadout[] {
  return measuredReadingsFor(state);
}

/**
 * Project authoritative state into the shared view model. Pure and deterministic.
 *
 * `playbackSeconds` is a presentation clock: it selects which already-computed
 * authoritative sample is shown. It cannot change a sample, a measurement, or a result.
 */
/** The instrument text for one reading id, or an empty string when it is absent. */
function readingText(readings: readonly SceneReadout[], id: string): string {
  return findReading(readings, id)?.text ?? "";
}

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
  const readouts = readoutsFor(activeState);

  return {
    missionId: state.missionId,
    phase: state.phase,
    track: {
      startMetres: 0,
      endMetres: trackEndMetres(samples),
      positiveDirection: DIRECTION_CONVENTION.positive,
    },
    cart: {
      positionMetres: activeState.positionMetres,
      velocityMetresPerSecond: activeState.velocityMetresPerSecond,
      netForceNewtons: activeState.netForceNewtons,
    },
    forceArrow: describeForce(activeState.netForceNewtons),
    readouts,
    directionAxis: DIRECTION_CONVENTION.axis,
    playback: {
      samples,
      activeIndex,
      running: input.running,
      totalSeconds,
    },
    reducedMotion: input.reducedMotion,
    // Built from the same readings the instruments show, so an announcement cannot disagree
    // with the numbers on screen.
    announcement:
      latest === undefined
        ? "No trial has been run yet."
        : `Trial ${latest.index + 1}: at ${readingText(readouts, "time")}, ` +
          `position ${readingText(readouts, "position")}, ` +
          `velocity ${readingText(readouts, "velocity")}.`,
  };
}
