/**
 * Content is data, and the boundary around it holds.
 *
 * Two properties are asserted here that are easy to lose and expensive to
 * rediscover:
 *
 * 1. **The shipped module graph cannot reach the content package.** The golden
 *    traces contain the expected answers to every scenario. If an application
 *    module could import them they would be one refactor away from the bundle,
 *    and the anti-answer-key guarantee would become a matter of discipline
 *    rather than structure.
 * 2. **The learner-facing projection leaks nothing that decides a diagnosis.**
 *    The projection is a whitelist, and this suite compares what a reference
 *    trial and a suspect trial at identical settings actually expose.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FAMILY_DEFINITIONS,
  findReleaseBlockers,
  isReleaseReady,
  releaseReadyScenarioIds,
  assertReleaseReady,
  toLearnerCauseOptions,
  toLearnerTrialView,
  toLearnerResultView,
  type ScenarioFile,
} from "../../src/content/index.js";
import { FROZEN_FAMILY_CONTRACT, SCENARIOS } from "./content-loader.js";

// The frozen family contract is asserted field for field, so its shape is
// spelled out in full here rather than narrowed to the few fields first used.
type FrozenFamily = {
  id: string;
  name: string;
  primaryConcept: string;
  scienceQuestion: string;
  independentVariable: string;
  dependentVariable: string;
  difficultyLevels: readonly string[];
  misconceptions: readonly string[];
  graphRequirement: { level: string; graphs: readonly string[]; note: string };
  answerKeyBounded: boolean;
};

const SRC = resolve(process.cwd(), "src");

function sourceFiles(dir: string): readonly { path: string; source: string; specifiers: readonly string[] }[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => {
      const absolute = join(entry.parentPath ?? dir, entry.name);
      const source = readFileSync(absolute, "utf8");
      return {
        path: relative(SRC, absolute).split(sep).join("/"),
        source,
        specifiers: [...source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
          (match) => match[1] ?? ""
        ),
      };
    });
}

const ALL_SOURCE = ["app", "ui", "renderer", "host", "viewmodel"].flatMap((folder) =>
  sourceFiles(join(SRC, folder))
);

describe("the content package is unreachable from the application", () => {
  it("has no application module that imports it at all", () => {
    const offenders = ALL_SOURCE.filter((file) =>
      file.specifiers.some(
        (specifier) =>
          specifier.includes("content/index") ||
          specifier.includes("content/scenarios") ||
          specifier.endsWith("/content") ||
          specifier.includes("@/content")
      )
    );
    expect(offenders.map((file) => file.path)).toStrictEqual([]);
  });

  it("has no application module that names a scenario id or a golden path", () => {
    const offenders = ALL_SOURCE.filter((file) =>
      file.source.includes("calibration-balanced-pair") ||
      file.source.includes("mystery-") ||
      file.source.includes("thruster-force-doubling")
    );
    expect(offenders.map((file) => file.path)).toStrictEqual([]);
  });

  it("keeps the content package itself free of JSX", () => {
    const tsx = readdirSync(join(SRC, "content"), { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
      .map((entry) => entry.name);
    expect(tsx).toStrictEqual([]);
  });
});

describe("the learner-facing projection cannot leak a diagnosis", () => {
  const mysteries = SCENARIOS.filter((scenario) => scenario.manifest.familyId === "mystery-cart");

  it("has mystery scenarios to check", () => {
    expect(mysteries.length).toBeGreaterThanOrEqual(1);
  });

  for (const scenario of mysteries) {
    it(`${scenario.manifest.scenarioId}: a reference trial and a suspect trial project identically`, () => {
      const reference = scenario.design.trials.find(
        (trial) => trial.subject === "reference" && trial.configuration.appliedForceNewtons === 2
      )!;
      const suspect = scenario.design.trials.find(
        (trial) => trial.subject === "suspect" && trial.configuration.appliedForceNewtons === 2
      )!;
      const referenceView = toLearnerTrialView(reference);
      const suspectView = toLearnerTrialView(suspect);
      // The same dial settings, so every number a learner can read before the
      // run must match. Anything that differed here would hand over the answer.
      expect(suspectView.declaredForceNewtons).toBe(referenceView.declaredForceNewtons);
      expect(suspectView.appliedForcesNewtons).toStrictEqual(referenceView.appliedForcesNewtons);
      expect(suspectView.positionTargetsMetres).toStrictEqual(referenceView.positionTargetsMetres);
      expect(suspectView.declaredInitialVelocityMetresPerSecond).toBe(
        referenceView.declaredInitialVelocityMetresPerSecond
      );
    });

    it(`${scenario.manifest.scenarioId}: the view has no field that names the cart or its hidden mass`, () => {
      for (const trial of scenario.design.trials) {
        const view = toLearnerTrialView(trial) as unknown as Record<string, unknown>;
        expect(Object.keys(view)).not.toContain("subject");
        expect(Object.keys(view)).not.toContain("hiddenMassKilograms");
        expect(Object.keys(view)).not.toContain("hiddenCause");
      }
    });

    it(`${scenario.manifest.scenarioId}: the cause options carry no correct-answer marker`, () => {
      const options = toLearnerCauseOptions(scenario) as unknown as Record<string, unknown>[];
      expect(options.length).toBe(4);
      for (const option of options) {
        expect(Object.keys(option).sort()).toStrictEqual(["explanation", "id", "label"]);
      }
    });
  }

  it("returns a plain JSON-safe result view with unrounded authoritative values", () => {
    const view = toLearnerResultView("t1", {
      positionMetres: 1.23456,
      velocityMetresPerSecond: 2.5,
      accelerationMetresPerSecondSquared: 1.5,
      netForceNewtons: 3,
      elapsedSeconds: 2,
    });
    expect(view.finalPositionMetres).toBe(1.23456);
    expect(JSON.parse(JSON.stringify(view))).toStrictEqual(view);
  });
});

describe("the typed family mirror tracks the frozen contract", () => {
  it("covers exactly the four contract families, in contract order", () => {
    expect(FAMILY_DEFINITIONS.map((family) => family.id)).toStrictEqual(
      FROZEN_FAMILY_CONTRACT.families.map((family) => family.id)
    );
  });

  for (const family of FROZEN_FAMILY_CONTRACT.families as readonly FrozenFamily[]) {
    it(`${family.id}: name, difficulty levels and graph requirement match`, () => {
      const mirror = FAMILY_DEFINITIONS.find((entry) => entry.id === family.id)!;
      expect(mirror.name).toBe(family.name);
      expect(mirror.primaryConcept).toBe(family.primaryConcept);
      expect(mirror.scienceQuestion).toBe(family.scienceQuestion);
      expect(mirror.independentVariable).toBe(family.independentVariable);
      expect(mirror.dependentVariable).toBe(family.dependentVariable);
      expect(mirror.difficultyLevels).toStrictEqual(family.difficultyLevels);
      expect(mirror.graphRequirement.level).toBe(family.graphRequirement.level);
      expect(mirror.graphRequirement.graphs).toStrictEqual(family.graphRequirement.graphs);
      expect(mirror.graphRequirement.note).toBe(family.graphRequirement.note);
      expect(mirror.answerKeyBounded).toBe(family.answerKeyBounded);
    });
  }
});

describe("the production release gate fails closed on unreviewed content", () => {
  const reviewed: ScenarioFile = {
    ...SCENARIOS[0]!,
    manifest: {
      ...SCENARIOS[0]!.manifest,
      reviewStatus: "reviewed",
      reviewer: "an independent reviewer who has not been invented",
      reviewDate: "2026-09-25",
    },
  };

  it("blocks every scenario in the current set, because none is reviewed", () => {
    const blockers = findReleaseBlockers(SCENARIOS);
    expect(blockers.length).toBe(SCENARIOS.length);
    expect(releaseReadyScenarioIds(SCENARIOS)).toStrictEqual([]);
    expect(() => assertReleaseReady(SCENARIOS)).toThrow(/no completed independent review/);
  });

  it("allows a scenario that carries a named, completed review", () => {
    expect(isReleaseReady(reviewed)).toBe(true);
    expect(releaseReadyScenarioIds([reviewed])).toStrictEqual([
      reviewed.manifest.scenarioId,
    ]);
    expect(() => assertReleaseReady([reviewed])).not.toThrow();
  });

  it("still blocks a scenario marked reviewed with no reviewer named", () => {
    const unnamed: ScenarioFile = {
      ...SCENARIOS[0]!,
      manifest: { ...SCENARIOS[0]!.manifest, reviewStatus: "reviewed", reviewer: null },
    };
    expect(isReleaseReady(unnamed)).toBe(false);
    expect(findReleaseBlockers([unnamed])[0]!.reason).toContain("names no reviewer");
  });
});
