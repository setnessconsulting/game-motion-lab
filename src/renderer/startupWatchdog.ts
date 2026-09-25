/**
 * The renderer startup budget, as a separately testable policy (GAME-390 / ML-06).
 *
 * A renderer that never becomes ready must not hang the host, so `createLabGame` races its
 * readiness promise against a timer. That timer used to be three lines inline inside the
 * factory, which meant the one failure stage no browser lane can reach — a renderer that
 * creates but never attaches — was also the one whose policy was never tested. The handoff
 * recorded that as an open gap; this module closes it.
 *
 * The policy is deliberately not "cancel the timer when ready arrives". It fires and then
 * decides, because a decision made at firing time cannot depend on the ordering of a cancel
 * against a ready resolution. Three guards, all after the delay has elapsed:
 *
 *   1. do nothing if the renderer became ready — a slow start that still started is not a
 *      failure, and reporting one would replace a working view with a fallback;
 *   2. do nothing if the renderer was destroyed — a "Try again" and its predecessor must not
 *      produce a timeout for a renderer nobody is waiting for;
 *   3. otherwise report the timeout.
 *
 * `schedule` and `cancel` are injectable so a Node test can drive the real policy with fake
 * timers instead of waiting eight seconds, and so the budget itself is a parameter rather
 * than a constant nobody can reach. No browser is required to load this file.
 */

/** The default startup budget, in milliseconds. */
export const RENDERER_STARTUP_BUDGET_MS = 8_000;

export interface StartupWatchdogOptions {
  /** How long the renderer is given to become ready. Non-finite or negative means "now". */
  readonly budgetMs: number;
  /** True once the renderer has attached and is drawing. */
  readonly isReady: () => boolean;
  /** True once the renderer has been destroyed or the attempt abandoned. */
  readonly isCancelled?: () => boolean;
  /** Called at most once, only when the budget elapsed with neither guard set. */
  readonly onTimeout: () => void;
  /** Injected by tests; defaults to `setTimeout`. */
  readonly schedule?: (handler: () => void, ms: number) => ReturnType<typeof setTimeout>;
  /** Injected by tests; defaults to `clearTimeout`. */
  readonly cancelTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface StartupWatchdog {
  /** Drop the pending timer. Idempotent, and safe to call before or after firing. */
  readonly cancel: () => void;
}

function normaliseBudget(budgetMs: number): number {
  if (!Number.isFinite(budgetMs)) return 0;
  return Math.max(0, budgetMs);
}

/**
 * Arm the startup budget. Returns a handle whose `cancel` removes the pending timer.
 *
 * The timer always fires and then decides, so the only way `onTimeout` is skipped is a guard
 * being set at firing time — not a cancel winning a race by luck.
 */
export function startStartupWatchdog(options: StartupWatchdogOptions): StartupWatchdog {
  const schedule = options.schedule ?? ((handler, ms) => setTimeout(handler, ms));
  const cancelTimer = options.cancelTimer ?? ((handle) => clearTimeout(handle));

  let fired = false;
  let cancelled = false;

  const handle = schedule(() => {
    if (cancelled || fired) return;
    fired = true;
    if (options.isReady()) return;
    if (options.isCancelled?.()) return;
    options.onTimeout();
  }, normaliseBudget(options.budgetMs));

  return {
    cancel() {
      if (cancelled) return;
      cancelled = true;
      cancelTimer(handle);
    },
  };
}
