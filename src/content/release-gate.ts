/**
 * The production-release gate for canonical content (GAME-389 / ML-05).
 *
 * `docs/PROVENANCE.md` section 1 states the rule this module enforces: a
 * scenario whose `reviewStatus` is not `reviewed` with a named `reviewer` may
 * not ship in a production build.
 *
 * Why it is not wired into `npm run build`
 * ----------------------------------------
 * The honest answer is that no independent science review has happened yet, so
 * wiring this into the build today would make every build fail. Failing
 * forever is not enforcement, it is a broken gate, and a permanently red
 * pipeline teaches people to ignore red.
 *
 * So the rule is implemented, unit-tested against both branches, and
 * deliberately left unconnected to the build until the review that ML-05
 * AC3 requires has actually been performed. The wiring belongs to the release
 * readiness milestone (ML-15 / GAME-399), which is the first place a
 * production build exists to gate. The contract gate in
 * `scripts/verify-contracts.mjs` asserts both halves of this: that the gate
 * exists, and that it is not yet armed.
 */

import type { ScenarioFile } from "./content-types.js";

export interface ReleaseBlocker {
  readonly scenarioId: string;
  readonly reviewStatus: string;
  readonly reason: string;
}

/** True when one scenario carries a completed, attributable review record. */
export function isReleaseReady(scenario: ScenarioFile): boolean {
  return (
    scenario.manifest.reviewStatus === "reviewed" && scenario.manifest.reviewer !== null
  );
}

/** The scenarios that may ship in a production build. */
export function releaseReadyScenarioIds(scenarios: readonly ScenarioFile[]): readonly string[] {
  return scenarios.filter(isReleaseReady).map((scenario) => scenario.manifest.scenarioId);
}

/** Every scenario that may not ship, with the reason. */
export function findReleaseBlockers(
  scenarios: readonly ScenarioFile[]
): readonly ReleaseBlocker[] {
  return scenarios
    .filter((scenario) => !isReleaseReady(scenario))
    .map((scenario) => ({
      scenarioId: scenario.manifest.scenarioId,
      reviewStatus: scenario.manifest.reviewStatus,
      reason:
        scenario.manifest.reviewStatus === "reviewed"
          ? "marked reviewed but names no reviewer"
          : `reviewStatus is "${scenario.manifest.reviewStatus}"; only "reviewed" with a named ` +
            "reviewer may ship",
    }));
}

/**
 * Throw when any scenario in the set may not ship in a production build.
 *
 * Callers that build for production must call this first. Nothing else in the
 * codebase is permitted to decide that unreviewed content is acceptable.
 */
export function assertReleaseReady(scenarios: readonly ScenarioFile[]): void {
  const blockers = findReleaseBlockers(scenarios);
  if (blockers.length === 0) return;
  const summary = blockers
    .map((blocker) => `  - ${blocker.scenarioId} (${blocker.reason})`)
    .join("\n");
  throw new Error(
    `Production release refused: ${blockers.length} scenario(s) have no completed independent ` +
      `review.\n${summary}`
  );
}
