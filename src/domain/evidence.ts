/**
 * Evidence sets, claim evaluation, and misconception diagnosis
 * (GAME-388 / ML-04).
 *
 * Three rules are enforced here:
 *
 * 1. **Append-only.** A comparison set only grows. Reset and retry allocate a
 *    new trial identity, so a learner can never silently rewrite the record
 *    they are being compared against.
 * 2. **Only replayable evidence is admissible.** Every trial a claim cites is
 *    re-verified against its own provenance first. A record that does not
 *    reproduce can never support a claim.
 * 3. **Unfair comparisons are excluded, not scored.** Trials that changed a
 *    controlled variable, or more than the declared independent variable, are
 *    reported back as excluded with the reason.
 */

import { TOLERANCE_FLOORS, type QuantityId } from "../science/index.js";
import { DomainValidationError } from "./errors.js";
import { findMeasurement } from "./measurements.js";
import { replayTrialEvidence, type VerifyOptions } from "./replay.js";
import type {
  Claim,
  ClaimEvaluation,
  ComparisonSet,
  ControlledInvestigation,
  MisconceptionSignal,
  TrialEvidence,
} from "./experiment-types.js";
import { configurationValues, assessTrialChange } from "./variables.js";

/** Relative band reused from the frozen answer tolerance (contracts/science-conventions.v1.json). */
const RELATIVE_BAND = 0.02;

/**
 * True when two measured values are indistinguishable under the frozen
 * tolerance band. Used to decide whether an observed difference is real, not
 * to redefine any scientific value.
 */
export function withinToleranceBand(
  left: number,
  right: number,
  quantity: QuantityId
): boolean {
  const scale = Math.max(Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= Math.max(RELATIVE_BAND * scale, TOLERANCE_FLOORS[quantity]);
}

export interface CreateComparisonSetInput {
  readonly comparisonSetId: string;
  readonly missionId: string;
  readonly scenarioId: string;
  readonly investigation: ControlledInvestigation;
}

/** Create an empty, frozen comparison set. */
export function createComparisonSet(
  input: CreateComparisonSetInput
): ComparisonSet {
  return Object.freeze({
    comparisonSetId: input.comparisonSetId,
    missionId: input.missionId,
    scenarioId: input.scenarioId,
    investigation: input.investigation,
    trials: Object.freeze([]) as readonly TrialEvidence[],
  });
}

/**
 * Append evidence. Never mutates and never replaces.
 *
 * Re-adding an existing trial identity is a validation error rather than a
 * silent overwrite, which is what keeps reset/retry honest.
 */
export function appendTrialToComparisonSet(
  set: ComparisonSet,
  evidence: TrialEvidence
): ComparisonSet {
  if (evidence.provenance.comparisonSetId !== set.comparisonSetId) {
    throw new DomainValidationError(
      "unknown-trial-reference",
      `Trial ${evidence.provenance.trialId} belongs to comparison set ` +
        `${evidence.provenance.comparisonSetId}, not ${set.comparisonSetId}`
    );
  }
  if (set.trials.some((trial) => trial.provenance.trialId === evidence.provenance.trialId)) {
    throw new DomainValidationError(
      "duplicate-trial-identity",
      `Trial ${evidence.provenance.trialId} already exists in ${set.comparisonSetId}; ` +
        "a retry must allocate a new trial identity rather than rewrite history"
    );
  }
  if (set.trials.some((trial) => trial.provenance.ordinal === evidence.provenance.ordinal)) {
    throw new DomainValidationError(
      "duplicate-trial-identity",
      `Ordinal ${evidence.provenance.ordinal} is already used in ${set.comparisonSetId}`
    );
  }
  return Object.freeze({ ...set, trials: Object.freeze([...set.trials, evidence]) });
}

/** Look up one trial by identity. */
export function findTrial(
  set: ComparisonSet,
  trialId: string
): TrialEvidence | undefined {
  return set.trials.find((trial) => trial.provenance.trialId === trialId);
}

export interface TrialAdmissibility {
  readonly trialId: string;
  readonly admissible: boolean;
  readonly reason: string;
}

/**
 * Decide which of the selected trials form a fair comparison, and why the
 * others were set aside. Verification runs first: an unverified record is
 * never even considered for comparison.
 */
export function assessAdmissibility(
  set: ComparisonSet,
  selectedTrialIds: readonly string[],
  options: VerifyOptions
): readonly TrialAdmissibility[] {
  const selected: TrialEvidence[] = [];
  const verdicts: TrialAdmissibility[] = [];

  for (const trialId of selectedTrialIds) {
    const trial = findTrial(set, trialId);
    if (trial === undefined) {
      verdicts.push({
        trialId,
        admissible: false,
        reason: "not a member of this comparison set",
      });
      continue;
    }
    const replay = replayTrialEvidence(trial, options);
    if (replay.status !== "reproduced") {
      verdicts.push({
        trialId,
        admissible: false,
        reason: `evidence did not reproduce from its provenance (${replay.status})`,
      });
      continue;
    }
    selected.push(trial);
    verdicts.push({ trialId, admissible: true, reason: "verified and reproducible" });
  }

  if (selected.length < 2) return verdicts;

  // The first selected trial in ordinal order is the comparison baseline.
  const ordered = [...selected].sort(
    (left, right) => left.provenance.ordinal - right.provenance.ordinal
  );
  const baseline = ordered[0]!;
  for (const trial of ordered.slice(1)) {
    const assessment = assessTrialChange(
      set.investigation,
      baseline.provenance.configuration,
      trial.provenance.configuration
    );
    if (assessment.validity === "valid") continue;
    const index = verdicts.findIndex(
      (verdict) => verdict.trialId === trial.provenance.trialId
    );
    if (index >= 0) {
      verdicts[index] = {
        trialId: trial.provenance.trialId,
        admissible: false,
        reason: assessment.pedagogy ?? `comparison is ${assessment.validity}`,
      };
    }
  }

  return verdicts;
}

function readMeasurementValue(
  trial: TrialEvidence,
  measurementId: Claim["measurementId"]
): number | undefined {
  return findMeasurement(trial.measurements, measurementId)?.value;
}

function quantityForMeasurement(measurementId: Claim["measurementId"]): QuantityId {
  switch (measurementId) {
    case "finalPosition":
      return "position";
    case "timeToPosition":
      return "time";
    default:
      return "velocity";
  }
}

/**
 * Evaluate a learner's claim against the evidence they selected.
 *
 * The verdict is refused outright when the evidence does not reproduce, which
 * is where "a forged measurement cannot be scored" is actually enforced.
 */
export function evaluateClaim(
  set: ComparisonSet,
  claim: Claim,
  selectedTrialIds: readonly string[],
  options: VerifyOptions
): ClaimEvaluation {
  const excluded: { trialId: string; reason: string }[] = [];

  if (selectedTrialIds.length === 0) {
    return {
      claimId: claim.claimId,
      supported: false,
      reason: "empty-comparison-selection",
      admissibleTrialIds: [],
      excludedTrialIds: [],
      explanation: "No trials were cited, so there is no evidence to support the claim.",
    };
  }

  const admissibility = assessAdmissibility(set, selectedTrialIds, options);
  const admissibleTrialIds: string[] = [];
  for (const verdict of admissibility) {
    if (verdict.admissible) {
      admissibleTrialIds.push(verdict.trialId);
    } else {
      excluded.push({ trialId: verdict.trialId, reason: verdict.reason });
    }
  }

  const unverified = admissibility.filter((verdict) =>
    verdict.reason.includes("did not reproduce")
  );
  if (unverified.length > 0) {
    return {
      claimId: claim.claimId,
      supported: false,
      reason: "unverified-evidence",
      admissibleTrialIds: [],
      excludedTrialIds: excluded,
      explanation:
        "At least one cited trial does not reproduce from its own provenance, " +
        "so it cannot be used as evidence.",
    };
  }

  if (excluded.length > 0) {
    return {
      claimId: claim.claimId,
      supported: false,
      reason: "uncontrolled-comparison",
      admissibleTrialIds: [],
      excludedTrialIds: excluded,
      explanation:
        "The cited trials do not form a controlled comparison: " +
        excluded.map((entry) => `${entry.trialId} (${entry.reason})`).join("; "),
    };
  }

  if (admissibleTrialIds.length < 2) {
    return {
      claimId: claim.claimId,
      supported: false,
      reason: "insufficient-trials",
      admissibleTrialIds,
      excludedTrialIds: excluded,
      explanation:
        "A comparison needs at least two admissible trials; " +
        `${admissibleTrialIds.length} were cited.`,
    };
  }

  const quantity = quantityForMeasurement(claim.measurementId);
  const points = admissibleTrialIds
    .map((trialId) => {
      const trial = findTrial(set, trialId)!;
      return {
        trialId,
        value: readMeasurementValue(trial, claim.measurementId),
        independent: configurationValues(trial.provenance.configuration)[
          set.investigation.independentVariableId
        ],
      };
    })
    .filter(
      (point): point is { trialId: string; value: number; independent: number } =>
        point.value !== undefined
    );

  if (points.length !== admissibleTrialIds.length) {
    return {
      claimId: claim.claimId,
      supported: false,
      reason: "insufficient-trials",
      admissibleTrialIds,
      excludedTrialIds: excluded,
      explanation: "At least one admissible trial does not report the claimed measurement.",
    };
  }

  const ordered = [...points].sort((left, right) => left.independent - right.independent);
  const first = ordered[0]!;
  const last = ordered[ordered.length - 1]!;
  // Compare each later trial against the first. Including the first point in the
  // comparison would ask it to differ from itself, which is never true.
  const later = ordered.slice(1);

  const allEqual = later.every((point) =>
    withinToleranceBand(point.value, first.value, quantity)
  );
  const allGreater = later.every(
    (point) =>
      point.value > first.value && !withinToleranceBand(point.value, first.value, quantity)
  );
  const allLess = later.every(
    (point) =>
      point.value < first.value && !withinToleranceBand(point.value, first.value, quantity)
  );

  const observed =
    claim.relation === "greater-than"
      ? allGreater
      : claim.relation === "less-than"
        ? allLess
        : allEqual;

  const movement =
    claim.relation === "equal-to"
      ? "staying the same"
      : claim.relation === "greater-than"
        ? "increasing"
        : "decreasing";

  return {
    claimId: claim.claimId,
    supported: observed,
    reason: observed ? "supported-by-evidence" : "contradicted-by-evidence",
    admissibleTrialIds,
    excludedTrialIds: excluded,
    explanation: observed
      ? `As ${set.investigation.independentVariableId} increased from ` +
        `${first.independent} to ${last.independent}, ${claim.measurementId} went from ` +
        `${first.value} to ${last.value}, showing it ${movement}.`
      : `As ${set.investigation.independentVariableId} increased from ` +
        `${first.independent} to ${last.independent}, ${claim.measurementId} went from ` +
        `${first.value} to ${last.value}, which does not show it ${movement}.`,
  };
}

function anyBalancedMotionTrial(set: ComparisonSet): TrialEvidence | undefined {
  return set.trials.find((trial) => {
    const { appliedForceNewtons, initialVelocityMetresPerSecond } =
      configurationValues(trial.provenance.configuration);
    return (
      withinToleranceBand(appliedForceNewtons, 0, "force") &&
      Math.abs(initialVelocityMetresPerSecond) > 0
    );
  });
}

function findMassScalingPair(
  set: ComparisonSet
): { lighter: TrialEvidence; heavier: TrialEvidence } | undefined {
  const byForce = new Map<string, TrialEvidence[]>();
  for (const trial of set.trials) {
    const { appliedForceNewtons } = configurationValues(trial.provenance.configuration);
    const key = appliedForceNewtons.toFixed(6);
    byForce.set(key, [...(byForce.get(key) ?? []), trial]);
  }
  for (const group of byForce.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort(
      (left, right) =>
        configurationValues(left.provenance.configuration).cartMassKilograms -
        configurationValues(right.provenance.configuration).cartMassKilograms
    );
    const lighter = sorted[0]!;
    const heavier = sorted[sorted.length - 1]!;
    if (lighter === heavier) continue;
    return { lighter, heavier };
  }
  return undefined;
}

/**
 * Diagnose misconception families directly from the recorded evidence.
 *
 * Every signal names the trials and the observed numbers that produced it, so
 * a debrief can show the learner's own data rather than assert a conclusion.
 */
export function detectMisconceptions(
  set: ComparisonSet,
  options: VerifyOptions
): readonly MisconceptionSignal[] {
  const signals: MisconceptionSignal[] = [];

  const balanced = anyBalancedMotionTrial(set);
  if (balanced !== undefined) {
    const configuration = configurationValues(balanced.provenance.configuration);
    const finalPosition = readMeasurementValue(balanced, "finalPosition");
    const moved = finalPosition !== undefined && Math.abs(finalPosition) > 0;
    const reproduced = replayTrialEvidence(balanced, options).status === "reproduced";
    if (moved && reproduced) {
      signals.push({
        misconceptionId: "balanced-forces-imply-stopped",
        description:
          "Balanced forces were read as 'the cart stays still'. In this trial the net force " +
          "was 0 N and the cart still travelled, because velocity does not change when the " +
          "net force is zero.",
        remediation:
          `Point at the data: with Fnet = 0 N the cart started at ` +
          `${configuration.initialVelocityMetresPerSecond} m/s and ended at ` +
          `${finalPosition} m. Balanced means the velocity stays the same, not that it is zero.`,
        evidenceTrialIds: [balanced.provenance.trialId],
        observed: {
          netForceNewtons: balanced.finalState.netForceNewtons,
          initialVelocityMetresPerSecond: configuration.initialVelocityMetresPerSecond,
          finalPositionMetres: finalPosition,
        },
      });
    }
  }

  const massPair = findMassScalingPair(set);
  if (massPair !== undefined) {
    const lighterMass = configurationValues(massPair.lighter.provenance.configuration)
      .cartMassKilograms;
    const heavierMass = configurationValues(massPair.heavier.provenance.configuration)
      .cartMassKilograms;
    const lighterAcceleration = Math.abs(
      massPair.lighter.finalState.accelerationMetresPerSecondSquared
    );
    const heavierAcceleration = Math.abs(
      massPair.heavier.finalState.accelerationMetresPerSecondSquared
    );
    // The signal fires when the data *contradicts* the intuition, i.e. the
    // heavier cart accelerated less. A heavier cart that really did accelerate
    // faster would mean the intuition was right and there is nothing to fix.
    if (
      heavierAcceleration < lighterAcceleration &&
      !withinToleranceBand(heavierAcceleration, lighterAcceleration, "acceleration")
    ) {
      signals.push({
        misconceptionId: "heavier-cart-accelerates-faster",
        description:
          "A heavier cart was expected to speed up more for the same force. At equal net " +
          "force the heavier cart actually accelerated less, because a = Fnet/m.",
        remediation:
          `Compare the two trials: ${heavierMass} kg produced ` +
          `${heavierAcceleration} m/s^2 while ${lighterMass} kg produced ` +
          `${lighterAcceleration} m/s^2 under the same force. More mass means less ` +
          "acceleration, not more.",
        evidenceTrialIds: [
          massPair.lighter.provenance.trialId,
          massPair.heavier.provenance.trialId,
        ],
        observed: {
          lighterMassKilograms: lighterMass,
          heavierMassKilograms: heavierMass,
          lighterAcceleration,
          heavierAcceleration,
        },
      });
    }
  }

  if (set.trials.length >= 2) {
    const baseline = [...set.trials].sort(
      (left, right) => left.provenance.ordinal - right.provenance.ordinal
    )[0]!;
    for (const trial of [...set.trials].sort(
      (left, right) => left.provenance.ordinal - right.provenance.ordinal
    ).slice(1)) {
      const assessment = assessTrialChange(
        set.investigation,
        baseline.provenance.configuration,
        trial.provenance.configuration
      );
      if (
        assessment.validity === "multiple-variables-changed" ||
        assessment.validity === "controlled-variable-changed"
      ) {
        signals.push({
          misconceptionId: "uncontrolled-comparison",
          description:
            "Two trials were compared even though more than one variable differed between " +
            "them, so the difference cannot be attributed to a single cause.",
          remediation:
            assessment.pedagogy ??
            "Re-run the comparison changing only the independent variable.",
          evidenceTrialIds: [baseline.provenance.trialId, trial.provenance.trialId],
          observed: {
            changedVariableCount: assessment.changes.length,
          },
        });
        break;
      }
    }
  }

  return signals;
}
