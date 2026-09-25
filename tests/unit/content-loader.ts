/**
 * Loading and re-running the canonical content set for tests.
 *
 * Everything the content tests need comes from the *real* checked-in data and
 * the *real* kernel, never from a copy made inside a test. That is the whole
 * point: the content gate is only worth something if the numbers it checks are
 * the numbers the science kernel actually produces.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sampleAtTimes, singleSegmentDeclaration, type MotionDeclaration } from "../../src/science/index.js";
import {
  ALL_VARIABLE_IDS,
  digestOf,
  deriveMeasurements,
  runTrialEvidence,
  type ControlledInvestigation,
} from "../../src/domain/index.js";
import type { ScenarioFile, ScenarioGoldenTrace, ScenarioTrial } from "../../src/content/index.js";
import type { SampleSummary, TrialEvidenceSummary } from "../../src/content/index.js";

const ROOT = process.cwd();
const SCENARIO_DIR = join(ROOT, "src/content/scenarios");
const GOLDEN_DIR = join(ROOT, "src/content/golden");

export const FROZEN_PROVENANCE_SCHEMA: unknown = JSON.parse(
  readFileSync(join(ROOT, "contracts/scenario-provenance.schema.json"), "utf8")
);

export const FROZEN_FAMILY_CONTRACT = JSON.parse(
  readFileSync(join(ROOT, "contracts/mission-families.v1.json"), "utf8")
) as {
  families: readonly {
    id: string;
    name: string;
    difficultyLevels: readonly string[];
    misconceptions: readonly string[];
    graphRequirement: { level: string; graphs: readonly string[] };
  }[];
  graphInterpretationRequirement: { satisfiedBy: string };
  contentRules: readonly string[];
};

function jsonFiles(dir: string, suffix: string): readonly string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(suffix))
    .sort()
    .map((name) => join(dir, name));
}

/** Every authored scenario, in stable id order. */
export const SCENARIOS: readonly ScenarioFile[] = jsonFiles(SCENARIO_DIR, ".provenance.json").map(
  (path) => JSON.parse(readFileSync(path, "utf8")) as ScenarioFile
);

/** Every authored golden trace, keyed by scenario id. */
export const GOLDENS: ReadonlyMap<string, ScenarioGoldenTrace> = new Map(
  jsonFiles(GOLDEN_DIR, ".trace.json").map((path) => {
    const trace = JSON.parse(readFileSync(path, "utf8")) as ScenarioGoldenTrace;
    return [trace.scenarioId, trace];
  })
);

/** The investigation a trial ran under, as a real ML-04 object. */
function investigationFor(scenario: ScenarioFile): ControlledInvestigation {
  return scenario.design.investigation;
}

/** The kernel declaration for a trial, preferring the golden's explicit one. */
function declarationFor(trial: ScenarioTrial, golden: ScenarioGoldenTrace): MotionDeclaration {
  const explicit = golden.trials.find((entry) => entry.trialKey === trial.trialKey)
    ?.kernelDeclaration;
  if (explicit !== undefined) {
    return {
      observationWindowSeconds: Number(explicit["observationWindowSeconds"]),
      segments: (explicit["segments"] as MotionDeclaration["segments"]).map((segment) => ({
        ...segment,
        appliedForcesNewtons: [...segment.appliedForcesNewtons],
      })),
    };
  }
  return singleSegmentDeclaration({
    massKilograms: trial.configuration.cartMassKilograms,
    initialPositionMetres: 0,
    initialVelocityMetresPerSecond: trial.configuration.initialVelocityMetresPerSecond,
    appliedForcesNewtons: [...trial.appliedForcesNewtons],
    observationWindowSeconds: trial.configuration.observationWindowSeconds,
  });
}

function sampleTimesFor(trial: ScenarioTrial): readonly number[] {
  const span = trial.configuration.observationWindowSeconds;
  return Array.from({ length: trial.sampleCount }, (_, index) =>
    Number(((index * span) / (trial.sampleCount - 1)).toFixed(9))
  );
}

/** The exact sample timestamps the ML-04 runner would request. */
export function plannedSampleTimes(trial: ScenarioTrial): readonly number[] {
  return sampleTimesFor(trial);
}

export interface ExecutedTrial {
  readonly trial: ScenarioTrial;
  readonly samples: readonly SampleSummary[];
  readonly measurements: readonly {
    id: string;
    quantity: string;
    value: number;
    targetMetres?: number;
  }[];
  readonly unreachedTargetsMetres: readonly number[];
  readonly samplesDigest: string;
  readonly netForceNewtons: number;
  readonly acceleration: number;
  /** True when ML-04's own trial runner produced these numbers. */
  readonly reproducedByMl04: boolean;
  /** True when the run matched the authored golden's samples digest. */
  readonly digestMatchesGolden: boolean;
}

/**
 * Run one authored trial for real.
 *
 * The ML-04 trial runner is used wherever it can express the trial, and the
 * result is compared against the same kernel call made directly. When they
 * disagree the flag is false, which is how a drift between the experiment
 * layer and the science layer becomes a test failure rather than a surprise.
 */
export function executeTrial(scenario: ScenarioFile, trial: ScenarioTrial): ExecutedTrial {
  const golden = GOLDENS.get(scenario.manifest.scenarioId);
  if (golden === undefined) throw new Error(`no golden for ${scenario.manifest.scenarioId}`);

  const declaration = declarationFor(trial, golden);
  const times = sampleTimesFor(trial);
  const samples = sampleAtTimes(declaration, times);
  const derived = deriveMeasurements(declaration, samples, trial.positionTargetsMetres);
  const last = samples[samples.length - 1]!;
  const samplesDigest = digestOf(samples);

  // True only when ML-04's own trial runner was used *and* agreed bit for bit.
  // A trial carrying an explicit kernel declaration cannot go through that
  // runner at all, because ML-04's TrialConfig has no resistive variable.
  const explicit = golden.trials.find((entry) => entry.trialKey === trial.trialKey)?.kernelDeclaration;
  let reproducedByMl04: boolean;
  if (explicit === undefined) {
    try {
      const evidence = runTrialEvidence({
        missionId: "content-gate",
        scenarioId: scenario.manifest.scenarioId,
        comparisonSetId: `${scenario.manifest.scenarioId}-gate`,
        trialId: "content-gate/0",
        ordinal: 0,
        variantSeed: scenario.manifest.seed ?? 0,
        investigation: investigationFor(scenario),
        request: {
          configuration: trial.configuration,
          sampleCount: trial.sampleCount,
          positionTargetsMetres: trial.positionTargetsMetres,
        },
      });
      // The parity claim is exact: the experiment layer's sampled trajectory
      // must be bit-identical to the direct kernel call for the same inputs.
      reproducedByMl04 = digestOf(evidence.samples) === samplesDigest;
    } catch {
      reproducedByMl04 = false;
    }
  } else {
    reproducedByMl04 = false;
  }

  return {
    trial,
    samples: samples.map((sample) => ({
      elapsedSeconds: sample.state.elapsedSeconds,
      positionMetres: sample.state.positionMetres,
      velocityMetresPerSecond: sample.state.velocityMetresPerSecond,
      accelerationMetresPerSecondSquared: sample.state.accelerationMetresPerSecondSquared,
      netForceNewtons: sample.state.netForceNewtons,
    })),
    measurements: derived.measurements.map((entry) => ({
      id: entry.id,
      quantity: entry.quantity,
      value: entry.value,
      ...(entry.targetMetres === undefined ? {} : { targetMetres: entry.targetMetres }),
    })),
    unreachedTargetsMetres: [...derived.unreachedPositionTargetsMetres],
    samplesDigest,
    netForceNewtons: last.state.netForceNewtons,
    acceleration: last.state.accelerationMetresPerSecondSquared,
    reproducedByMl04,
    digestMatchesGolden:
      golden.trials.find((entry) => entry.trialKey === trial.trialKey)?.expectedSamplesDigest ===
      samplesDigest,
  };
}

/** Execute every trial of every scenario. */
export function executeContentSet(): ReadonlyMap<string, readonly ExecutedTrial[]> {
  const map = new Map<string, ExecutedTrial[]>();
  for (const scenario of SCENARIOS) {
    map.set(
      scenario.manifest.scenarioId,
      scenario.design.trials.map((trial) => executeTrial(scenario, trial))
    );
  }
  return map;
}

/** The validator's evidence view, built from real runs. */
export function evidenceSummaries(): ReadonlyMap<string, readonly TrialEvidenceSummary[]> {
  const executed = executeContentSet();
  const map = new Map<string, TrialEvidenceSummary[]>();
  for (const [scenarioId, trials] of executed) {
    map.set(
      scenarioId,
      trials.map((entry) => ({
        trialKey: entry.trial.trialKey,
        subject: entry.trial.subject,
        appliedForceNewtons: entry.trial.configuration.appliedForceNewtons,
        netForceNewtonsOfTrial: entry.netForceNewtons,
        accelerationOfTrial: entry.acceleration,
        producedBy: entry.reproducedByMl04
          ? ("ml-04-trial-runner" as const)
          : ("ml-03-kernel-direct" as const),
        samples: entry.samples,
        measurements: entry.measurements.map((m) => ({
          id: m.id,
          quantity: m.quantity,
          value: m.value,
        })),
        unreachedTargetsMetres: entry.unreachedTargetsMetres,
        digestMatchesGolden: entry.digestMatchesGolden,
      }))
    );
  }
  return map;
}

/** Resolve a provenance `expectedTraces` reference against the real files. */
export function resolveTraceReference(reference: string): readonly string[] | null {
  const [file, fragment] = reference.split("#");
  if (file === undefined || fragment === undefined) return null;
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, file), "utf8")) as {
      id?: string;
      scenarioId?: string;
    };
    const resolved = parsed.id ?? parsed.scenarioId;
    return resolved === fragment ? [resolved] : null;
  } catch {
    return null;
  }
}

export { ALL_VARIABLE_IDS };
