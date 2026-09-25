import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  appendTrialToComparisonSet,
  assessTrialChange,
  buildTrialId,
  createComparisonSet,
  detectMisconceptions,
  evaluateClaim,
  findMeasurement,
  replayTrialEvidence,
  runTrialEvidence,
  type Claim,
  type ComparisonSet,
  type ControlledInvestigation,
  type MisconceptionId,
  type TrialConfig,
  type TrialEvidence,
} from "../../src/domain/index.js";

/**
 * Human-readable golden fixtures for the experiment/evidence contract
 * (GAME-388 AC6).
 *
 * These fixtures cover the three cases the acceptance criteria name: a valid
 * controlled comparison, an invalid one that changes two variables at once, and
 * misconception cases that the domain is expected to diagnose from the recorded
 * evidence. Each carries prose and equations a reviewer can read, plus
 * expectations computed by hand from the closed-form physics in
 * docs/SCIENCE_MODEL.md rather than captured from the implementation.
 */

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/domain/golden"
);

interface ExpectedMeasurement {
  readonly id: string;
  readonly value: number;
  readonly targetMetres?: number;
}

interface FixtureTrial {
  readonly ordinal: number;
  readonly variantSeed: number;
  readonly sampleCount: number;
  readonly positionTargetsMetres: readonly number[];
  readonly configuration: TrialConfig;
  readonly expectedMeasurements: readonly ExpectedMeasurement[];
  readonly expectedUnreachedTargetsMetres: readonly number[];
}

interface GoldenFixture {
  readonly id: string;
  readonly kind: "valid" | "invalid" | "misconception";
  readonly title: string;
  readonly equations: readonly string[];
  readonly rationale: string;
  readonly investigation: ControlledInvestigation;
  readonly trials: readonly FixtureTrial[];
  readonly expectedComparison: {
    readonly validity: string;
    readonly changedVariableIds: readonly string[];
    readonly controlledViolations: readonly string[];
    readonly pedagogy: string | null;
    readonly pedagogyContains?: string;
  };
  readonly claim: Claim;
  readonly expectedClaimEvaluation: {
    readonly supported: boolean;
    readonly reason: string;
  };
  readonly expectedMisconceptions: readonly MisconceptionId[];
}

function loadFixture(name: string): GoldenFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as GoldenFixture;
}

const FIXTURE_NAMES = readdirSync(FIXTURE_DIR)
  .filter((name) => name.endsWith(".json"))
  .sort();

function runFixtureTrial(fixture: GoldenFixture, trial: FixtureTrial): TrialEvidence {
  return runTrialEvidence({
    missionId: "mission-ml04",
    scenarioId: fixture.id,
    comparisonSetId: `set-${fixture.id}`,
    trialId: buildTrialId("mission-ml04", `set-${fixture.id}`, trial.ordinal),
    ordinal: trial.ordinal,
    variantSeed: trial.variantSeed,
    investigation: fixture.investigation,
    request: {
      configuration: trial.configuration,
      sampleCount: trial.sampleCount,
      positionTargetsMetres: trial.positionTargetsMetres,
    },
  });
}

function buildSet(fixture: GoldenFixture): {
  set: ComparisonSet;
  evidence: readonly TrialEvidence[];
} {
  const evidence = fixture.trials.map((trial) => runFixtureTrial(fixture, trial));
  const set = evidence.reduce(
    (current, trial) => appendTrialToComparisonSet(current, trial),
    createComparisonSet({
      comparisonSetId: `set-${fixture.id}`,
      missionId: "mission-ml04",
      scenarioId: fixture.id,
      investigation: fixture.investigation,
    })
  );
  return { set, evidence };
}

describe("domain golden fixtures are reviewable", () => {
  it("ships a valid, an invalid, and misconception cases", () => {
    const kinds = new Set(FIXTURE_NAMES.map((name) => loadFixture(name).kind));
    expect([...kinds].sort()).toStrictEqual(["invalid", "misconception", "valid"]);
  });

  it("carries prose and equations a reviewer can read for every fixture", () => {
    for (const name of FIXTURE_NAMES) {
      const fixture = loadFixture(name);
      expect(fixture.id.length).toBeGreaterThan(0);
      expect(fixture.title.length).toBeGreaterThan(10);
      expect(fixture.rationale.length).toBeGreaterThan(80);
      expect(fixture.equations.length).toBeGreaterThan(0);
      expect(
        fixture.equations.some((line) => /Fnet|a\s*=|v\(|x\(|m\/s/.test(line))
      ).toBe(true);
      expect(fixture.trials.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe.each(FIXTURE_NAMES)("%s", (name) => {
  const fixture = loadFixture(name);
  const { set, evidence } = buildSet(fixture);
  const options = { investigation: fixture.investigation };

  it("produces the hand-computed measurements for every trial", () => {
    for (const trial of fixture.trials) {
      const record = evidence[trial.ordinal]!;
      for (const expected of trial.expectedMeasurements) {
        const actual = findMeasurement(
          record.measurements,
          expected.id as never,
          expected.targetMetres
        );
        expect(actual, `${trial.ordinal}:${expected.id}`).toBeDefined();
        expect(actual!.value).toBe(expected.value);
      }
      expect([...record.unreachedPositionTargetsMetres].sort()).toStrictEqual(
        [...trial.expectedUnreachedTargetsMetres].sort()
      );
    }
  });

  it("replays every trial from its provenance alone", () => {
    for (const record of evidence) {
      const verdict = replayTrialEvidence(record, options);
      expect(verdict.status).toBe("reproduced");
    }
  });

  it("classifies the comparison exactly as the fixture declares", () => {
    const [baseline, candidate] = fixture.trials;
    const assessment = assessTrialChange(
      fixture.investigation,
      baseline!.configuration,
      candidate!.configuration
    );
    expect(assessment.validity).toBe(fixture.expectedComparison.validity);
    expect(assessment.changes.map((change) => change.variableId).sort()).toStrictEqual(
      [...fixture.expectedComparison.changedVariableIds].sort()
    );
    expect([...assessment.controlledViolations].sort()).toStrictEqual(
      [...fixture.expectedComparison.controlledViolations].sort()
    );
    if (fixture.expectedComparison.pedagogyContains !== undefined) {
      expect(assessment.pedagogy).toContain(fixture.expectedComparison.pedagogyContains);
    } else {
      expect(assessment.pedagogy).toBe(fixture.expectedComparison.pedagogy);
    }
  });

  it("evaluates the claim exactly as the fixture declares", () => {
    const verdict = evaluateClaim(
      set,
      fixture.claim,
      fixture.trials.map((trial) =>
        buildTrialId("mission-ml04", `set-${fixture.id}`, trial.ordinal)
      ),
      options
    );
    expect(verdict.supported).toBe(fixture.expectedClaimEvaluation.supported);
    expect(verdict.reason).toBe(fixture.expectedClaimEvaluation.reason);
    expect(verdict.explanation.length).toBeGreaterThan(20);
  });

  it("diagnoses exactly the misconceptions the fixture declares", () => {
    const signals = detectMisconceptions(set, options);
    expect(signals.map((signal) => signal.misconceptionId).sort()).toStrictEqual(
      [...fixture.expectedMisconceptions].sort()
    );
    for (const signal of signals) {
      expect(signal.description.length).toBeGreaterThan(40);
      expect(signal.remediation.length).toBeGreaterThan(40);
      expect(signal.evidenceTrialIds.length).toBeGreaterThan(0);
      // Every signal must point at trials that really exist in the set.
      for (const trialId of signal.evidenceTrialIds) {
        expect(set.trials.some((trial) => trial.provenance.trialId === trialId)).toBe(true);
      }
    }
  });
});
