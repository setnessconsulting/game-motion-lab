import Phaser from "phaser";
import type { SceneModel } from "../viewmodel/index.js";
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, sceneGeometry, type SceneGeometry } from "./labGeometry.js";
import {
  publishReadback,
  RENDERER_READBACK_KEY,
  type RendererFailureStage,
  type RendererReadback,
} from "./readback.js";

/**
 * The Motion Lab laboratory scene (GAME-384 / ML-02 bootstrap; extended by GAME-390 / ML-06).
 *
 * Hard boundary (ADR 0002): this file may read the typed view model and draw. It may
 * NOT compute a scientific value, derive one from pixel geometry, or write into domain
 * state. Every metre value it draws comes straight from the view model.
 *
 * ML-06 imposes a second, narrower discipline on top of that boundary, because it is what
 * makes two acceptance criteria structural rather than hopeful:
 *
 *   1. **Nothing here reads frame time.** There is no `delta`, no elapsed clock, and no
 *      tween. Everything drawn comes from `sceneGeometry(model)`, which is a pure function
 *      of the model. The frame loop therefore cannot advance, ease, or drift the picture —
 *      which is AC3 (refresh-rate independence) and AC4 (reduced motion removes motion)
 *      by construction rather than by a conditional.
 *   2. **The drawn geometry is published** through the readback hook, so the real-render
 *      lane can assert that the picture matched the pure function across advancing frames
 *      and across viewport sizes.
 *
 * `scripts/verify-contracts.mjs` checks both: that this file computes geometry through the
 * shared module, and that it contains no frame-time or tween reference. A later milestone
 * that wants animation must change that check deliberately, not slip past it.
 */

export const LAB_SCENE_KEY = "MotionLabLabScene";

/** Left inset of the playback progress rail, in logical pixels. */
const TRACK_RAIL_MARGIN = 40;

const COLORS = {
  background: 0x0e1726,
  track: 0x1f3350,
  trackEdge: 0x35507a,
  tick: 0x4a678f,
  cart: 0x3fb6a8,
  cartDark: 0x2a7f76,
  force: 0xf2a03d,
  balanced: 0x8fa6bd,
  progress: 0x6fd3c4,
  progressTrack: 0x27384f,
  label: "#dbe7f5",
  labelDim: "#93a9c2",
} as const;

const EMPHASIS_LABEL: Record<SceneGeometry["emphasis"], string> = {
  idle: "no trial recorded yet",
  playing: "playing the recorded trial",
  paused: "paused part-way through the recorded window",
  settled: "at the end of the recorded window",
};

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
    failureStage: null,
    geometry: null,
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

export function markRendererFailure(message: string, stage: RendererFailureStage): void {
  LAB_SCENE_RUNTIME.readback.failure = message;
  LAB_SCENE_RUNTIME.readback.failureStage = stage;
  LAB_SCENE_RUNTIME.readback.ready = false;
  publishReadback(LAB_SCENE_RUNTIME.readback);
}

/** Set the model the scene should render. Read-only for the scene; presentation only. */
export function reconcileLabScene(model: SceneModel): void {
  LAB_SCENE_RUNTIME.current = model;
}

export class LabScene extends Phaser.Scene {
  private graphics?: Phaser.GameObjects.Graphics;
  private cartBody?: Phaser.GameObjects.Rectangle;
  private cartWheels: Phaser.GameObjects.Arc[] = [];
  private forceText?: Phaser.GameObjects.Text;
  private progressText?: Phaser.GameObjects.Text;
  private axisText?: Phaser.GameObjects.Text;
  private positionText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: LAB_SCENE_KEY });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.background);

    this.graphics = this.add.graphics();

    this.cartBody = this.add.rectangle(0, 0, 1, 1, COLORS.cart).setDepth(3);
    this.cartWheels = [
      this.add.circle(0, 0, 9, COLORS.cartDark).setDepth(2),
      this.add.circle(0, 0, 9, COLORS.cartDark).setDepth(2),
    ];

    // Direction is stated in words as well as an arrow, never by colour alone
    // (docs/ACCESSIBILITY.md §6). The words come from the model's own direction convention
    // (ML-07 AC5), so they are set in reconcile() rather than inlined here: the axis and the
    // force labels cannot then state the direction differently.
    this.axisText = this.add
      .text(LOGICAL_WIDTH - 40, 26, "", {
        fontFamily: "monospace",
        fontSize: "15px",
        color: COLORS.label,
      })
      .setOrigin(1, 0.5)
      .setDepth(4);

    this.forceText = this.add
      .text(LOGICAL_WIDTH / 2, 58, "", {
        fontFamily: "monospace",
        fontSize: "18px",
        color: COLORS.label,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4);

    this.progressText = this.add
      .text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 44, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: COLORS.labelDim,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(4);

    this.positionText = this.add
      .text(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT - 20, "", {
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

  /**
   * The frame loop. Note what it does NOT do: it reads no frame time, so it cannot ease,
   * extrapolate, interpolate, or drift. Each frame redraws the same picture for the same
   * model.
   */
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

    const geometry = sceneGeometry(model);
    const { track, cart, force } = geometry;

    graphics.clear();

    // Progress rail: presentation feedback about the playback position only. It is derived
    // from the model's active sample index and cannot move a measurement.
    const railY = LOGICAL_HEIGHT - 60;
    const railWidth = LOGICAL_WIDTH - TRACK_RAIL_MARGIN * 2;
    graphics.fillStyle(COLORS.progressTrack, 1);
    graphics.fillRect(TRACK_RAIL_MARGIN, railY, railWidth, 4);
    if (geometry.playedFraction > 0) {
      graphics.fillStyle(COLORS.progress, 1);
      graphics.fillRect(TRACK_RAIL_MARGIN, railY, railWidth * geometry.playedFraction, 4);
    }

    // Track bed.
    graphics.fillStyle(COLORS.track, 1);
    graphics.fillRect(track.startX, track.y, track.width, track.height);
    graphics.lineStyle(1, COLORS.trackEdge, 1);
    graphics.strokeRect(track.startX, track.y, track.width, track.height);

    // Tick marks every metre, so the track scale is legible without relying on colour.
    graphics.lineStyle(1, COLORS.tick, 0.7);
    for (const tickX of track.tickXs) {
      graphics.lineBetween(tickX, track.y + 12, tickX, track.y + 20);
    }

    this.cartBody?.setPosition(cart.centerX, cart.centerY);
    this.cartBody?.setSize(cart.width, cart.height);
    this.cartWheels[0]?.setPosition(cart.rearWheelX, cart.wheelY);
    this.cartWheels[1]?.setPosition(cart.frontWheelX, cart.wheelY);

    // Force arrow: direction is encoded three times over — arrow geometry, the sign of the
    // displacement, and the words in the label (never colour alone).
    if (force.fromX !== null && force.toX !== null && force.magnitude > 0) {
      const sign = force.direction === "positive" ? 1 : -1;
      const colour = COLORS.force;
      graphics.lineStyle(5, colour, 1);
      graphics.lineBetween(force.fromX, cart.centerY, force.toX, cart.centerY);
      graphics.fillStyle(colour, 1);
      graphics.fillTriangle(
        force.toX,
        cart.centerY,
        force.toX - sign * force.headLength,
        cart.centerY - force.headHalfHeight,
        force.toX - sign * force.headLength,
        cart.centerY + force.headHalfHeight
      );
    }

    this.forceText?.setText(model.forceArrow.label);
    this.progressText?.setText(
      `playback: ${EMPHASIS_LABEL[geometry.emphasis]} (${Math.round(
        geometry.playedFraction * 100
      )}%)`
    );
    // The canvas status line is the model's own instrument text, not a second formatting of the
    // same numbers. A learner reading the picture and a learner reading the DOM therefore cannot
    // be shown different values, and no unit string is written by hand here.
    const positionReading = model.readouts.find((readout) => readout.id === "position");
    const velocityReading = model.readouts.find((readout) => readout.id === "velocity");
    const lengthUnit = positionReading?.unit ?? "";
    this.axisText?.setText(`\u2192 ${model.directionAxis}`);
    this.positionText?.setText(
      `${positionReading?.label ?? "Position"} ${positionReading?.text ?? ""}  |  ` +
        `${velocityReading?.label ?? "Velocity"} ${velocityReading?.text ?? ""}  |  ` +
        `track to ${track.endMetres.toFixed(1)} ${lengthUnit}`
    );

    const displaySize = this.scale.displaySize;
    LAB_SCENE_RUNTIME.readback.lastModel = {
      activeIndex: model.playback.activeIndex,
      positionMetres: model.cart.positionMetres,
      velocityMetresPerSecond: model.cart.velocityMetresPerSecond,
      trackEndMetres: track.endMetres,
      reducedMotion: model.reducedMotion,
    };
    LAB_SCENE_RUNTIME.readback.geometry = {
      logicalWidth: geometry.logicalWidth,
      logicalHeight: geometry.logicalHeight,
      pixelsPerMetre: track.pixelsPerMetre,
      cartCenterX: cart.centerX,
      cartCenterY: cart.centerY,
      trackStartX: track.startX,
      trackEndX: track.endX,
      forceFromX: force.fromX,
      forceToX: force.toX,
      emphasis: geometry.emphasis,
      playedFraction: geometry.playedFraction,
      viewportWidth: displaySize.width,
      viewportHeight: displaySize.height,
    };
  }
}

/** Called by the host after the Phaser game is destroyed. */
export function clearRendererReadback(): void {
  if (typeof window !== "undefined") delete window[RENDERER_READBACK_KEY];
}
