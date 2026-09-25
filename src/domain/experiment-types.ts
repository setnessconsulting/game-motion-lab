/**
 * ============================================================================
 * Experiment / evidence domain contract (GAME-388 / ML-04).
 * ============================================================================
 *
 * These types are JSON-safe, renderer-independent, and frozen-by-reference:
 * they implement docs/EXPERIMENT_MODEL.md on top of the ML-03 analytical
 * kernel in src/science (docs/SCIENCE_MODEL.md).
 *
 * Two structural rules are enforced here rather than by convention:
 *
 * 1. **Measurements are outputs, never inputs.** No intent, request, or
 *    presentation-facing type in this file carries a measured value. A caller
 *    declares *what to run*; the domain derives *what was measured* from the
 *    kernel. That is the structural reason the presentation layer cannot forge
 *    a measurement that scoring will accept.
 *
 * 2. **Provenance is total.** Every recorded trial carries enough to
 *    reconstruct the authoritative run bit-for-bit, so replay is a real
 *    re-execution rather than a replay of stored numbers.
 */

import type {
  CartState,
  MotionDeclaration,
  MotionSample,
  QuantityId,
} from "../science/index.js";
import type { TrialConfig } from "./types.js";

/** Machine-readable identity of the domain contract that wrote a record. */
export const DOMAIN_CONTRACT_VERSION = "motion-lab.experiment-model/1.0.0";

/** Machine-readable identity of the science kernel that produced a trajectory. */
export const KERNEL_ID = "ml-03-analytical-1d/1.0.0";

/**
 * The v1 experiment variables. Deliberately a closed union: an undeclared knob
 * cannot be introduced without a contract decision, which keeps the
 * controlled-variable analysis total.
 */
export type VariableId =
  | "cartMassKilograms"
  | "appliedForceNewtons"
  | "initialVelocityMetresPerSecond"
  | "observationWindowSeconds";

/** The scientific role a variable plays in a controlled investigation. */
export type VariableRole = "independent" | "dependent" | "controlled";

/** A declared, learner-visible knob with frozen bounds. */
export interface VariableDeclaration {
  readonly id: VariableId;
  /** The scientific quantity this variable controls (SI units). */
  readonly quantity: QuantityId;
  readonly role: VariableRole;
  readonly bounds: readonly [number, number];
  /** Increment a learner may apply; must be > 0. */
  readonly step: number;
  readonly learnerAdjustable: boolean;
  /** Learner-facing name. Presentation copy, never used in any comparison. */
  readonly label: string;
}

/** Read one variable's value out of a configuration. */
export type ConfigurationValues = Readonly<Record<VariableId, number>>;

/** The complete declaration of a controlled investigation. */
export interface ControlledInvestigation {
  readonly investigationId: string;
  /** The single variable that is allowed to change between compared trials. */
  readonly independentVariableId: VariableId;
  /** Variables whose derived measurement is the evidence of the investigation. */
  readonly dependentVariableIds: readonly VariableId[];
  /** Variables that must be identical across every compared trial. */
  readonly controlledVariableIds: readonly VariableId[];
  readonly declaredVariables: readonly VariableDeclaration[];
}

/** Why a candidate configuration is or is not a fair comparison. */
export type ChangeValidity =
  /** Exactly the declared independent variable changed. */
  | "valid"
  /** Nothing changed at all. */
  | "unchanged"
  /** Two or more variables changed at once, so no single cause is isolated. */
  | "multiple-variables-changed"
  /** A controlled variable changed on its own, without the independent one. */
  | "controlled-variable-changed";

/** One observed difference between a baseline and a candidate configuration. */
export interface VariableChange {
  readonly variableId: VariableId;
  readonly from: number;
  readonly to: number;
  readonly role: VariableRole;
}

/** The result of comparing a candidate configuration against a baseline. */
export interface ChangeAssessment {
  readonly validity: ChangeValidity;
  readonly changes: readonly VariableChange[];
  readonly independentChanged: boolean;
  /** Controlled variables that moved. Any entry invalidates the comparison. */
  readonly controlledViolations: readonly VariableId[];
  /**
   * Learner-facing explanation when the comparison is not valid, otherwise
   * null. Surfacing this is the "pedagogically surfaced" half of the
   * controlled-investigation rule; `enforceControlledVariables` is the
   * "prevented" half.
   */
  readonly pedagogy: string | null;
}

/** The derived measurements a trial may report. */
export type MeasurementId =
  | "finalPosition"
  | "finalVelocity"
  | "averageVelocity"
  | "maxSpeed"
  | "timeToPosition";

/**
 * One authoritative derived measurement. `value` is the unrounded
 * authoritative number; rounding is presentation-only and lives in
 * src/science/units.ts (ADR 0004).
 */
export interface Measurement {
  readonly id: MeasurementId;
  /** Scientific quantity, for units and tolerance lookup. */
  readonly quantity: QuantityId;
  /** Authoritative value. Never a rounded display value. */
  readonly value: number;
  /** For time-of-arrival measurements, the position that was targeted. */
  readonly targetMetres?: number;
  /** Human-readable derivation, so a science reviewer can check the formula. */
  readonly derivation: string;
}

/**
 * What a caller asks the domain to run. Contains configuration and sampling
 * intent only — never a measured value.
 */
export interface TrialRequest {
  readonly configuration: TrialConfig;
  /** Number of evenly spaced samples across the declared observation span. */
  readonly sampleCount: number;
  /** Optional position markers, used only to derive time-to-position. */
  readonly positionTargetsMetres?: readonly number[];
}

/**
 * Everything needed to reconstruct the authoritative run. A reviewer can read
 * this record alone and re-derive every number in it.
 */
export interface TrialProvenance {
  readonly missionId: string;
  readonly scenarioId: string;
  readonly comparisonSetId: string;
  readonly trialId: string;
  /** Position in the comparison set. Reset/retry allocates a new ordinal. */
  readonly ordinal: number;
  /** The seeded variant selector. It chooses *what to run*, never a result. */
  readonly variantSeed: number;
  /** The exact configuration the kernel was given. */
  readonly configuration: TrialConfig;
  /** The exact motion declaration passed to the kernel. */
  readonly motionDeclaration: MotionDeclaration;
  /** The exact sample timestamps requested from the kernel. */
  readonly sampleTimesSeconds: readonly number[];
  /** The exact position markers requested, in the order requested. */
  readonly positionTargetsMetres: readonly number[];
  /** Units frozen at run time so the record is self-describing. */
  readonly quantityUnits: Readonly<Record<QuantityId, string>>;
  readonly kernelId: string;
  readonly domainContractVersion: string;
}

/**
 * A completed, immutable evidence record. Produced only by the domain from a
 * `TrialRequest`; no other package constructs one.
 */
export interface TrialEvidence {
  readonly provenance: TrialProvenance;
  readonly samples: readonly MotionSample[];
  readonly finalState: CartState;
  readonly measurements: readonly Measurement[];
  /** Requested position markers never reached inside the observation span. */
  readonly unreachedPositionTargetsMetres: readonly number[];
  /**
   * Integrity digest binding the stored samples and measurements to the
   * provenance. See docs/EXPERIMENT_MODEL.md section 7 for exactly what this
   * does and does not guarantee.
   */
  readonly integrityDigest: string;
}

/** An append-only, ordered set of evidence records under one investigation. */
export interface ComparisonSet {
  readonly comparisonSetId: string;
  readonly missionId: string;
  readonly scenarioId: string;
  readonly investigation: ControlledInvestigation;
  readonly trials: readonly TrialEvidence[];
}

/** The trial identifiers a learner cites in support of a claim. */
export interface EvidenceSelection {
  readonly measurementId: MeasurementId;
  readonly trialIds: readonly string[];
}

/** A learner's claim about what the evidence shows. */
export interface Claim {
  readonly claimId: string;
  readonly text: string;
  readonly measurementId: MeasurementId;
  /** How the claimed value relates to the measured evidence. */
  readonly relation: "greater-than" | "less-than" | "equal-to";
  /** The variable the claim asserts explains the difference. */
  readonly attributedVariableId: VariableId | null;
}

/** The verdict on a claim, given the evidence the learner selected. */
export interface ClaimEvaluation {
  readonly claimId: string;
  readonly supported: boolean;
  /** Machine-readable basis for the verdict. */
  readonly reason:
    | "supported-by-evidence"
    | "contradicted-by-evidence"
    | "insufficient-trials"
    | "unverified-evidence"
    | "unknown-trial-reference"
    | "uncontrolled-comparison"
    | "empty-comparison-selection";
  /** Trials that were admissible. */
  readonly admissibleTrialIds: readonly string[];
  /** Trials excluded from the comparison, with the reason. */
  readonly excludedTrialIds: readonly { readonly trialId: string; readonly reason: string }[];
  readonly explanation: string;
}

/** The misconception families the domain can diagnose from real evidence. */
export type MisconceptionId =
  | "balanced-forces-imply-stopped"
  | "heavier-cart-accelerates-faster"
  | "uncontrolled-comparison";

/** A misconception the evidence contradicts or exposes, with remediation. */
export interface MisconceptionSignal {
  readonly misconceptionId: MisconceptionId;
  readonly description: string;
  readonly remediation: string;
  /** Trial identifiers whose real data drove the diagnosis. */
  readonly evidenceTrialIds: readonly string[];
  /** The observed numbers that contradict the misconception. */
  readonly observed: Readonly<Record<string, number>>;
}

/** The outcome of reconstructing an evidence record from its provenance. */
export interface ReplayVerdict {
  readonly trialId: string;
  readonly status: "reproduced" | "trajectory-divergent" | "digest-mismatch";
  /** First differing field path, when the replay did not reproduce. */
  readonly divergencePath: string | null;
  readonly detail: string;
}
