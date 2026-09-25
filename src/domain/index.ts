/**
 * Motion Lab domain package — the experiment/evidence authority.
 *
 * Boundary contract (ADR 0001, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): nothing in this package may import React,
 * Phaser, the DOM, storage, or the network.
 *
 * GAME-388 (ML-04): the experiment, controlled-variable, trial, measurement,
 * evidence, claim, and replay contracts live here, on top of the ML-03
 * analytical kernel. The authoritative document is docs/EXPERIMENT_MODEL.md.
 * The game state machine (predictions, hints, scoring, debrief) is GAME-394
 * (ML-10) and the canonical mission content is GAME-389 (ML-05).
 */

export type {
  MissionPhase,
  MissionState,
  TrialConfig,
  TrialConfigBounds,
  TrialRecord,
} from "./types.js";
export { MISSION_PHASE_ORDER } from "./types.js";
export type { MissionIntent } from "./intents.js";
export {
  BOOTSTRAP_BOUNDS,
  BOOTSTRAP_CONFIG,
  clampConfig,
  createInitialMissionState,
  createPreviewTrial,
  reduceMission,
} from "./intents.js";

// --- GAME-388 / ML-04: experiment, evidence, and replay contract -------------

export { DomainValidationError, isDomainValidationError } from "./errors.js";
export type { DomainValidationCode } from "./errors.js";

export { DOMAIN_CONTRACT_VERSION, KERNEL_ID } from "./experiment-types.js";
export type {
  ChangeAssessment,
  ChangeValidity,
  Claim,
  ClaimEvaluation,
  ComparisonSet,
  ConfigurationValues,
  ControlledInvestigation,
  EvidenceSelection,
  Measurement,
  MeasurementId,
  MisconceptionId,
  MisconceptionSignal,
  ReplayVerdict,
  TrialEvidence,
  TrialProvenance,
  TrialRequest,
  VariableChange,
  VariableDeclaration,
  VariableId,
  VariableRole,
} from "./experiment-types.js";

export {
  ALL_VARIABLE_IDS,
  VARIABLE_QUANTITY,
  assessTrialChange,
  assertConfigurationWithinBounds,
  assertValidInvestigation,
  configurationValues,
  enforceControlledVariables,
  readVariable,
  withVariable,
} from "./variables.js";

export { canonicalJson, createSeededRandom, digestOf, seededIndex } from "./seed.js";

export { deriveMeasurements, findMeasurement } from "./measurements.js";
export type { DerivedMeasurements } from "./measurements.js";

export {
  buildMotionDeclaration,
  buildTrialId,
  deepFreeze,
  deriveSeededVariant,
  planSampleTimes,
  runTrialEvidence,
} from "./trial.js";
export type { RunTrialInput, SeededVariant, SeededVariantSpace } from "./trial.js";

export {
  authoritativeRebuild,
  isReplayable,
  replayTrialEvidence,
} from "./replay.js";
export type { VerifyOptions } from "./replay.js";

export {
  appendTrialToComparisonSet,
  assessAdmissibility,
  createComparisonSet,
  detectMisconceptions,
  evaluateClaim,
  findTrial,
  withinToleranceBand,
} from "./evidence.js";
export type { CreateComparisonSetInput, TrialAdmissibility } from "./evidence.js";
