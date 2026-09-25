/**
 * Immutable trial evidence (GAME-388 / ML-04).
 *
 * A trial record is the unit of evidence in Motion Lab. It is produced here,
 * and only here, from a declarative `TrialRequest` plus the ML-03 kernel. The
 * record is deep-frozen, carries total provenance, and binds its own contents
 * with a deterministic digest so a later replay can prove the numbers still
 * follow from the declaration.
 *
 * Reset and retry never rewrite history: a retry allocates a new ordinal and a
 * new trial identity, leaving the earlier record in the comparison set intact.
 */

import {
  SI_UNITS,
  sampleAtTimes,
  singleSegmentDeclaration,
  type MotionDeclaration,
  type MotionSample,
  type QuantityId,
} from "../science/index.js";
import { DomainValidationError } from "./errors.js";
import { deriveMeasurements } from "./measurements.js";
import {
  DOMAIN_CONTRACT_VERSION,
  KERNEL_ID,
  type ControlledInvestigation,
  type TrialEvidence,
  type TrialProvenance,
  type TrialRequest,
} from "./experiment-types.js";
import { createSeededRandom, digestOf, seededIndex } from "./seed.js";
import type { TrialConfig } from "./types.js";
import { assertConfigurationWithinBounds, withVariable, ALL_VARIABLE_IDS } from "./variables.js";
import type { VariableId } from "./experiment-types.js";

/** Recursively freeze a JSON-safe value so a record cannot be edited in place. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const entry of Object.values(value as Record<string, unknown>)) {
    deepFreeze(entry);
  }
  return value;
}

/** Deterministic trial identity. Never random, never reused. */
export function buildTrialId(
  missionId: string,
  comparisonSetId: string,
  ordinal: number
): string {
  return `${missionId}/${comparisonSetId}/trial-${ordinal}`;
}

/**
 * The sampling plan: evenly spaced instants across the observation span,
 * including both endpoints.
 *
 * Mirrors the kernel's own sampling rule so that a domain-planned run and a
 * kernel-sampled run request identical timestamps. `tests/unit/
 * experiment-domain.test.ts` asserts that parity rather than trusting it.
 */
export function planSampleTimes(
  observationSpanSeconds: number,
  sampleCount: number
): readonly number[] {
  if (!Number.isInteger(sampleCount) || sampleCount < 2) {
    throw new DomainValidationError(
      "configuration-out-of-bounds",
      `sampleCount must be an integer of at least 2; received ${sampleCount}`
    );
  }
  const step = observationSpanSeconds / (sampleCount - 1);
  return Object.freeze(
    Array.from({ length: sampleCount }, (_, index) => Number((index * step).toFixed(9)))
  );
}

/** Build the exact motion declaration the kernel will receive. */
export function buildMotionDeclaration(configuration: TrialConfig) {
  return singleSegmentDeclaration({
    massKilograms: configuration.cartMassKilograms,
    initialPositionMetres: 0,
    initialVelocityMetresPerSecond: configuration.initialVelocityMetresPerSecond,
    appliedForcesNewtons: [configuration.appliedForceNewtons],
    observationWindowSeconds: configuration.observationWindowSeconds,
  });
}

/**
 * The same declaration with absent optional fields removed.
 *
 * The kernel's convenience builder always writes the optional `resistive` key,
 * even when no resistive force is declared, so the object it returns carries a
 * property whose value is `undefined`. That is not a JSON value: a record
 * holding it would not survive a JSON round trip unchanged, which would put
 * AC1 ("domain state is JSON-safe") at the mercy of an incidental property.
 * Omitting the key is behaviourally identical, because the kernel reads an
 * absent resistive declaration as "no resistive force".
 */
export function toJsonSafeDeclaration(
  declaration: MotionDeclaration
): MotionDeclaration {
  return {
    observationWindowSeconds: declaration.observationWindowSeconds,
    segments: declaration.segments.map((segment) =>
      segment.resistive === undefined
        ? {
            massKilograms: segment.massKilograms,
            initialPositionMetres: segment.initialPositionMetres,
            initialVelocityMetresPerSecond: segment.initialVelocityMetresPerSecond,
            appliedForcesNewtons: [...segment.appliedForcesNewtons],
            forceModel: segment.forceModel,
            durationSeconds: segment.durationSeconds,
          }
        : {
            massKilograms: segment.massKilograms,
            initialPositionMetres: segment.initialPositionMetres,
            initialVelocityMetresPerSecond: segment.initialVelocityMetresPerSecond,
            appliedForcesNewtons: [...segment.appliedForcesNewtons],
            resistive: { ...segment.resistive },
            forceModel: segment.forceModel,
            durationSeconds: segment.durationSeconds,
          }
    ),
  };
}

const ALL_QUANTITIES: readonly QuantityId[] = [
  "mass",
  "force",
  "netForce",
  "position",
  "time",
  "velocity",
  "acceleration",
];

function unitsSnapshot(): Readonly<Record<QuantityId, string>> {
  const snapshot: Partial<Record<QuantityId, string>> = {};
  for (const quantity of ALL_QUANTITIES) {
    snapshot[quantity] = SI_UNITS[quantity];
  }
  return Object.freeze(snapshot as Record<QuantityId, string>);
}

export interface RunTrialInput {
  readonly missionId: string;
  readonly scenarioId: string;
  readonly comparisonSetId: string;
  readonly trialId: string;
  readonly ordinal: number;
  readonly variantSeed: number;
  /** Used to validate the configuration before the kernel is called. */
  readonly investigation: ControlledInvestigation;
  readonly request: TrialRequest;
}

/**
 * Run one trial and return its immutable evidence record.
 *
 * Pure and deterministic: the same input always produces a bit-identical
 * record, including the digest. `variantSeed` is recorded for provenance and
 * selects the configuration upstream; it is never an input to the physics,
 * because by the time the kernel is reached it sees plain numbers only.
 */
export function runTrialEvidence(input: RunTrialInput): TrialEvidence {
  const { configuration, sampleCount } = input.request;
  if (configuration.observationWindowSeconds <= 0) {
    throw new DomainValidationError(
      "configuration-out-of-bounds",
      "observationWindowSeconds must be greater than zero for a trial to be sampled"
    );
  }
  assertConfigurationWithinBounds(input.investigation, configuration);

  const motionDeclaration = buildMotionDeclaration(configuration);
  const sampleTimesSeconds = planSampleTimes(
    configuration.observationWindowSeconds,
    sampleCount
  );
  const positionTargetsMetres = Object.freeze([
    ...(input.request.positionTargetsMetres ?? []),
  ]);
  const samples: readonly MotionSample[] = sampleAtTimes(motionDeclaration, sampleTimesSeconds);
  const last = samples[samples.length - 1];
  if (last === undefined) {
    throw new DomainValidationError(
      "configuration-out-of-bounds",
      "A planned trial must produce at least one authoritative sample"
    );
  }

  const derived = deriveMeasurements(motionDeclaration, samples, positionTargetsMetres);

  const provenance: TrialProvenance = deepFreeze({
    missionId: input.missionId,
    scenarioId: input.scenarioId,
    comparisonSetId: input.comparisonSetId,
    trialId: input.trialId,
    ordinal: input.ordinal,
    variantSeed: input.variantSeed,
    configuration,
    motionDeclaration: toJsonSafeDeclaration(motionDeclaration),
    sampleTimesSeconds,
    positionTargetsMetres,
    quantityUnits: unitsSnapshot(),
    kernelId: KERNEL_ID,
    domainContractVersion: DOMAIN_CONTRACT_VERSION,
  });

  const body = {
    provenance,
    samples,
    finalState: last.state,
    measurements: derived.measurements,
    unreachedPositionTargetsMetres: derived.unreachedPositionTargetsMetres,
  } as const;

  return deepFreeze({
    ...body,
    integrityDigest: digestOf(body),
  });
}

export interface SeededVariantSpace {
  /** The variables a seeded variant may choose, with their candidate values. */
  readonly candidates: Readonly<Partial<Record<VariableId, readonly number[]>>>;
}

export interface SeededVariant {
  readonly configuration: TrialConfig;
  /** The candidate index chosen for each varying variable. */
  readonly chosenIndices: Readonly<Record<string, number>>;
}

/**
 * Derive a seeded variant configuration.
 *
 * The seed selects *what to run*; it never alters a result. Two different
 * seeds that resolve to the same configuration produce identical evidence,
 * which `tests/unit/experiment-domain.test.ts` asserts directly.
 */
export function deriveSeededVariant(
  base: TrialConfig,
  seed: number,
  space: SeededVariantSpace
): SeededVariant {
  const random = createSeededRandom(seed);
  let configuration = base;
  const chosenIndices: Record<string, number> = {};

  // Iterate the closed variable order rather than Object.entries so the draw
  // sequence depends only on the declared space, never on key insertion order.
  for (const variableId of ALL_VARIABLE_IDS) {
    const values = space.candidates[variableId];
    if (values === undefined || values.length === 0) continue;
    const index = seededIndex(random, values.length);
    chosenIndices[variableId] = index;
    configuration = withVariable(configuration, variableId, values[index]!);
  }

  return { configuration, chosenIndices: Object.freeze(chosenIndices) };
}
