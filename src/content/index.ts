/**
 * Motion Lab content package — the canonical v1 science/content authority.
 *
 * Boundary contract (ADR 0001, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): nothing in this package may import
 * React, Phaser, the DOM, storage, or the network. It may import the ML-03
 * science types and the ML-04 domain types, and nothing else from the app.
 *
 * GAME-389 (ML-05): the canonical mission content set, the provenance
 * manifest contract, the content validator, the bounded-cause diagnosis
 * engine, the reading-complexity metrics, and the learner-facing
 * projections. The authoritative document is docs/CONTENT_SET.md; the frozen
 * family and schema contracts it implements live in contracts/ and
 * docs/MISSIONS.md.
 *
 * The authored data itself is JSON under ./scenarios and ./golden so a
 * reviewer can diff it without reading TypeScript. This package must stay
 * unreachable from the application entry point: the golden traces contain
 * the expected answers, and a test asserts the shipped module graph cannot
 * reach them.
 */

export { CONTENT_CONTRACT_VERSION, FAMILY_IDS, FAMILY_DEFINITIONS, findFamily, familyOffersDifficulty, graphSeverity } from "./families.js";

export type {
  CandidateCause,
  ContentDefect,
  ContentDefectCode,
  ContentSet,
  DifficultyLevel,
  ExpectedMeasurement,
  FamilyId,
  GoldenComparisonExpectation,
  GoldenDiagnosisExpectation,
  GoldenTrialExpectation,
  GoverningEquationId,
  GraphKind,
  GraphRequirementLevel,
  MisconceptionEntry,
  ReviewStatus,
  ScenarioDesign,
  ScenarioFile,
  ScenarioGoldenTrace,
  ScenarioInitialConditions,
  ScenarioManifest,
  ScenarioTrial,
  ScenarioUnits,
  ScienceConcept,
  TrialRole,
  TrialSubject,
} from "./content-types.js";

export {
  AUTHORED_BANDS,
  DISPLAY_BOUNDARY_EPSILON,
  hasAtMostDecimals,
  isDisplayRoundTripSafe,
  isOnDisplayRoundingBoundary,
  isWholeNumber,
} from "./bands.js";

export { validateAgainstSchema } from "./schema-validator.js";
export type { SchemaViolation } from "./schema-validator.js";

export {
  READABILITY_TARGET,
  countSyllables,
  findReadabilityBreaches,
  measureReadability,
  splitSentences,
  tokeniseWords,
} from "./readability.js";
export type { ReadabilityBreach, ReadabilityMetrics } from "./readability.js";

export {
  MINIMUM_CONTROLLED_COMPARISONS,
  ambiguousForcesFor,
  candidatesConsistentAtForce,
  collideAtForce,
  countControlledComparisons,
  diagnoseBoundedCause,
  everyCauseHasIndistinguishableRival,
  predictCauseAcceleration,
} from "./diagnosis.js";
export type { DiagnosisReason, DiagnosisVerdict, Observation, RejectedCause } from "./diagnosis.js";

export {
  toLearnerCauseOptions,
  toLearnerResultView,
  toLearnerTrialView,
} from "./projections.js";
export type { LearnerCauseOption, LearnerResultView, LearnerTrialView } from "./projections.js";

export { validateContentSet } from "./validator.js";

export type {
  ContentValidationInput,
  MeasurementSummary,
  SampleSummary,
  TraceReferenceResolver,
  TrialEvidenceSummary,
} from "./validation-input.js";

export {
  assertReleaseReady,
  findReleaseBlockers,
  isReleaseReady,
  releaseReadyScenarioIds,
} from "./release-gate.js";
export type { ReleaseBlocker } from "./release-gate.js";
