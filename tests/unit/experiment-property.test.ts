import { describe, expect, it } from "vitest";
import {
  ALL_VARIABLE_IDS,
  appendTrialToComparisonSet,
  assessTrialChange,
  buildTrialId,
  canonicalJson,
  createComparisonSet,
  createSeededRandom,
  deriveSeededVariant,
  replayTrialEvidence,
  runTrialEvidence,
  type ControlledInvestigation,
  type TrialConfig,
  type VariableId,
} from "../../src/domain/index.js";

/**
 * Property / invariant tests for the experiment layer (GAME-388).
 *
 * Draws stay inside the frozen SCIENCE_MODEL value bands. As in the kernel's
 * own property tests, randomness lives only in this harness: the domain's
 * seeded generator is exercised as a subject, never used to make a scientific
 * result vary.
 */

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand: () => number, min: number, max: number, step: number): number {
  const steps = Math.round((max - min) / step);
  return min + Math.round(rand() * steps) * step;
}

const BOUNDS: Record<VariableId, { bounds: readonly [number, number]; step: number }> = {
  cartMassKilograms: { bounds: [1, 4], step: 0.5 },
  appliedForceNewtons: { bounds: [-12, 12], step: 1 },
  initialVelocityMetresPerSecond: { bounds: [-2, 2], step: 0.5 },
  observationWindowSeconds: { bounds: [1, 6], step: 0.5 },
};

function investigation(independent: VariableId): ControlledInvestigation {
  return {
    investigationId: `investigation-${independent}`,
    independentVariableId: independent,
    dependentVariableIds: [independent],
    controlledVariableIds: ALL_VARIABLE_IDS.filter((id) => id !== independent),
    declaredVariables: ALL_VARIABLE_IDS.map((id) => ({
      id,
      quantity:
        id === "cartMassKilograms"
          ? ("mass" as const)
          : id === "appliedForceNewtons"
            ? ("force" as const)
            : id === "initialVelocityMetresPerSecond"
              ? ("velocity" as const)
              : ("time" as const),
      role: id === independent ? ("independent" as const) : ("controlled" as const),
      bounds: BOUNDS[id].bounds,
      step: BOUNDS[id].step,
      learnerAdjustable: true,
      label: id,
    })),
  };
}

function randomConfig(rand: () => number): TrialConfig {
  return {
    cartMassKilograms: pick(rand, 1, 4, 0.5),
    appliedForceNewtons: pick(rand, -12, 12, 1),
    initialVelocityMetresPerSecond: pick(rand, -2, 2, 0.5),
    observationWindowSeconds: pick(rand, 1, 6, 0.5),
  };
}

/** A configuration that cannot reverse mid-segment for the given force. */
function safeConfig(rand: () => number): TrialConfig {
  const config = randomConfig(rand);
  const acceleration = config.appliedForceNewtons / config.cartMassKilograms;
  if (acceleration !== 0 && config.initialVelocityMetresPerSecond !== 0) {
    // v0 opposing a would trip the kernel's reversal guard, which is correct
    // behaviour but not what this property is about.
    return {
      ...config,
      initialVelocityMetresPerSecond:
        Math.sign(acceleration) * Math.abs(config.initialVelocityMetresPerSecond),
    };
  }
  return config;
}

describe("evidence is JSON-safe and deterministic across bounded draws", () => {
  const rand = mulberry32(0x4d4c3034); // "ML04"

  it("round-trips through JSON and replays for 150 bounded draws", () => {
    for (let index = 0; index < 150; index += 1) {
      const active = investigation("appliedForceNewtons");
      const configuration = safeConfig(rand);
      const evidence = runTrialEvidence({
        missionId: "property",
        scenarioId: "property",
        comparisonSetId: "set-property",
        trialId: buildTrialId("property", "set-property", index),
        ordinal: index,
        variantSeed: index,
        investigation: active,
        request: { configuration, sampleCount: 7, positionTargetsMetres: [1, 4] },
      });

      // AC1: a JSON round trip is lossless, with no undefined surviving.
      const round = JSON.parse(JSON.stringify(evidence)) as typeof evidence;
      expect(round).toStrictEqual(evidence);
      expect(JSON.stringify(evidence)).not.toContain("undefined");

      // AC2 and AC5: the record replays from its own provenance.
      const verdict = replayTrialEvidence(evidence, { investigation: active });
      expect(verdict.status).toBe("reproduced");
    }
  });

  it("records a final position matching x0 + v0*t + 0.5*a*t^2 for every draw", () => {
    for (let index = 0; index < 100; index += 1) {
      const configuration = safeConfig(rand);
      const active = investigation("appliedForceNewtons");
      const evidence = runTrialEvidence({
        missionId: "property",
        scenarioId: "property",
        comparisonSetId: "set-property",
        trialId: buildTrialId("property", "set-property", index),
        ordinal: index,
        variantSeed: index,
        investigation: active,
        request: { configuration, sampleCount: 5 },
      });
      const t = configuration.observationWindowSeconds;
      const a = configuration.appliedForceNewtons / configuration.cartMassKilograms;
      const expected =
        configuration.initialVelocityMetresPerSecond * t + 0.5 * a * t * t;
      expect(evidence.finalState.positionMetres).toBeCloseTo(expected, 10);
      expect(evidence.finalState.velocityMetresPerSecond).toBeCloseTo(
        configuration.initialVelocityMetresPerSecond + a * t,
        10
      );
    }
  });
});

describe("controlled-variable classification is total", () => {
  const rand = mulberry32(0x4d4c3035);

  it("classifies every random pair, and never reports a valid change that moved a controlled variable", () => {
    for (let index = 0; index < 200; index += 1) {
      const active = investigation(ALL_VARIABLE_IDS[index % ALL_VARIABLE_IDS.length]!);
      const baseline = safeConfig(rand);
      const candidate = safeConfig(rand);
      const assessment = assessTrialChange(active, baseline, candidate);

      expect([
        "valid",
        "unchanged",
        "multiple-variables-changed",
        "controlled-variable-changed",
      ]).toContain(assessment.validity);

      if (assessment.validity === "valid") {
        // A valid comparison moved exactly the independent variable and nothing else.
        expect(assessment.changes).toHaveLength(1);
        expect(assessment.changes[0]!.variableId).toBe(active.independentVariableId);
        expect(assessment.controlledViolations).toStrictEqual([]);
        expect(assessment.pedagogy).toBeNull();
      } else if (assessment.validity !== "unchanged") {
        // Every rejection explains itself.
        expect(assessment.pedagogy).not.toBeNull();
      }

      if (assessment.validity === "unchanged") {
        expect(assessment.changes).toStrictEqual([]);
      }
    }
  });
});

describe("history is append-only under repeated construction", () => {
  const rand = mulberry32(0x4d4c3036);

  it("keeps every earlier trial byte-identical as the set grows", () => {
    const active = investigation("appliedForceNewtons");
    const snapshots: string[] = [];
    let set = createComparisonSet({
      comparisonSetId: "set-append",
      missionId: "property",
      scenarioId: "property",
      investigation: active,
    });

    for (let index = 0; index < 12; index += 1) {
      const evidence = runTrialEvidence({
        missionId: "property",
        scenarioId: "property",
        comparisonSetId: "set-append",
        trialId: buildTrialId("property", "set-append", index),
        ordinal: index,
        variantSeed: index,
        investigation: active,
        request: { configuration: safeConfig(rand), sampleCount: 5 },
      });
      set = appendTrialToComparisonSet(set, evidence);
      for (const earlier of snapshots) {
        const stored = set.trials.find(
          (trial) => canonicalJson(trial) === earlier
        );
        expect(stored).toBeDefined();
      }
      snapshots.push(canonicalJson(evidence));
    }

    expect(set.trials).toHaveLength(12);
    expect(new Set(snapshots).size).toBe(12);
  });
});

describe("the seeded generator is the only source of variation in a variant", () => {
  it("never lets a seed change a result for a fixed configuration", () => {
    const active = investigation("appliedForceNewtons");
    const configuration: TrialConfig = {
      cartMassKilograms: 2,
      appliedForceNewtons: 4,
      initialVelocityMetresPerSecond: 0,
      observationWindowSeconds: 3,
    };
    for (const seed of [0, 1, 7, 1024, 999_983]) {
      const first = runTrialEvidence({
        missionId: "seed",
        scenarioId: "seed",
        comparisonSetId: "set-seed",
        trialId: buildTrialId("seed", "set-seed", 0),
        ordinal: 0,
        variantSeed: seed,
        investigation: active,
        request: { configuration, sampleCount: 5 },
      });
      const second = runTrialEvidence({
        missionId: "seed",
        scenarioId: "seed",
        comparisonSetId: "set-seed",
        trialId: buildTrialId("seed", "set-seed", 0),
        ordinal: 0,
        variantSeed: seed + 1,
        investigation: active,
        request: { configuration, sampleCount: 5 },
      });
      expect(canonicalJson(first.samples)).toBe(canonicalJson(second.samples));
      expect(canonicalJson(first.measurements)).toBe(canonicalJson(second.measurements));
    }
  });

  it("produces a reproducible stream for a given seed", () => {
    const draw = (seed: number) => {
      const next = createSeededRandom(seed);
      return [next(), next(), next(), next()];
    };
    expect(draw(2024)).toStrictEqual(draw(2024));
    expect(draw(2024)).not.toStrictEqual(draw(2025));
  });

  it("selects only from the declared candidate space, never an interpolated value", () => {
    // The seed chooses a member of the declared space. If it were ever
    // perturbed, jittered, or nudged off a candidate, a scenario's authored
    // bounds would stop describing the values that actually run.
    const space = {
      candidates: {
        cartMassKilograms: [1, 2, 3, 4],
        appliedForceNewtons: [-4, 0, 4, 8],
        initialVelocityMetresPerSecond: [-1, 0, 1],
        observationWindowSeconds: [2, 4, 6],
      },
    };
    const base: TrialConfig = {
      cartMassKilograms: 2,
      appliedForceNewtons: 0,
      initialVelocityMetresPerSecond: 0,
      observationWindowSeconds: 3,
    };
    for (let seed = 0; seed < 60; seed += 1) {
      const variant = deriveSeededVariant(base, seed, space);
      for (const [variableId, values] of Object.entries(space.candidates)) {
        const chosen = variant.configuration[variableId as VariableId];
        expect(values).toContain(chosen);
      }
    }
  });
});
