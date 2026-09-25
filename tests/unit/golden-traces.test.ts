import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  singleSegmentDeclaration,
  stateAt,
  type SingleSegmentMotionInput,
} from "../../src/science/index.js";

/**
 * Human-readable golden traces for independent science review (GAME-386 AC5).
 *
 * Exact fixture schema is deferred to ML-05 (G-05); these provisional JSON files
 * carry prose (title, equations, rationale) plus machine-checkable expectations.
 */

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/science/golden");

interface ExpectedPoint {
  readonly atSeconds: number;
  readonly state: {
    readonly positionMetres: number;
    readonly velocityMetresPerSecond: number;
    readonly accelerationMetresPerSecondSquared: number;
    readonly netForceNewtons: number;
    readonly elapsedSeconds: number;
  };
}

interface CaseBlock {
  readonly label?: string;
  readonly declaration: SingleSegmentMotionInput;
  readonly expectedStates: readonly ExpectedPoint[];
}

interface GoldenFixture {
  readonly id: string;
  readonly title: string;
  readonly equations: readonly string[];
  readonly rationale: string;
  readonly declaration?: SingleSegmentMotionInput;
  readonly expectedStates?: readonly ExpectedPoint[];
  readonly cases?: readonly CaseBlock[];
}

function loadFixture(name: string): GoldenFixture {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8")) as GoldenFixture;
}

function assertCase(block: CaseBlock): void {
  const declaration = singleSegmentDeclaration(block.declaration);
  for (const point of block.expectedStates) {
    expect(stateAt(declaration, point.atSeconds)).toStrictEqual(point.state);
  }
}

describe("golden science traces are human-readable", () => {
  const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));

  it("ships at least the canonical ML-03 fixtures", () => {
    expect(files.sort()).toEqual(
      [
        "balanced-constant-v.json",
        "force-scaling.json",
        "mass-scaling.json",
        "resistive-declared.json",
        "sign-and-v0.json",
      ].sort()
    );
  });

  it("each fixture carries reviewable prose and equations", () => {
    for (const file of files) {
      const fixture = loadFixture(file);
      expect(fixture.id.length).toBeGreaterThan(0);
      expect(fixture.title.length).toBeGreaterThan(0);
      expect(fixture.rationale.length).toBeGreaterThan(40);
      expect(fixture.equations.length).toBeGreaterThan(0);
      expect(fixture.equations.some((line) => /Fnet|a\s*=|v\(t\)|x\(t\)/.test(line))).toBe(true);
    }
  });
});

describe("golden science traces match the kernel bit-identically", () => {
  for (const file of readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"))) {
    it(file, () => {
      const fixture = loadFixture(file);
      if (fixture.cases) {
        for (const block of fixture.cases) {
          assertCase(block);
        }
        return;
      }
      expect(fixture.declaration).toBeDefined();
      expect(fixture.expectedStates).toBeDefined();
      assertCase({
        declaration: fixture.declaration!,
        expectedStates: fixture.expectedStates!,
      });
    });
  }
});
