/**
 * The inputs the content validator needs, and the guarantees about them.
 *
 * The validator never reads a file, never runs the kernel, and never touches
 * the DOM. Everything it reasons about arrives through this one file, which
 * keeps it a pure function and makes it usable from a test, a content
 * pipeline, or a future build step without change.
 *
 * The `evidence` map is the important part. Content validation claims that a
 * scenario's expected outputs are backed by real science; the only honest way
 * to make that claim is to hand the validator numbers the *kernel* produced,
 * not numbers an author typed. The test suite therefore runs ML-03/ML-04 for
 * every authored trial and passes the results in here, and the validator
 * checks those numbers against the frozen bands, the display rule, and the
 * authored declarations.
 */

import type { DiagnosisVerdict } from "./diagnosis.js";
import type { FamilyDefinition, ScenarioFile, ScenarioGoldenTrace, TrialSubject } from "./content-types.js";

/** One authoritative sample, as produced by ML-03. */
export interface SampleSummary {
  readonly elapsedSeconds: number;
  readonly positionMetres: number;
  readonly velocityMetresPerSecond: number;
  readonly accelerationMetresPerSecondSquared: number;
  readonly netForceNewtons: number;
}

/** One derived measurement, as produced by ML-04. */
export interface MeasurementSummary {
  readonly id: string;
  readonly quantity: string;
  readonly value: number;
}

/**
 * Everything the validator needs to know about one *actually executed* trial.
 */
export interface TrialEvidenceSummary {
  readonly trialKey: string;
  readonly subject: TrialSubject;
  /** The applied-force knob the learner set for this trial. */
  readonly appliedForceNewtons: number;
  /** How the numbers were produced, recorded so the provenance is honest. */
  readonly producedBy: "ml-04-trial-runner" | "ml-03-kernel-direct";
  /** The signed net force the kernel composed for this trial. */
  readonly netForceNewtonsOfTrial: number;
  /** The signed acceleration the kernel reported for this trial. */
  readonly accelerationOfTrial: number;
  readonly samples: readonly SampleSummary[];
  readonly measurements: readonly MeasurementSummary[];
  readonly unreachedTargetsMetres: readonly number[];
  /** True when the evidence carries a verbatim copy of the golden's digest. */
  readonly digestMatchesGolden: boolean;
}

/**
 * Resolves a provenance `expectedTraces` reference.
 *
 * Returns the identifiers the reference points at, or `null` when it does not
 * resolve. Implemented by the caller, because only the caller knows about the
 * file system.
 */
export type TraceReferenceResolver = (reference: string) => readonly string[] | null;

export interface ContentValidationInput {
  /** The parsed frozen provenance schema. */
  readonly schema: unknown;
  readonly families: readonly FamilyDefinition[];
  readonly scenarios: readonly ScenarioFile[];
  /** Golden trace per scenario id. */
  readonly traces: ReadonlyMap<string, ScenarioGoldenTrace>;
  /** Executed evidence per scenario id. */
  readonly evidence: ReadonlyMap<string, readonly TrialEvidenceSummary[]>;
  /** The diagnosis verdict per diagnosis scenario id. */
  readonly diagnoses: ReadonlyMap<string, DiagnosisVerdict>;
  readonly resolveTrace: TraceReferenceResolver;
}
