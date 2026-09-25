/**
 * Renderer failure stages, their learner-facing explanations, and the recovery each one
 * gets (GAME-390 / ML-06).
 *
 * This lives outside the component so the policy can be asserted in a Node unit test. That
 * matters for exactly one decision: a chunk-load failure must NOT be offered an in-place
 * retry, because a failed dynamic import is remembered by the browser for the life of the
 * page and re-importing the same specifier rejects without issuing a request. The measured
 * evidence is in `RendererRegion.tsx` and in `tests/e2e/realRender.spec.ts`. A test that
 * states the split is what stops a later well-meaning edit from restoring a button that
 * provably does nothing.
 *
 * `FAILURE_EXPLANATION` is a total `Record`, so TypeScript already refuses a new stage
 * without copy. The unit test re-asserts it at runtime because a stage that reached a
 * learner with no explanation would render as "undefined" in a fallback.
 */

import type { RendererFailureStage } from "../renderer/readback.js";

/** The stages the host can distinguish: the renderer's own, plus the chunk load. */
export type HostFailureStage = RendererFailureStage | "chunk-load";

export const HOST_FAILURE_STAGES: readonly HostFailureStage[] = [
  "chunk-load",
  "initialise",
  "startup-timeout",
  "runtime",
];

/** Stages the renderer itself can report (everything except the chunk load the host detects). */
export const RENDERER_STAGES: readonly RendererFailureStage[] = [
  "initialise",
  "startup-timeout",
  "runtime",
];

export const FAILURE_EXPLANATION: Record<HostFailureStage, string> = {
  "chunk-load": "The animated view could not be downloaded.",
  initialise: "The animated view could not start on this device.",
  "startup-timeout": "The animated view did not start within its time budget.",
  runtime: "The animated view stopped unexpectedly.",
};

export function isRendererStage(value: unknown): value is RendererFailureStage {
  return typeof value === "string" && (RENDERER_STAGES as readonly string[]).includes(value);
}

/** How the learner can ask for the animated view again, per stage. */
export type RendererRecovery = "retry-in-place" | "reload-page";

/**
 * The recovery offered for a stage.
 *
 * A chunk download that failed cannot be retried from the same page: the browser caches the
 * failure in the module map, so a second import of the same specifier rejects without a
 * request (measured — see the PR for GAME-390). A new page gets a new module map, so a reload
 * is the only recovery that can work there. Every other stage recreates the renderer in
 * place, which does work.
 *
 * The reload costs the session, because trial records are not stored (docs/PRIVACY.md); the
 * fallback states that before the click.
 */
export function rendererRecoveryFor(stage: HostFailureStage | null): RendererRecovery {
  return stage === "chunk-load" ? "reload-page" : "retry-in-place";
}

/** The learner-facing explanation for a stage, with a safe fallback for an unknown stage. */
export function failureExplanationFor(stage: HostFailureStage | null): string {
  if (stage === null) return "The animated view is unavailable.";
  return FAILURE_EXPLANATION[stage] ?? "The animated view is unavailable.";
}
