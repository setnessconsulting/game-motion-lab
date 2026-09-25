import { describe, expect, it } from "vitest";
import {
  FAILURE_EXPLANATION,
  HOST_FAILURE_STAGES,
  RENDERER_STAGES,
  failureExplanationFor,
  isRendererStage,
  rendererRecoveryFor,
  type HostFailureStage,
} from "../../src/host/recovery.js";

/**
 * The renderer recovery policy (GAME-390 / ML-06).
 *
 * AC5 says a renderer failure produces a recoverable semantic UI state. The word that
 * matters is reachable: the first version of that fallback offered an in-place retry for a
 * chunk-load failure, which provably cannot work, because the browser remembers the failed
 * dynamic import for the life of the page. These assertions exist so the split cannot be
 * quietly flattened back into one button by a later edit that has not seen the evidence.
 */

describe("renderer recovery", () => {
  it("recovers a chunk-load failure by reloading the page", () => {
    expect(rendererRecoveryFor("chunk-load")).toBe("reload-page");
  });

  it.each(["initialise", "startup-timeout", "runtime"] as const)(
    "recovers a %s failure in place",
    (stage) => {
      expect(rendererRecoveryFor(stage)).toBe("retry-in-place");
    }
  );

  it("never promises an in-place retry of a failed module download", () => {
    // Stated as a separate assertion because it is the finding, not an implementation
    // detail: if this ever changes, the change must come with a new measurement.
    const inPlace = HOST_FAILURE_STAGES.filter(
      (stage) => rendererRecoveryFor(stage) === "retry-in-place"
    );
    expect(inPlace).not.toContain("chunk-load");
    expect(inPlace).toHaveLength(HOST_FAILURE_STAGES.length - 1);
  });

  it("treats an unknown or absent stage as an in-place retry", () => {
    // Nothing is known to be wrong with the page context, so a fresh renderer is the first
    // thing to try rather than throwing the learner's session away.
    expect(rendererRecoveryFor(null)).toBe("retry-in-place");
  });
});

describe("failure stages", () => {
  it("explains every stage a learner can be shown", () => {
    for (const stage of HOST_FAILURE_STAGES) {
      const explanation = FAILURE_EXPLANATION[stage];
      expect(explanation).toBeTruthy();
      expect(explanation).toContain("animated view");
    }
  });

  it("falls back to a real sentence rather than rendering 'undefined'", () => {
    expect(failureExplanationFor(null)).toBe("The animated view is unavailable.");
    expect(failureExplanationFor("not-a-stage" as HostFailureStage)).toBe(
      "The animated view is unavailable."
    );
  });

  it("keeps the host stage list and the renderer stage list in step", () => {
    // A stage added to one list and not the other would either be unattributable (the host
    // would file it as a chunk load) or unexplained at runtime.
    expect([...HOST_FAILURE_STAGES].sort()).toStrictEqual(
      [...RENDERER_STAGES, "chunk-load"].sort()
    );
  });

  it("recognises only stages the renderer can actually report", () => {
    for (const stage of RENDERER_STAGES) {
      expect(isRendererStage(stage)).toBe(true);
    }
    // The chunk load is detected by the host. If the renderer ever claimed it, the
    // attribution rule in RendererRegion would file a real download failure as something
    // else — or the reverse.
    expect(isRendererStage("chunk-load")).toBe(false);
    for (const junk of ["", "bogus", 42, null, undefined, {}, []]) {
      expect(isRendererStage(junk)).toBe(false);
    }
  });
});
