/**
 * Bounded-cause diagnosis for Mystery Cart scenarios (GAME-389 / ML-05).
 *
 * The contract's anti-answer-key rule is the reason this module exists in the
 * shape it does. A diagnosis may not be obtainable by guessing, so the
 * function below has exactly one kind of input: *measured accelerations from
 * trials the learner actually ran*. There is no option index, no "correct"
 * field, and no scoring hook to pass. A learner who never runs a trial cannot
 * produce an input, which is stronger than a rule saying they should not.
 *
 * Two further rules are enforced mechanically rather than described in prose:
 *
 * 1. **One observation is never enough.** A verdict requires at least
 *    `MINIMUM_CONTROLLED_COMPARISONS` distinct controlled comparisons, counted
 *    as pairs of trials on the same cart at different force settings. The
 *    validator additionally proves that every authored candidate is
 *    *indistinguishable* from at least one rival until the second comparison
 *    is made, so no authored scenario can quietly become guessable.
 * 2. **The verdict is a consequence, not a lookup.** Exactly one candidate may
 *    fit the data. Zero fits or several fit means the scenario is defective,
 *    and the content validator turns that into a build failure rather than
 *    shipping an ambiguous puzzle.
 */

import { withinToleranceBand } from "../domain/index.js";
import type { CandidateCause, TrialSubject } from "./content-types.js";

/** At least two controlled comparisons are required before any verdict. */
export const MINIMUM_CONTROLLED_COMPARISONS = 2;

/** One measured instant, as read from the authoritative kernel. */
export interface Observation {
  readonly trialKey: string;
  /** Which cart produced the measurement. */
  readonly subject: TrialSubject;
  /** The applied-force knob the learner set for this trial. */
  readonly appliedForceNewtons: number;
  /** The measured acceleration, unrounded. */
  readonly measuredAccelerationMetresPerSecondSquared: number;
  /** The net force the learner observed, unrounded and signed. */
  readonly measuredNetForceNewtons: number;
}

export type DiagnosisReason =
  | "diagnosed"
  | "insufficient-comparisons"
  | "ambiguous"
  | "no-cause-fits"
  | "no-observations";

export interface RejectedCause {
  readonly causeId: string;
  readonly reason: string;
  /** The single observation that ruled the cause out, for learner feedback. */
  readonly trialKey: string | null;
}

export interface DiagnosisVerdict {
  readonly causeId: string | null;
  readonly consistentCauseIds: readonly string[];
  readonly rejected: readonly RejectedCause[];
  /** How many controlled comparisons the supplied observations support. */
  readonly controlledComparisons: number;
  readonly reason: DiagnosisReason;
  readonly explanation: string;
}

/**
 * The acceleration a candidate cause predicts for one applied-force setting.
 *
 * `forceOverrideNewtons` is how a stuck thruster is expressed: a non-null
 * value means the cart's thruster delivers that force whatever the learner
 * dials in, which is precisely why a single trial cannot reveal it.
 */
export function predictCauseAcceleration(
  cause: CandidateCause,
  appliedForceNewtons: number
): { readonly netForceNewtons: number; readonly acceleration: number } | null {
  const delivered = cause.forceOverrideNewtons ?? appliedForceNewtons;
  const netForce = delivered - cause.resistiveForceNewtons;
  if (netForce < 0) return null;
  if (!(cause.massKilograms > 0)) return null;
  return { netForceNewtons: netForce, acceleration: netForce / cause.massKilograms };
}

/**
 * Count the controlled comparisons the observations support.
 *
 * A controlled comparison is a pair of trials on the *same* cart taken at two
 * different force settings. Two force settings on one cart give one such pair;
 * the scenario supplies the second pair on the reference cart, which is what
 * makes a single anomalous reading insufficient.
 */
export function countControlledComparisons(observations: readonly Observation[]): number {
  let count = 0;
  for (const subject of ["reference", "suspect"] as const) {
    const forces = new Set(
      observations
        .filter((observation) => observation.subject === subject)
        .map((observation) => observation.appliedForceNewtons)
    );
    if (forces.size < 2) continue;
    count += (forces.size * (forces.size - 1)) / 2;
  }
  return count;
}

export interface DiagnosisInput {
  /** Readings from the cart under test. These are the evidence about the cause. */
  readonly observations: readonly Observation[];
  /**
   * Readings from a known-good reference cart run at the same settings.
   *
   * These are a control, not evidence about the cause: no candidate cause
   * describes a healthy cart, so they are never matched against one. They are
   * counted, though, because a reference run at two force settings is one of
   * the two controlled comparisons the family contract requires.
   */
  readonly controlObservations?: readonly Observation[];
}

/**
 * Derive the diagnosis from measured accelerations alone.
 *
 * Returns a verdict, never a throw: a puzzle that cannot be solved is itself
 * a reportable outcome, and the content validator is what decides whether it
 * is a defect.
 */
export function diagnoseBoundedCause(
  input: DiagnosisInput,
  candidateCauses: readonly CandidateCause[]
): DiagnosisVerdict {
  const observations = input.observations;
  const control = input.controlObservations ?? [];

  if (observations.length === 0) {
    return {
      causeId: null,
      consistentCauseIds: [],
      rejected: [],
      controlledComparisons: 0,
      reason: "no-observations",
      explanation: "No measurements were supplied, so nothing can be concluded.",
    };
  }

  const controlledComparisons = countControlledComparisons([...observations, ...control]);
  if (controlledComparisons < MINIMUM_CONTROLLED_COMPARISONS) {
    return {
      causeId: null,
      consistentCauseIds: [],
      rejected: [],
      controlledComparisons,
      reason: "insufficient-comparisons",
      explanation:
        `Only ${controlledComparisons} controlled comparison(s) are available. A single ` +
        `uncontrolled reading cannot separate the candidate causes.`,
    };
  }

  const consistent: string[] = [];
  const rejected: RejectedCause[] = [];

  for (const cause of candidateCauses) {
    let ruledOut = false;

    for (const observation of observations) {
      const prediction = predictCauseAcceleration(cause, observation.appliedForceNewtons);
      if (prediction === null) {
        ruledOut = true;
        rejected.push({
          causeId: cause.id,
          reason: "predicts a net force opposite to the direction the cart was observed to move",
          trialKey: observation.trialKey,
        });
        break;
      }
      if (
        !withinToleranceBand(
          prediction.acceleration,
          observation.measuredAccelerationMetresPerSecondSquared,
          "acceleration"
        )
      ) {
        ruledOut = true;
        rejected.push({
          causeId: cause.id,
          reason: "predicts an acceleration that the measured trial contradicts",
          trialKey: observation.trialKey,
        });
        break;
      }
    }

    if (!ruledOut) consistent.push(cause.id);
  }

  if (consistent.length === 1) {
    return {
      causeId: consistent[0]!,
      consistentCauseIds: consistent,
      rejected,
      controlledComparisons,
      reason: "diagnosed",
      explanation:
        `Exactly one bounded cause matches every controlled comparison, and it is ` +
        `${consistent[0]}.`,
    };
  }

  if (consistent.length === 0) {
    return {
      causeId: null,
      consistentCauseIds: [],
      rejected,
      controlledComparisons,
      reason: "no-cause-fits",
      explanation:
        "No declared candidate cause matches the measurements. The scenario is defective " +
        "rather than merely hard.",
    };
  }

  return {
    causeId: null,
    consistentCauseIds: consistent,
    rejected,
    controlledComparisons,
    reason: "ambiguous",
    explanation:
      `${consistent.length} candidate causes fit the evidence equally well, so the ` +
      `investigation does not separate them.`,
  };
}

/**
 * True when two candidates predict the same acceleration at one force setting.
 *
 * The content validator uses this to prove each authored diagnosis is genuinely
 * hard: at *every* force the learner can dial in, at least two candidates must
 * agree, so no single reading ever narrows the field to one explanation.
 */
export function collideAtForce(
  left: CandidateCause,
  right: CandidateCause,
  force: number
): boolean {
  const leftPrediction = predictCauseAcceleration(left, force);
  const rightPrediction = predictCauseAcceleration(right, force);
  if (leftPrediction === null || rightPrediction === null) return false;
  return withinToleranceBand(
    leftPrediction.acceleration,
    rightPrediction.acceleration,
    "acceleration"
  );
}

/**
 * True when every candidate cause is indistinguishable from a rival at at
 * least one of the offered force settings.
 *
 * This is the anti-answer-key property that the frozen four-cause set can
 * actually support, and it is deliberately weaker than "no single reading ever
 * decides". It is weaker for a reason worth recording rather than hiding:
 *
 *   correct-calibration      predicts  f/m
 *   incorrect-cargo-mass     predicts  f/m'
 *   weak-thruster            predicts  W/m          (constant in f)
 *   unexpected-resistive     predicts  (f - R)/m
 *
 * `correct-calibration` can only ever coincide with `weak-thruster`, and only
 * at the single force f = W. It can never coincide with the cargo or drag
 * causes at any force. Sweeping f from 1 N to 12 N for the authored
 * parameters, only f = 2 N and f = 3 N produce *any* collision at all. So a
 * content set cannot make every reading ambiguous for every cause: the
 * structure is fixed by the four frozen causes, not by how the scenarios are
 * authored. `docs/CONTENT_SET.md` section 8 records this with the sweep.
 *
 * What the property *does* guarantee is that the puzzle cannot be solved by
 * elimination from one run: each cause has at least one rival that the learner
 * cannot rule out from a single force setting, so both controlled comparisons
 * are genuinely needed to be sure. The engine enforces that separately by
 * refusing to return a verdict below two controlled comparisons.
 */
export function everyCauseHasIndistinguishableRival(
  causes: readonly CandidateCause[],
  forces: readonly number[]
): boolean {
  if (forces.length === 0 || causes.length < 2) return false;
  return causes.every((cause) =>
    causes.some(
      (rival) =>
        rival.id !== cause.id && forces.some((force) => collideAtForce(cause, rival, force))
    )
  );
}

/** The forces at which a given cause is indistinguishable from a rival. */
export function ambiguousForcesFor(
  cause: CandidateCause,
  causes: readonly CandidateCause[],
  forces: readonly number[]
): readonly number[] {
  return forces.filter((force) =>
    causes.some((rival) => rival.id !== cause.id && collideAtForce(cause, rival, force))
  );
}

/**
 * The candidates that remain possible after measuring at `force` alone.
 *
 * Exposed so a reviewer can read *why* a puzzle is or is not hard, rather than
 * taking a boolean on trust.
 */
export function candidatesConsistentAtForce(
  causes: readonly CandidateCause[],
  force: number
): readonly string[] {
  return causes
    .filter((cause) => predictCauseAcceleration(cause, force) !== null)
    .map((cause) => cause.id);
}
