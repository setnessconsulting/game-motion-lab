/**
 * Learner-visible projections of authored content (GAME-389 / ML-05).
 *
 * A content file is not a display surface, and a display surface is not a
 * content file. This module is the only sanctioned way content becomes
 * something a learner can read, and it is written as a *whitelist* rather
 * than a filter: a field that nobody thought about is absent by construction,
 * not absent by accident.
 *
 * The fields deliberately withheld are the ones that would give the puzzle
 * away — which cart produced a trial, and a hidden mass. The Mystery Cart
 * anti-answer-key rule (docs/MISSIONS.md section 4) is satisfied structurally
 * only if no such field can reach the interface, and a test asserts that a
 * reference trial and a suspect trial taken at identical settings project to
 * byte-identical numbers.
 *
 * This module is also the boundary the "content never enters the renderer"
 * rule depends on: it returns JSON-safe plain objects, never a node, a
 * component, or a pixel value.
 */

import type { ScenarioFile, ScenarioTrial } from "./content-types.js";

/** What a learner may read about a trial before it has run. */
export interface LearnerTrialView {
  readonly trialKey: string;
  readonly label: string;
  readonly role: ScenarioTrial["role"];
  /** The applied-force knob the learner set. */
  readonly declaredForceNewtons: number;
  /** The mass dial the learner set, which may be the cart's true mass. */
  readonly declaredMassKilograms: number;
  /** The starting speed. */
  readonly declaredInitialVelocityMetresPerSecond: number;
  /** The observation span, in seconds. */
  readonly declaredObservationSpanSeconds: number;
  /** The collinear forces the bench applies, as declared. */
  readonly appliedForcesNewtons: readonly number[];
  readonly positionTargetsMetres: readonly number[];
}

/**
 * Project one authored trial for display.
 *
 * Note what is absent: `subject` (which cart it was) and
 * `hiddenMassKilograms` (the mass the learner has not discovered). Neither
 * has a code path into the view, so neither can leak.
 */
export function toLearnerTrialView(trial: ScenarioTrial): LearnerTrialView {
  return {
    trialKey: trial.trialKey,
    label: trial.label,
    role: trial.role,
    declaredForceNewtons: trial.configuration.appliedForceNewtons,
    declaredMassKilograms: trial.configuration.cartMassKilograms,
    declaredInitialVelocityMetresPerSecond: trial.configuration.initialVelocityMetresPerSecond,
    declaredObservationSpanSeconds: trial.configuration.observationWindowSeconds,
    appliedForcesNewtons: [...trial.appliedForcesNewtons],
    positionTargetsMetres: [...trial.positionTargetsMetres],
  };
}

/** One cause a learner may choose between, in the order the UI may show them. */
export interface LearnerCauseOption {
  readonly id: string;
  readonly label: string;
  readonly explanation: string;
}

/**
 * Project the bounded candidate causes.
 *
 * The option order is the authored order and is not sorted or rotated by this
 * function. Making the true cause land in a fixed position would be an answer
 * key, so the content author must vary order across scenarios; a test asserts
 * that no single position dominates the set.
 */
export function toLearnerCauseOptions(scenario: ScenarioFile): readonly LearnerCauseOption[] {
  const causes = scenario.design.candidateCauses ?? [];
  return causes.map((cause) => ({
    id: cause.id,
    label: cause.label,
    explanation: cause.explanation,
  }));
}

/**
 * The numbers a learner may read about a trial *after* it has run.
 *
 * Values are passed through unrounded. Formatting is presentation-only
 * (ADR 0004), and it happens in the view model, never here.
 */
export interface LearnerResultView {
  readonly trialKey: string;
  readonly finalPositionMetres: number;
  readonly finalVelocityMetresPerSecond: number;
  readonly accelerationMetresPerSecondSquared: number;
  readonly netForceNewtons: number;
  readonly elapsedSeconds: number;
}

export function toLearnerResultView(
  trialKey: string,
  state: {
    readonly positionMetres: number;
    readonly velocityMetresPerSecond: number;
    readonly accelerationMetresPerSecondSquared: number;
    readonly netForceNewtons: number;
    readonly elapsedSeconds: number;
  }
): LearnerResultView {
  return {
    trialKey,
    finalPositionMetres: state.positionMetres,
    finalVelocityMetresPerSecond: state.velocityMetresPerSecond,
    accelerationMetresPerSecondSquared: state.accelerationMetresPerSecondSquared,
    netForceNewtons: state.netForceNewtons,
    elapsedSeconds: state.elapsedSeconds,
  };
}
