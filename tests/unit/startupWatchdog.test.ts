import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RENDERER_STARTUP_BUDGET_MS,
  startStartupWatchdog,
} from "../../src/renderer/startupWatchdog.js";

/**
 * The startup budget (GAME-390 / ML-06).
 *
 * This is the one renderer failure stage no browser lane can reach: it means "the renderer
 * was created but never attached", which cannot be produced by blocking a request or by
 * throwing. Until this file existed, the stage was also the one whose policy was untested —
 * the timer logic lived inside the Phaser factory, where a Node test cannot follow it.
 * Extracting the policy is what makes the failure path checkable at all.
 */

afterEach(() => {
  vi.useRealTimers();
});

interface Armed {
  ready: boolean;
  cancelled: boolean;
  timeouts: number;
  readonly setReady: (value: boolean) => void;
  readonly setCancelled: (value: boolean) => void;
  readonly cancel: () => void;
}

/** Arm the real policy with mutable guards, under fake timers. */
function arm(budgetMs: number = RENDERER_STARTUP_BUDGET_MS): Armed {
  const state = {
    ready: false,
    cancelled: false,
    timeouts: 0,
    setReady: (value: boolean) => {
      state.ready = value;
    },
    setCancelled: (value: boolean) => {
      state.cancelled = value;
    },
    cancel: () => {},
  };
  const handle = startStartupWatchdog({
    budgetMs,
    isReady: () => state.ready,
    isCancelled: () => state.cancelled,
    onTimeout: () => {
      state.timeouts += 1;
    },
  });
  state.cancel = handle.cancel;
  return state;
}

describe("the renderer startup budget", () => {
  it("reports a timeout when the renderer never becomes ready", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    expect(watchdog.timeouts).toBe(0);
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS);
    expect(watchdog.timeouts).toBe(1);
  });

  it("stays silent when the renderer became ready first", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    watchdog.setReady(true);
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS);
    // A slow start that still started is not a failure: reporting one would replace a
    // working view with a fallback.
    expect(watchdog.timeouts).toBe(0);
  });

  it("stays silent when it becomes ready at the last moment", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS - 1);
    expect(watchdog.timeouts).toBe(0);
    watchdog.setReady(true);
    vi.advanceTimersByTime(1);
    expect(watchdog.timeouts).toBe(0);
  });

  it("stays silent when the renderer was destroyed first", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    watchdog.setCancelled(true);
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS);
    // Otherwise a retry would report a timeout for the renderer it replaced.
    expect(watchdog.timeouts).toBe(0);
  });

  it("stays silent when it is cancelled", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    watchdog.cancel();
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS * 3);
    expect(watchdog.timeouts).toBe(0);
  });

  it("fires exactly once, however long time runs on", () => {
    vi.useFakeTimers();
    const watchdog = arm();
    vi.advanceTimersByTime(RENDERER_STARTUP_BUDGET_MS * 5);
    expect(watchdog.timeouts).toBe(1);
  });

  it("uses the budget it was given, not a fixed constant", () => {
    vi.useFakeTimers();
    const watchdog = arm(50);
    vi.advanceTimersByTime(49);
    expect(watchdog.timeouts).toBe(0);
    vi.advanceTimersByTime(1);
    expect(watchdog.timeouts).toBe(1);
  });

  it("treats a non-finite or negative budget as immediate rather than never", () => {
    vi.useFakeTimers();
    for (const budget of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const watchdog = arm(budget);
      vi.advanceTimersByTime(1);
      // "Never" is the dangerous reading: a renderer that never becomes ready would then
      // hang the host instead of degrading to the semantic fallback.
      expect(watchdog.timeouts).toBe(1);
    }
  });
});
