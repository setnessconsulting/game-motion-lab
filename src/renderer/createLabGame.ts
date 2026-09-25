import Phaser from "phaser";
import type { SceneModel } from "../viewmodel/index.js";
import { fitViewport, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./labGeometry.js";
import {
  LAB_SCENE_KEY,
  LAB_SCENE_RUNTIME,
  LabScene,
  clearRendererReadback,
  markRendererFailure,
  markSceneDestroyed,
  reconcileLabScene,
  resetLabSceneRuntime,
} from "./labScene.js";
import { publishReadback, type RendererFailureStage } from "./readback.js";
import { RENDERER_STARTUP_BUDGET_MS, startStartupWatchdog } from "./startupWatchdog.js";

/**
 * Create and destroy the single Phaser game for the lab region.
 *
 * The host owns this lifecycle. Failure here must never corrupt science/game state: a
 * failed renderer reports itself, and the host falls back to a semantic panel that shows
 * the same authoritative numbers (docs/ARCHITECTURE.md §6, docs/ACCESSIBILITY.md §2).
 *
 * GAME-390 / ML-06 hardened three things:
 *
 *   1. **Scaling.** The game runs in a fixed logical space and Phaser fits it into the
 *      parent box, so the geometry has no viewport input and nothing scientific can be
 *      derived from screen size. `resize` sanitises the container box, because a real
 *      layout does hand over zero, negative, and NaN during mount and collapse.
 *   2. **Recoverable failure.** Every failure path reports a *stage* — chunk load,
 *      initialisation, startup timeout, or a runtime throw after ready — and notifies the
 *      host through `onFailure`. A stage the host can name is a stage the host can retry,
 *      which is what makes "recoverable" more than a word in the acceptance criteria.
 *   3. **No listener leak.** The runtime-error listener is removed on destroy. Without
 *      that, each "Try again" would add another listener to the same window and the count
 *      would grow with every retry.
 */

export interface LabGameHandle {
  readonly ready: Promise<void>;
  /** Push the latest typed view model. Read-only projection; presentation only. */
  reconcile: (model: SceneModel) => void;
  /** Fit the logical space into the given container box, in CSS pixels. */
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

export interface CreateLabGameOptions {
  readonly parent: HTMLElement;
  readonly width: number;
  readonly height: number;
  /**
   * Called when the renderer fails *after* this function returned, which the caller
   * cannot otherwise observe. Initiation-time failures are still reported by the
   * rejected `ready` promise.
   */
  readonly onFailure?: (failure: { stage: RendererFailureStage; message: string }) => void;
  /**
   * Override the startup budget, in milliseconds. Present so the budget is a parameter of the
   * factory rather than a constant buried in a timer; the host does not override it.
   */
  readonly startupBudgetMs?: number;
}

export class RendererUnavailableError extends Error {
  readonly stage: RendererFailureStage;

  constructor(message: string, stage: RendererFailureStage) {
    super(message);
    this.name = "RendererUnavailableError";
    this.stage = stage;
  }
}

export function createLabGame(options: CreateLabGameOptions): LabGameHandle {
  resetLabSceneRuntime();
  let destroyed = false;
  let game: Phaser.Game | null = null;

  const reportFailure = (stage: RendererFailureStage, message: string): void => {
    markRendererFailure(message, stage);
    options.onFailure?.({ stage, message });
  };

  /** Attached here and detached in `destroy` so retries cannot accumulate listeners. */
  const onWindowError = (event: ErrorEvent): void => {
    if (destroyed) return;
    reportFailure("runtime", `Renderer runtime error: ${String(event.message)}`);
  };

  const ready = new Promise<void>((resolve, reject) => {
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: options.parent,
        width: LOGICAL_WIDTH,
        height: LOGICAL_HEIGHT,
        backgroundColor: "#0e1726",
        scene: [LabScene],
        banner: false,
        audio: { noAudio: true },
        input: { activePointers: 1 },
        // The renderer must never try to fetch anything at runtime (docs/PRIVACY.md).
        loader: { imageLoadType: "HTMLImageElement" },
        // The logical space is fixed and Phaser fits it into the parent box, so the canvas
        // is responsive without any screen dimension reaching the geometry inputs.
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: LOGICAL_WIDTH,
          height: LOGICAL_HEIGHT,
        },
      });

      // Phaser reports canvas/WebGL failures through the game events; surface them.
      game.events.once(Phaser.Core.Events.READY, () => {
        publishReadback(LAB_SCENE_RUNTIME.readback);
        resolve();
      });
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        markSceneDestroyed();
      });

      // An initialisation throw that Phaser swallows would leave a blank canvas and a
      // silently "ready" region, so a canvas is required before this is called ready.
      if (!game.canvas) {
        throw new Error("Phaser did not create a canvas element.");
      }

      window.addEventListener("error", onWindowError);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportFailure("initialise", message);
      reject(new RendererUnavailableError(`Phaser failed to initialise: ${message}`, "initialise"));
    }
  });

  // A renderer that never becomes ready must not hang the caller forever. The policy lives in
  // its own module so it can be driven by a Node test with fake timers — this is the one
  // failure stage no browser lane can reach, and it was previously the one whose policy was
  // also untested.
  let cancelWatchdog: () => void = () => {};
  const readyWithTimeout = Promise.race([
    ready,
    new Promise<void>((_, reject) => {
      cancelWatchdog = startStartupWatchdog({
        budgetMs: options.startupBudgetMs ?? RENDERER_STARTUP_BUDGET_MS,
        isReady: () => LAB_SCENE_RUNTIME.readback.ready,
        isCancelled: () => destroyed,
        onTimeout: () => {
          reportFailure(
            "startup-timeout",
            "Renderer did not become ready within the startup budget."
          );
          reject(
            new RendererUnavailableError("Renderer startup timed out.", "startup-timeout")
          );
        },
      }).cancel;
    }),
  ]);

  return {
    ready: readyWithTimeout,
    reconcile(model) {
      if (destroyed) return;
      reconcileLabScene(model);
      publishReadback(LAB_SCENE_RUNTIME.readback);
    },
    resize(width, height) {
      if (destroyed || !game) return;
      const fitted = fitViewport(width, height);
      try {
        // FIT mode keeps the logical space at LOGICAL_WIDTH x LOGICAL_HEIGHT and scales
        // the canvas into the parent box, so this recomputes the fit; it never changes the
        // logical size, and therefore cannot move a single metre value.
        game.scale.setParentSize(fitted.width, fitted.height);
        game.scale.refresh();
      } catch {
        // A resize failure is presentational only; never fatal to the investigation.
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelWatchdog();
      if (typeof window !== "undefined") window.removeEventListener("error", onWindowError);
      try {
        game?.destroy(true);
      } catch {
        // Ignore double-destroy.
      }
      game = null;
      markSceneDestroyed();
      clearRendererReadback();
    },
  };
}

export { LAB_SCENE_KEY };
