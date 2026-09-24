import Phaser from "phaser";
import type { SceneModel } from "../viewmodel/index.js";
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
import { publishReadback } from "./readback.js";

/**
 * Create and destroy the single Phaser game for the lab region.
 *
 * The host owns this lifecycle. Failure here must never corrupt science/game state:
 * a failed renderer reports itself and the host falls back to a semantic panel that
 * shows the same authoritative numbers (docs/ARCHITECTURE.md §6).
 */

export interface LabGameHandle {
  readonly ready: Promise<void>;
  /** Push the latest typed view model. Read-only projection; presentation only. */
  reconcile: (model: SceneModel) => void;
  resize: (width: number, height: number) => void;
  destroy: () => void;
}

export interface CreateLabGameOptions {
  readonly parent: HTMLElement;
  readonly width: number;
  readonly height: number;
}

export class RendererUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RendererUnavailableError";
  }
}

export function createLabGame(options: CreateLabGameOptions): LabGameHandle {
  resetLabSceneRuntime();
  let destroyed = false;
  let game: Phaser.Game | null = null;

  const ready = new Promise<void>((resolve, reject) => {
    try {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: options.parent,
        width: options.width,
        height: options.height,
        backgroundColor: "#0e1726",
        scene: [LabScene],
        banner: false,
        audio: { noAudio: true },
        input: { activePointers: 1 },
        // The renderer must never try to fetch anything at runtime (docs/PRIVACY.md).
        loader: { imageLoadType: "HTMLImageElement" },
      });

      // Phaser reports canvas/WebGL failures through the game events; surface them.
      game.events.once(Phaser.Core.Events.READY, () => {
        publishReadback(LAB_SCENE_RUNTIME.readback);
        resolve();
      });
      game.events.once(Phaser.Core.Events.DESTROY, () => {
        markSceneDestroyed();
      });

      window.addEventListener("error", (event) => {
        if (destroyed) return;
        markRendererFailure(`Renderer runtime error: ${String(event.message)}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markRendererFailure(message);
      reject(new RendererUnavailableError(`Phaser failed to initialise: ${message}`));
    }
  });

  // A renderer that never becomes ready must not hang the caller forever.
  const readyWithTimeout = Promise.race([
    ready,
    new Promise<void>((_, reject) => {
      setTimeout(() => {
        if (!LAB_SCENE_RUNTIME.readback.ready && !destroyed) {
          markRendererFailure("Renderer did not become ready within the startup budget.");
          reject(new RendererUnavailableError("Renderer startup timed out."));
        }
      }, 8_000);
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
      try {
        game.scale.resize(width, height);
      } catch {
        // A resize failure is presentational only; never fatal to the investigation.
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
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
