/**
 * ============================================================================
 * Canonical mission content contract (GAME-389 / ML-05).
 * ============================================================================
 *
 * These types are JSON-safe and renderer-independent. They describe the
 * *shape* of the canonical v1 content set; the data itself lives as JSON under
 * ./scenarios and ./golden so a reviewer can diff it without reading code.
 *
 * Two structural rules are encoded here rather than left to convention:
 *
 * 1. **A scenario file is an envelope, not a bare manifest.** The frozen
 *    provenance schema (contracts/scenario-provenance.schema.json) sets
 *    `additionalProperties: false`, so the machine-readable manifest has to be
 *    a self-contained object. The envelope therefore carries the manifest
 *    under `manifest` and the *design* beside it: the ML-04 controlled
 *    investigation, the ordered trials, and (for diagnosis scenarios) the
 *    bounded candidate causes. The validator applies the frozen schema to
 *    `manifest` exactly as written.
 *
 * 2. **The content set never carries its own answer key.** Nothing in a
 *    scenario file names the "correct" cause, the right option index, or any
 *    other reveal. The diagnosis engine *derives* the cause from measured
 *    accelerations (see ./diagnosis.ts). A scenario that stored the answer
 *    would be shipping a guessable mission.
 */

import type { CartState } from "../science/index.js";
import type { ControlledInvestigation, TrialConfig } from "../domain/index.js";

/** The four v1 mission families, frozen by GAME-383. */
export type FamilyId =
  | "calibration-run"
  | "thruster-test"
  | "cargo-load-test"
  | "mystery-cart";

/** The bounded, frozen difficulty ladder. */
export type DifficultyLevel =
  | "guided"
  | "supported"
  | "independent"
  | "diagnosis"
  | "evidence-challenge";

/** The bounded review states a scenario may declare. */
export type ReviewStatus = "unreviewed" | "in-review" | "reviewed" | "changes-required";

/** Graph kinds the content layer may require. */
export type GraphKind = "position-time" | "velocity-time";

/** Which graph burden a scenario places on the learner. */
export type GraphRequirementLevel = "none" | "optional" | "required";

/** The bounded vocabulary of science concepts a scenario may teach. */
export type ScienceConcept =
  | "balanced-force"
  | "unbalanced-force"
  | "net-force"
  | "mass"
  | "position"
  | "elapsed-time"
  | "velocity"
  | "acceleration"
  | "controlled-investigation"
  | "proportional-reasoning"
  | "inverse-proportional-reasoning"
  | "resistive-force"
  | "graph-interpretation"
  | "evidence-from-multiple-trials";

/** The frozen governing-equation identifiers a scenario may cite. */
export type GoverningEquationId =
  | "net-force-composition"
  | "newton-second-law"
  | "velocity-time"
  | "position-time"
  | "balanced-forces";

/**
 * The provenance manifest, typed to mirror
 * `contracts/scenario-provenance.schema.json`.
 *
 * Every field is declared because the schema marks the object closed. The
 * optional ones (`variantOf`, `seed`, `reviewDate`, `referenceBasis`,
 * `answerKeyBounded`) are modelled as explicit `| null` or optional so that
 * "absent" and "present but empty" stay distinguishable during validation.
 */
export interface ScenarioManifest {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly familyId: FamilyId;
  readonly variantOf?: string | null;
  readonly seed?: number | null;
  readonly title: string;
  readonly targetStandard: "NGSS MS-PS2-2";
  readonly scienceConcepts: readonly ScienceConcept[];
  readonly independentVariable: string;
  readonly dependentVariable: string;
  readonly controlledVariables: readonly string[];
  readonly units: ScenarioUnits;
  readonly initialConditions: ScenarioInitialConditions;
  readonly expectedRelationship: {
    readonly statement: string;
    readonly governingEquations: readonly GoverningEquationId[];
  };
  readonly acceptedEvidence: readonly string[];
  readonly misconceptions: readonly MisconceptionEntry[];
  readonly debriefExplanation: string;
  readonly reviewStatus: ReviewStatus;
  readonly reviewer: string | null;
  readonly reviewDate?: string | null;
  readonly referenceBasis?: readonly string[] | null;
  readonly answerTolerance: {
    readonly relative: number;
    readonly absoluteSource: "science-conventions.v1.json:quantity.toleranceFloor";
  };
  readonly expectedTraces: readonly string[];
  readonly difficultyLevel: DifficultyLevel;
  readonly graphRequirement: {
    readonly level: GraphRequirementLevel;
    readonly graphs: readonly GraphKind[];
  };
  readonly answerKeyBounded?: boolean;
}

/** SI units a scenario declares, one per scientific quantity. */
export interface ScenarioUnits {
  readonly mass: "kg";
  readonly force: "N";
  readonly position: "m";
  readonly time: "s";
  readonly velocity: "m/s";
  readonly acceleration: "m/s^2";
  readonly netForce?: "N";
}

/** The declared starting state and declared applied forces. */
export interface ScenarioInitialConditions {
  readonly positionMetres: number;
  readonly velocityMetresPerSecond: number;
  readonly appliedForcesNewtons: readonly number[];
  readonly resistiveForceNewtons?: number | null;
  readonly observationWindowSeconds?: number;
  readonly cartMassKilograms?: number;
}

/** One authored misconception and the remediation written for it. */
export interface MisconceptionEntry {
  readonly id: string;
  readonly statement: string;
  readonly remediation: string;
}

/** Which cart produced a trial. Used only by bounded diagnosis scenarios. */
export type TrialSubject = "reference" | "suspect";

/** The role a trial plays inside its scenario's assessed comparison. */
export type TrialRole = "baseline" | "comparison";

/**
 * One authored trial.
 *
 * `configuration` is the exact ML-04 `TrialConfig` the kernel is given, and
 * `appliedForcesNewtons` is the physical, collinear force list the scenario
 * narrative describes. They are related by a signed sum; the content validator
 * refuses any scenario where they disagree, because that is how a scenario
 * would end up describing one net force and running another.
 *
 * `hidden` marks a force or mass the learner is not told about (a mystery-cart
 * cause). It is a content-authoring annotation: the learner-facing projection
 * in ./projections.ts must never surface it, and a test proves it does not.
 */
export interface ScenarioTrial {
  readonly trialKey: string;
  readonly label: string;
  readonly role: TrialRole;
  readonly subject: TrialSubject;
  readonly configuration: TrialConfig;
  readonly appliedForcesNewtons: readonly number[];
  readonly resistiveForceNewtons: number | null;
  readonly sampleCount: number;
  readonly positionTargetsMetres: readonly number[];
  /** Mass actually loaded, when it differs from the declared nominal mass. */
  readonly hiddenMassKilograms?: number | null;
  /**
   * True when a bounded cause alters what the bench actually delivered, so
   * the declared force list and the measured net force are *meant* to differ.
   *
   * The validator enforces that only Mystery Cart suspect trials may set it,
   * and that such a trial always measures strictly less net force than was
   * declared. That is what keeps "the declared forces must sum to the measured
   * net force" a real rule everywhere else.
   */
  readonly hiddenCause: boolean;
}

/**
 * One bounded candidate cause for a diagnosis scenario.
 *
 * The cause is a *model of the subject cart*: the learner has measured
 * accelerations, and each candidate predicts them from a different
 * (mass, force, resistive) triple. Exactly one candidate may fit the data.
 */
export interface CandidateCause {
  readonly id: string;
  readonly label: string;
  readonly explanation: string;
  /** The cart's true mass, which may differ from the declared nominal mass. */
  readonly massKilograms: number;
  /**
   * A stuck thruster delivers this force whatever the learner dials in;
   * `null` means the cart honours the applied-force knob. This is what makes
   * a weak-thruster cause invisible to a single trial.
   */
  readonly forceOverrideNewtons: number | null;
  /** A hidden resistive force, opposing the observed direction of motion. */
  readonly resistiveForceNewtons: number;
}

/** The designed side of a scenario: what the learner actually runs. */
export interface ScenarioDesign {
  readonly investigation: ControlledInvestigation;
  readonly trials: readonly ScenarioTrial[];
  readonly candidateCauses?: readonly CandidateCause[];
}

/** One authored scenario, as checked into ./scenarios. */
export interface ScenarioFile {
  readonly schemaVersion: 1;
  readonly manifest: ScenarioManifest;
  readonly design: ScenarioDesign;
}

/** The whole canonical v1 content set. */
export interface ContentSet {
  readonly schemaVersion: 1;
  readonly scenarios: readonly ScenarioFile[];
}

/** A family definition, mirroring contracts/mission-families.v1.json. */
export interface FamilyDefinition {
  readonly id: FamilyId;
  readonly name: string;
  readonly primaryConcept: string;
  readonly scienceQuestion: string;
  readonly independentVariable: string;
  readonly dependentVariable: string;
  readonly controlledVariables: readonly string[];
  readonly expectedRelationship: string;
  readonly requiredEvidence: string;
  readonly misconceptions: readonly string[];
  readonly difficultyLevels: readonly DifficultyLevel[];
  readonly graphRequirement: {
    readonly level: GraphRequirementLevel;
    readonly graphs: readonly GraphKind[];
    readonly note: string;
  };
  readonly answerKeyBounded: boolean;
}

/** One expected measurement in a golden trace. */
export interface ExpectedMeasurement {
  readonly id: string;
  readonly value: number;
  readonly targetMetres?: number;
}

/**
 * One trial's expected authoritative outcome.
 *
 * `expectedSamplesDigest` is a digest over the *whole* sampled trajectory, so
 * the golden pins every instant rather than only the endpoints. A reviewer can
 * recompute it from the declaration alone.
 */
export interface GoldenTrialExpectation {
  readonly trialKey: string;
  readonly ordinal: number;
  readonly variantSeed: number;
  readonly expectedMeasurements: readonly ExpectedMeasurement[];
  readonly expectedUnreachedTargetsMetres: readonly number[];
  readonly expectedSamplesDigest: string;
  readonly expectedFinalState: CartState;
  /** Exact kernel declaration, for the rare trial ML-04 cannot express. */
  readonly kernelDeclaration?: Record<string, unknown>;
}

/** What the content expects the ML-04 change assessment to report. */
export interface GoldenComparisonExpectation {
  readonly baselineTrialKey: string;
  readonly candidateTrialKey: string;
  readonly validity: "valid" | "unchanged" | "multiple-variables-changed" | "controlled-variable-changed";
  readonly changedVariableIds: readonly string[];
  readonly controlledViolations: readonly string[];
}

/** What the diagnosis engine is expected to conclude from the real numbers. */
export interface GoldenDiagnosisExpectation {
  readonly causeId: string;
  readonly controlledComparisons: number;
  readonly rejectedCauseIds: readonly string[];
}

/**
 * The golden trace for one scenario.
 *
 * This is the test-only half of the content set: it records what the science
 * *must* produce, so a future change to the kernel or the domain that alters a
 * canonical answer fails loudly. It is never imported by the application, and
 * a test proves the shipped module graph cannot reach it.
 */
export interface ScenarioGoldenTrace {
  readonly schemaVersion: 1;
  readonly scenarioId: string;
  readonly familyId: FamilyId;
  readonly rationale: string;
  readonly trials: readonly GoldenTrialExpectation[];
  readonly comparisons: readonly GoldenComparisonExpectation[];
  readonly diagnosis?: GoldenDiagnosisExpectation;
  /** Misconception ids the real evidence must trigger, with their trials. */
  readonly expectedMisconceptions: readonly {
    readonly misconceptionId: string;
    readonly trialKeys: readonly string[];
  }[];
}

/** A single machine-readable content problem. */
export interface ContentDefect {
  readonly code: ContentDefectCode;
  readonly scenarioId: string;
  readonly path: string;
  readonly message: string;
}

/** The closed set of content defect codes the validator can raise. */
export type ContentDefectCode =
  | "schema-invalid"
  | "duplicate-scenario-id"
  | "unknown-family-id"
  | "difficulty-not-offered-by-family"
  | "graph-requirement-exceeds-family"
  | "graph-requirement-unmet-by-family"
  | "graph-interpretation-uncovered"
  | "family-has-no-scenarios"
  | "misconception-uncovered"
  | "value-outside-frozen-band"
  | "value-not-a-whole-newton"
  | "net-force-declaration-mismatch"
  | "non-finite-value"
  | "value-on-display-rounding-boundary"
  | "display-round-trip-unsafe"
  | "position-off-track"
  | "unfair-assessed-comparison"
  | "evidence-coverage-too-thin"
  | "expected-trace-unresolved"
  | "expected-trace-mismatch"
  | "ambiguous-diagnosis"
  | "diagnosis-without-candidates"
  | "guessable-answer-key"
  | "reading-complexity-too-high"
  | "misconfigured-investigation"
  | "unreadable-scenario-file"
  | "unreviewed-for-release";
