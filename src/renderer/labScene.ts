import Phaser from "phaser";
import type { SceneModel } from "../viewmodel/index.js";
import { publishReadback, RENDERER_READBACK_KEY, type RendererReadback } from "./readback.js";

/**
 * The Motion Lab laboratory scene.
 *
 * Hard boundary (ADR 0002): this file may read the typed view model and draw. It may
 * NOT compute a scientific value, derive one from pixel geometry, or write into
 * domain state. Every metre value it draws comes straight from the view model, and the
 * only thing it publishes outward is the qualification readback.
 *
 * This is the ML-02 bootstrap scene. The production lab renderer is GAME-390 (ML-06).
 */

export const LAB_SCENE_KEY = "MotionLabLabScene";

const LOGICAL_WIDTH = 720;
const LOGICAL_HEIGHT = 320;

const COLORS = {
  background: 0x0e1726,
  track: 0x1f3350,
  trackEdge: 0x35507a,
  tick: 0x4a678f,
  cart: 0x3fb6a8,
  cartDark: 0x2a7f76,
  force: 0xf2a03d,
  balanced: 0x8fa6bd,
  label: "#dbe7f5",
  labelDim: "#93a9c2",
} as const;

interface SceneRuntime {
  readback: RendererReadback;
  current: SceneModel | null;
}

function emptyReadback(): RendererReadback {
  return {
    ready: false,
    sceneKey: LAB_SCENE_KEY,
    frames: 0,
    destroyed: false,
    lastModel: null,
    failure: null,
  };
}

export const LAB_SCENE_RUNTIME: SceneRuntime = {
  readback: emptyReadback(),
  current: null,
};

export function resetLabSceneRuntime(): void {
  LAB_SCENE_RUNTIME.current = null;
  LAB_SCENE_RUNTIME.readback = emptyReadback();
}

export function markSceneDestroyed(): void {
  LAB_SCENE_RUNTIME.readback.destroyed = true;
}

export function markRendererFailure(message: string): void {
  LAB_SCENE_RUNTIME.readback.failure = message;
  LAB_SCENE_RUNTIME.readback.ready = false;
  publishReadback(LAB_SCENE_RUNTIME.readback);
}

/** Set the model the scene should render. Read-only for the scene; presentation only. */
export function reconcileLabScene(model: SceneModel): void {
  LAB_SCENE_RUNTIME.current = model;
}

function toCanvasX(positionMetres: number, trackEndMetres: number): number {
  const margin = 40;
  const usable = LOGICAL_WIDTH - margin * 2;
  const clamped = Math.min(Math.max(positionMetres, 0), trackEndMetres);
  return margin + (clamped / Math.max(trackEndMetres, 0.0001)) * usable;
}

export class LabScene extends Phaser.Scene {
  private graphics?: Phaser.GameObjects.Graphics;
  private cartBody?: Phaser.GameObjects.Rectangle;
  private cartWheels: Phaser.GameObjects.Arc[] = [];
  private forceText?: Phaser.GameObjects.Text;
  private positionText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: LAB_SCENE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    this.graphics = this.add.graphics();

    this.cartBody = this.add.rectangle(0, 0, 74, 38, COLORS.cart).setDepth(3);
    this.cartWheels = [
      this.add.circle(0, 0, 9, COLORS.cartDark).setDepth(2),
      this.add.circle(0, 0, 9, COLORS.cartDark).setDepth(2),
    ];

    // Direction is stated in words as well as an arrow, never by colour alone.
    this.add
      .text(LOGICAL_WIDTH - 40, 30, "\u2192 +x (right is positive)", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: COLORS.label,
      })
      .setOrigin(1, 0.5)
      .setDepth(4);

    this.forceText = this.add
      .text(LOGICAL_WIDTH / 2, 62, "", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: COLORS.label,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4);

    this.positionText = this.add
      .text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 26, "", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: COLORS.labelDim,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4);

    LAB_SCENE_RUNTIME.readback.ready = true;
    publishReadback(LAB_SCENE_RUNTIME.readback);
    this.reconcile();
  }

  override update(): void {
    if (LAB_SCENE_RUNTIME.readback.destroyed) return;
    LAB_SCENE_RUNTIME.readback.frames += 1;
    this.reconcile();
  }

  /** Draw the current model. Reads only; never writes to domain state. */
  private reconcile(): void {
    const model = LAB_SCENE_RUNTIME.current;
    const graphics = this.graphics;
    if (!model || !graphics) return;

    const { startMetres, endMetres } = model.track;
    const trackY = LOGICAL_HEIGHT - 76;
    const margin = 40;
    const usable = LOGICAL_WIDTH - margin * 2;

    graphics.clear();

    // Track bed.
    graphics.fillStyle(COLORS.track, 1);
    graphics.fillRect(margin, trackY, usable, 10);
    graphics.lineStyle(1, COLORS.trackEdge, 1);
    graphics.strokeRect(margin, trackY, usable, 10);

    // Tick marks every metre, so the track scale is legible without colour.
    const ticks = Math.max(1, Math.floor(endMetres - startMetres));
    for (let tick = 0; tick <= ticks; tick += 1) {
      const x = margin + (tick / Math.max(ticks, 1)) * usable;
      graphics.lineStyle(1, COLORS.tick, 0.7);
      graphics.lineBetween(x, trackY + 12, x, trackY + 20);
    }

    const cartX = toCanvasX(model.cart.positionMetres, endMetres);
    const cartY = trackY - 24;

    this.cartBody?.setPosition(cartX, cartY);
    const leftWheel = this.cartWheels[0];
    const rightWheel = this.cartWheels[1];
    leftWheel?.setPosition(cartX - 22, cartY + 22);
    rightWheel?.setPosition(cartX + 22, cartY + 22);

    // Force arrow: direction is encoded redundantly by arrow geometry, the sign, and
    // the words in the label text (never colour alone).
    const arrow = model.forceArrow;
    const magnitude = Math.min(Math.abs(arrow.newtons), 12);
    const length = arrow.direction === "balanced" ? 0 : 20 + magnitude * 6;
    const colour = arrow.direction === "balanced" ? COLORS.balanced : COLORS.force;
    if (length > 0) {
      const sign = arrow.direction === "positive" ? 1 : -1;
      const startX = cartX + sign * 40;
      const endX = startX + sign * length;
      graphics.lineStyle(5, colour, 1);
      graphics.lineBetween(startX, cartY, endX, cartY);
      graphics.fillStyle(colour, 1);
      graphics.fillTriangle(
        endX,
        cartY,
        endX - sign * 14,
        cartY - 9,
        endX - sign * 14,
        cartY + 9
      );
    }

    this.forceText?.setText(arrow.label);
    this.positionText?.setText(
      `position ${model.cart.positionMetres.toFixed(2)} m  |  ` +
        `velocity ${model.cart.velocityMetresPerSecond.toFixed(2)} m/s  |  ` +
        `track to ${endMetres.toFixed(1)} m`
    );

    LAB_SCENE_RUNTIME.readback.lastModel = {
      activeIndex: model.playback.activeIndex,
      positionMetres: model.cart.positionMetres,
      velocityMetresPerSecond: model.cart.velocityMetresPerSecond,
      trackEndMetres: endMetres,
      reducedMotion: model.reducedMotion,
    };
  }
}

/** Called by the host after the Phaser game is destroyed. */
export function clearRendererReadback(): void {
  if (typeof window !== "undefined") delete window[RENDERER_READBACK_KEY];
}
