import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  sampleTrajectory,
  singleSegmentDeclaration,
  type MotionSample,
} from "../../src/science/index.js";
import {
  ALL_VARIABLE_IDS,
  appendTrialToComparisonSet,
  assessTrialChange,
  buildTrialId,
  canonicalJson,
  createComparisonSet,
  createSeededRandom,
  deepFreeze,
  deriveSeededVariant,
  digestOf,
  DomainValidationError,
  enforceControlledVariables,
  evaluateClaim,
  planSampleTimes,
  replayTrialEvidence,
  runTrialEvidence,
  type Claim,
  type ControlledInvestigation,
  type TrialConfig,
  type TrialEvidence,
  type VariableDeclaration,
} from "../../src/domain/index.js";

/**
 * Experiment / evidence domain contract (GAME-388 / ML-04).
 *
 * Each block names the acceptance criterion it is evidence for. Where a test
 * claims a guarantee, the accompanying "the detector works" block proves the
 * detector is not vacuous.
 */

function variable(
  id: VariableDeclaration["id"],
  role: VariableDeclaration["role"]
): VariableDeclaration {
  const boundsById: Record<VariableDeclaration["id"], readonly [number, number]> = {
    cartMassKilograms: [1, 4],
    appliedForceNewtons: [-12, 12],
    initialVelocityMetresPerSecond: [-2, 2],
    observationWindowSeconds: [1, 6],
  };
  return {
    id,
    quantity:
      id === "cartMassKilograms"
        ? "mass"
        : id === "appliedForceNewtons"
          ? "force"
          : id === "initialVelocityMetresPerSecond"
            ? "velocity"
            : "time",
    role,
    bounds: boundsById[id],
    step: 0.5,
    learnerAdjustable: true,
    label: id,
  };
}

function investigation(
  independent: ControlledInvestigation["independentVariableId"]
): ControlledInvestigation {
  return {
    investigationId: `investigation-${independent}`,
    independentVariableId: independent,
    dependentVariableIds: [independent],
    controlledVariableIds: ALL_VARIABLE_IDS.filter((id) => id !== independent),
    declaredVariables: ALL_VARIABLE_IDS.map((id) =>
      variable(id, id === independent ? "independent" : "controlled")
    ),
  };
}

const BASE: TrialConfig = {
  cartMassKilograms: 2,
  appliedForceNewtons: 0,
  initialVelocityMetresPerSecond: 0,
  observationWindowSeconds: 3,
};

function run(
  configuration: TrialConfig,
  options: {
    ordinal?: number;
    seed?: number;
    sampleCount?: number;
    positionTargetsMetres?: readonly number[];
    investigation?: ControlledInvestigation;
  } = {}
): TrialEvidence {
  const active = options.investigation ?? investigation("appliedForceNewtons");
  return runTrialEvidence({
    missionId: "mission-ml04",
    scenarioId: "scenario-force-scaling",
    comparisonSetId: "set-1",
    trialId: buildTrialId("mission-ml04", "set-1", options.ordinal ?? 0),
    ordinal: options.ordinal ?? 0,
    variantSeed: options.seed ?? 1,
    investigation: active,
    request: {
      configuration,
      sampleCount: options.sampleCount ?? 5,
      positionTargetsMetres: options.positionTargetsMetres,
    },
  });
}

function setOf(evidence: readonly TrialEvidence[], active = investigation("appliedForceNewtons")) {
  return evidence.reduce(
    (set, trial) => appendTrialToComparisonSet(set, trial),
    createComparisonSet({
      comparisonSetId: "set-1",
      missionId: "mission-ml04",
      scenarioId: "scenario-force-scaling",
      investigation: active,
    })
  );
}

// ---------------------------------------------------------------------------
// AC1 — domain state is JSON-safe and renderer-independent
// ---------------------------------------------------------------------------

describe("AC1: domain evidence is JSON-safe", () => {
  const evidence = run(BASE, { positionTargetsMetres: [2] });

  it("survives a JSON round trip unchanged", () => {
    const round = JSON.parse(JSON.stringify(evidence)) as TrialEvidence;
    expect(round).toStrictEqual(evidence);
  });

  it("contains no non-finite number anywhere", () => {
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "number") {
        expect(Number.isFinite(value), `${path} must be finite`).toBe(true);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (value !== null && typeof value === "object") {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };
    walk(evidence, "evidence");
  });

  it("refuses to serialise a non-finite value into a digest", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(DomainValidationError);
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow(
      DomainValidationError
    );
  });

  it("is deeply frozen, so a record cannot be edited in place", () => {
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.samples)).toBe(true);
    expect(Object.isFrozen(evidence.samples[0])).toBe(true);
    expect(Object.isFrozen(evidence.measurements)).toBe(true);
    expect(Object.isFrozen(evidence.provenance)).toBe(true);
  });

  it("cannot be mutated even by assignment (strict-mode engines throw)", () => {
    const frozen = run(BASE);
    expect(() => {
      (frozen as { integrityDigest: string }).integrityDigest = "00000000";
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC2 — same seed / configuration produces the same trial evidence
// ---------------------------------------------------------------------------

describe("AC2: the same seed and configuration produce identical evidence", () => {
  it("produces a bit-identical record including the digest", () => {
    const a = run(BASE, { seed: 42, positionTargetsMetres: [1, 2] });
    const b = run(BASE, { seed: 42, positionTargetsMetres: [1, 2] });
    expect(canonicalJson(b)).toBe(canonicalJson(a));
    expect(b.integrityDigest).toBe(a.integrityDigest);
  });

  it("produces a different record when the configuration differs", () => {
    const a = run(BASE, { seed: 42 });
    const b = run({ ...BASE, appliedForceNewtons: 4 }, { seed: 42 });
    expect(b.integrityDigest).not.toBe(a.integrityDigest);
  });

  it("records the seed in provenance but never lets it touch the physics", () => {
    // Two different seeds that resolve to the same configuration must give the
    // same authoritative numbers: the seed chooses what to run, not what happens.
    const a = run(BASE, { seed: 1 });
    const b = run(BASE, { seed: 999_999 });
    expect(b.provenance.variantSeed).not.toBe(a.provenance.variantSeed);
    expect(canonicalJson(b.samples)).toBe(canonicalJson(a.samples));
    expect(canonicalJson(b.measurements)).toBe(canonicalJson(a.measurements));
    // The digest covers provenance, so the two records are still distinct.
    expect(b.integrityDigest).not.toBe(a.integrityDigest);
  });

  it("derives a stable configuration from a seeded variant space", () => {
    const space = {
      candidates: { appliedForceNewtons: [0, 2, 4, 6], cartMassKilograms: [1, 2, 3, 4] },
    };
    const first = deriveSeededVariant(BASE, 77, space);
    const second = deriveSeededVariant(BASE, 77, space);
    expect(first.configuration).toStrictEqual(second.configuration);
    expect(first.chosenIndices).toStrictEqual(second.chosenIndices);
    // A different seed is free to land somewhere else.
    const other = deriveSeededVariant(BASE, 78, space);
    expect(canonicalJson(other.configuration)).not.toBe(
      canonicalJson(first.configuration)
    );
  });

  it("rejects a seed that is not a non-negative integer", () => {
    expect(() => createSeededRandom(-1)).toThrow(DomainValidationError);
    expect(() => createSeededRandom(1.5)).toThrow(DomainValidationError);
  });

  it("draws the same mulberry32 sequence for the same seed", () => {
    const first = createSeededRandom(1234);
    const second = createSeededRandom(1234);
    const a = [first(), first(), first()];
    const b = [second(), second(), second()];
    expect(a).toStrictEqual(b);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AC3 — the presentation layer cannot forge a measurement scoring accepts
// ---------------------------------------------------------------------------

describe("AC3: a forged measurement cannot become admissible evidence", () => {
  const options = { investigation: investigation("appliedForceNewtons") };
  const claim: Claim = {
    claimId: "c1",
    text: "more force travels further",
    measurementId: "finalPosition",
    relation: "greater-than",
    attributedVariableId: "appliedForceNewtons",
  };

  const baseline = run(BASE, { ordinal: 0, seed: 5 });
  const pushed = run({ ...BASE, appliedForceNewtons: 4 }, { ordinal: 1, seed: 5 });
  const set = setOf([baseline, pushed]);

  it("accepts genuine evidence", () => {
    const verdict = evaluateClaim(
      set,
      claim,
      [baseline.provenance.trialId, pushed.provenance.trialId],
      options
    );
    expect(verdict.supported).toBe(true);
    expect(verdict.reason).toBe("supported-by-evidence");
  });

  it("rejects a record whose measurement was edited after the fact", () => {
    const forged: TrialEvidence = {
      ...pushed,
      measurements: pushed.measurements.map((entry) =>
        entry.id === "finalPosition" ? { ...entry, value: 999 } : entry
      ),
    };
    const verdict = replayTrialEvidence(forged, options);
    expect(verdict.status).toBe("digest-mismatch");
    expect(verdict.divergencePath).toBe("integrityDigest");
  });

  it("rejects a forgery that also recomputes the digest", () => {
    // A forger who recomputes the digest still cannot match the values the
    // kernel derives from the recorded declaration.
    const tampered = {
      ...pushed,
      measurements: pushed.measurements.map((entry) =>
        entry.id === "finalPosition" ? { ...entry, value: 999 } : entry
      ),
    };
    const forged: TrialEvidence = {
      ...tampered,
      integrityDigest: digestOf({
        provenance: tampered.provenance,
        samples: tampered.samples,
        finalState: tampered.finalState,
        measurements: tampered.measurements,
        unreachedPositionTargetsMetres: tampered.unreachedPositionTargetsMetres,
      }),
    };
    const verdict = replayTrialEvidence(forged, options);
    expect(verdict.status).toBe("trajectory-divergent");
    expect(verdict.divergencePath).toBe("measurements");
  });

  it("refuses to score a claim whose evidence does not reproduce", () => {
    const forged: TrialEvidence = {
      ...pushed,
      measurements: pushed.measurements.map((entry) =>
        entry.id === "finalPosition" ? { ...entry, value: 999 } : entry
      ),
    };
    const forgedSet = setOf([baseline, forged]);
    const verdict = evaluateClaim(
      forgedSet,
      claim,
      [baseline.provenance.trialId, forged.provenance.trialId],
      options
    );
    expect(verdict.supported).toBe(false);
    expect(verdict.reason).toBe("unverified-evidence");
    expect(verdict.admissibleTrialIds).toStrictEqual([]);
  });

  it("rejects a record whose samples were replaced with renderer-style values", () => {
    const drifted: MotionSample[] = pushed.samples.map((sample, index) =>
      index === pushed.samples.length - 1
        ? {
            ...sample,
            state: { ...sample.state, positionMetres: sample.state.positionMetres + 0.5 },
          }
        : sample
    );
    const tampered: TrialEvidence = { ...pushed, samples: drifted };
    const verdict = replayTrialEvidence(tampered, options);
    expect(verdict.status).toBe("trajectory-divergent");
    expect(verdict.divergencePath).toBe(`samples[${drifted.length - 1}]`);
  });

  it("carries no measured value on the request a caller passes in", () => {
    // The structural half of the guarantee: the only thing a caller supplies is
    // a configuration and a sampling plan, so there is no measured value that
    // could be forged into the first place.
    const request = {
      configuration: BASE,
      sampleCount: 5,
    } as const;
    expect(Object.keys(request).sort()).toStrictEqual(["configuration", "sampleCount"]);
    expect(canonicalJson(request)).not.toMatch(/measurement/i);

    // And the declared request type itself admits no measurement field.
    const declaration = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../src/domain/experiment-types.ts"),
      "utf8"
    );
    const block = declaration.match(/export interface TrialRequest \{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/Measurement/);
  });
});

// ---------------------------------------------------------------------------
// AC4 — controlled-variable constraints are testable
// ---------------------------------------------------------------------------

describe("AC4: controlled-variable constraints are decidable and testable", () => {
  const active = investigation("appliedForceNewtons");

  it("accepts a change of exactly the independent variable", () => {
    const assessment = assessTrialChange(active, BASE, { ...BASE, appliedForceNewtons: 4 });
    expect(assessment.validity).toBe("valid");
    expect(assessment.independentChanged).toBe(true);
    expect(assessment.controlledViolations).toStrictEqual([]);
    expect(assessment.pedagogy).toBeNull();
  });

  it("rejects a change of two variables at once and says which", () => {
    const assessment = assessTrialChange(active, BASE, {
      ...BASE,
      cartMassKilograms: 3,
      appliedForceNewtons: 4,
    });
    expect(assessment.validity).toBe("multiple-variables-changed");
    expect(assessment.changes.map((change) => change.variableId).sort()).toStrictEqual([
      "appliedForceNewtons",
      "cartMassKilograms",
    ]);
    expect(assessment.controlledViolations).toStrictEqual(["cartMassKilograms"]);
    expect(assessment.pedagogy).toContain("2 variables changed at once");
  });

  it("rejects a change of only a controlled variable", () => {
    const assessment = assessTrialChange(active, BASE, { ...BASE, cartMassKilograms: 3 });
    expect(assessment.validity).toBe("controlled-variable-changed");
    expect(assessment.independentChanged).toBe(false);
    expect(assessment.pedagogy).toContain("cartMassKilograms");
  });

  it("reports an unchanged configuration distinctly from a valid change", () => {
    expect(assessTrialChange(active, BASE, BASE).validity).toBe("unchanged");
  });

  it("blocks rather than merely reports when enforcement is requested", () => {
    expect(() =>
      enforceControlledVariables(active, BASE, {
        ...BASE,
        cartMassKilograms: 3,
        appliedForceNewtons: 4,
      })
    ).toThrow(DomainValidationError);
    expect(() =>
      enforceControlledVariables(active, BASE, { ...BASE, cartMassKilograms: 3 })
    ).toThrow(DomainValidationError);
    expect(() => enforceControlledVariables(active, BASE, { ...BASE, appliedForceNewtons: 4 })).not.toThrow();
  });

  it("classifies every reachable outcome, with no dead branch", () => {
    const outcomes = new Set<string>();
    for (const mass of [1, 2, 3, 4]) {
      for (const force of [0, 4]) {
        for (const velocity of [0, 1]) {
          outcomes.add(
            assessTrialChange(active, BASE, {
              cartMassKilograms: mass,
              appliedForceNewtons: force,
              initialVelocityMetresPerSecond: velocity,
              observationWindowSeconds: 3,
            }).validity
          );
        }
      }
    }
    expect([...outcomes].sort()).toStrictEqual([
      "controlled-variable-changed",
      "multiple-variables-changed",
      "unchanged",
      "valid",
    ]);
  });

  it("rejects a configuration outside its declared bounds before the kernel runs", () => {
    expect(() => run({ ...BASE, cartMassKilograms: 9 })).toThrow(DomainValidationError);
    expect(() => run({ ...BASE, observationWindowSeconds: 99 })).toThrow(DomainValidationError);
    expect(() => run({ ...BASE, cartMassKilograms: Number.NaN })).toThrow(
      DomainValidationError
    );
  });

  it("rejects a malformed investigation declaration", () => {
    const broken: ControlledInvestigation = {
      ...active,
      controlledVariableIds: ["appliedForceNewtons"],
    };
    expect(() => assessTrialChange(broken, BASE, { ...BASE, appliedForceNewtons: 2 })).toThrow(
      DomainValidationError
    );
  });
});

// ---------------------------------------------------------------------------
// AC5 — provenance is sufficient to reconstruct the authoritative run
// ---------------------------------------------------------------------------

describe("AC5: a trial record carries enough provenance to reconstruct its run", () => {
  const evidence = run(BASE, { ordinal: 3, seed: 17, positionTargetsMetres: [1, 2] });
  const options = { investigation: investigation("appliedForceNewtons") };

  it("names the mission, scenario, comparison set, trial, ordinal, and seed", () => {
    expect(evidence.provenance.missionId).toBe("mission-ml04");
    expect(evidence.provenance.scenarioId).toBe("scenario-force-scaling");
    expect(evidence.provenance.comparisonSetId).toBe("set-1");
    expect(evidence.provenance.ordinal).toBe(3);
    expect(evidence.provenance.variantSeed).toBe(17);
    expect(evidence.provenance.trialId).toBe(buildTrialId("mission-ml04", "set-1", 3));
  });

  it("records the exact motion declaration and sample plan handed to the kernel", () => {
    expect(evidence.provenance.motionDeclaration.observationWindowSeconds).toBe(3);
    expect(evidence.provenance.motionDeclaration.segments).toHaveLength(1);
    expect(evidence.provenance.motionDeclaration.segments[0]!.massKilograms).toBe(2);
    expect(evidence.provenance.sampleTimesSeconds).toStrictEqual([0, 0.75, 1.5, 2.25, 3]);
    expect(evidence.samples).toHaveLength(evidence.provenance.sampleTimesSeconds.length);
  });

  it("freezes the SI units so the record is self-describing for a reviewer", () => {
    expect(evidence.provenance.quantityUnits.position).toBe("m");
    expect(evidence.provenance.quantityUnits.mass).toBe("kg");
    expect(evidence.provenance.quantityUnits.force).toBe("N");
  });

  it("names the kernel and domain contract that produced the record", () => {
    expect(evidence.provenance.kernelId).toMatch(/^ml-03/);
    expect(evidence.provenance.domainContractVersion).toMatch(/experiment-model/);
  });

  it("replays from provenance alone, with no access to the original run", () => {
    const verdict = replayTrialEvidence(evidence, options);
    expect(verdict.status).toBe("reproduced");
    expect(verdict.divergencePath).toBeNull();
  });

  it("rejects a record whose configuration would never have been admissible", () => {
    const tampered: TrialEvidence = {
      ...evidence,
      provenance: { ...evidence.provenance, configuration: { ...evidence.provenance.configuration, cartMassKilograms: 99 } },
    };
    const verdict = replayTrialEvidence(tampered, options);
    expect(verdict.status).toBe("trajectory-divergent");
    expect(verdict.divergencePath).toBe("provenance.configuration");
  });

  it("documents the derivation of every measurement it reports", () => {
    for (const entry of evidence.measurements) {
      expect(entry.derivation.length).toBeGreaterThan(20);
      expect(Number.isFinite(entry.value)).toBe(true);
    }
  });

  it("reports a position marker the cart never reached instead of inventing one", () => {
    const withTarget = run({ ...BASE, appliedForceNewtons: 0 }, {
      positionTargetsMetres: [5],
    });
    expect(withTarget.unreachedPositionTargetsMetres).toStrictEqual([5]);
    expect(withTarget.measurements.some((entry) => entry.id === "timeToPosition")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Immutability, identity, and replay determinism
// ---------------------------------------------------------------------------

describe("trial identity and history are append-only", () => {
  it("refuses to re-add an existing trial identity", () => {
    const evidence = run(BASE, { ordinal: 0 });
    const set = setOf([evidence]);
    expect(() => appendTrialToComparisonSet(set, evidence)).toThrow(DomainValidationError);
  });

  it("refuses to reuse an ordinal", () => {
    const first = run(BASE, { ordinal: 0 });
    const second = run({ ...BASE, appliedForceNewtons: 4 }, { ordinal: 0 });
    const set = setOf([first]);
    // Same ordinal, different identity: still refused.
    const clashing: TrialEvidence = {
      ...second,
      provenance: { ...second.provenance, trialId: "mission-ml04/set-1/trial-other" },
    };
    expect(() => appendTrialToComparisonSet(set, clashing)).toThrow(DomainValidationError);
  });

  it("refuses a trial that belongs to a different comparison set", () => {
    const evidence = run(BASE, { ordinal: 0 });
    const set = createComparisonSet({
      comparisonSetId: "set-other",
      missionId: "mission-ml04",
      scenarioId: "scenario-force-scaling",
      investigation: investigation("appliedForceNewtons"),
    });
    expect(() => appendTrialToComparisonSet(set, evidence)).toThrow(DomainValidationError);
  });

  it("keeps a reset/retry as a new trial rather than rewriting the old one", () => {
    const original = run(BASE, { ordinal: 0 });
    const retry = run({ ...BASE, appliedForceNewtons: 4 }, { ordinal: 1 });
    const set = setOf([original, retry]);
    expect(set.trials).toHaveLength(2);
    expect(set.trials[0]!.provenance.trialId).toBe(original.provenance.trialId);
    expect(set.trials[1]!.provenance.trialId).toBe(retry.provenance.trialId);
    expect(set.trials[0]!.measurements).toStrictEqual(original.measurements);
  });

  it("does not mutate the set it was given", () => {
    const evidence = run(BASE, { ordinal: 0 });
    const before = setOf([evidence]);
    const snapshot = canonicalJson(before);
    appendTrialToComparisonSet(before, run({ ...BASE, appliedForceNewtons: 2 }, { ordinal: 1 }));
    expect(canonicalJson(before)).toBe(snapshot);
  });
});

describe("replay and digest are stable and key-order independent", () => {
  const evidence = run(BASE);

  it("produces the same digest for a key-reordered but equal object", () => {
    const a = { alpha: 1, beta: { x: 2, y: 3 } };
    const b = { beta: { y: 3, x: 2 }, alpha: 1 };
    expect(digestOf(b)).toBe(digestOf(a));
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });

  it("changes the digest when any value changes", () => {
    expect(digestOf({ alpha: 1 })).not.toBe(digestOf({ alpha: 2 }));
    expect(digestOf([1, 2])).not.toBe(digestOf([2, 1]));
  });

  it("keeps array order significant, because sample order is scientific", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("replays identically on repeated runs", () => {
    const options = { investigation: investigation("appliedForceNewtons") };
    const first = replayTrialEvidence(evidence, options);
    const second = replayTrialEvidence(evidence, options);
    expect(first).toStrictEqual(second);
  });
});

describe("the domain sampling plan agrees with the kernel's own sampling", () => {
  it("requests exactly the timestamps the kernel would sample", () => {
    const declaration = singleSegmentDeclaration({
      massKilograms: 2,
      initialPositionMetres: 0,
      initialVelocityMetresPerSecond: 1.5,
      appliedForcesNewtons: [0],
      observationWindowSeconds: 4,
    });
    const kernelSamples: readonly MotionSample[] = sampleTrajectory(declaration, 9);
    const planned = planSampleTimes(4, 9);
    expect(kernelSamples.map((sample) => sample.elapsedSeconds)).toStrictEqual([...planned]);
  });

  it("rejects a sample plan with fewer than two instants", () => {
    expect(() => planSampleTimes(4, 1)).toThrow(DomainValidationError);
    expect(() => planSampleTimes(4, 2.5)).toThrow(DomainValidationError);
  });
});

describe("deepFreeze is total and idempotent", () => {
  it("freezes nested arrays and objects", () => {
    const frozen = deepFreeze({ a: { b: [1, 2, { c: 3 }] } });
    expect(Object.isFrozen(frozen.a)).toBe(true);
    expect(Object.isFrozen(frozen.a.b)).toBe(true);
    expect(Object.isFrozen(frozen.a.b[2])).toBe(true);
  });

  it("leaves primitives alone and is safe to call twice", () => {
    expect(deepFreeze(5)).toBe(5);
    const once = deepFreeze({ a: 1 });
    expect(deepFreeze(once)).toBe(once);
  });
});
