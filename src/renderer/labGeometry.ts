import type { SceneModel } from "../viewmodel/index.js";

/**
 * Presentation geometry for the lab scene (GAME-390 / ML-06).
 *
 * This module is deliberately **free of Phaser and of the DOM**. Everything the scene
 * draws is computed here, from the view model alone, as a pure function. That is not a
 * style preference — it is what makes ML-06 acceptance criterion 3 checkable:
 *
 * > The same domain trace renders consistently independent of refresh rate within visual
 * > tolerances.
 *
 * The way to make that true is to make the mapping a function of the model and of
 * nothing else. There is no frame count, no frame delta, no elapsed wall-clock time, no
 * device pixel ratio, and no random value in this file's inputs, so geometry *cannot*
 * vary with frame cadence. The Vitest suite proves the function is deterministic; the
 * real-render lane proves the drawn output matches it while frames advance.
 *
 * Metres come in from the model. Pixels come out. Nothing converts back: no value in this
 * module is ever read back into the science or domain layers, and the renderer package is
 * not importable from them (docs/ARCHITECTURE.md §3).
 */

/** The scene's logical coordinate space. Fixed, so geometry never depends on the screen. */
export const LOGICAL_WIDTH = 720;
export const LOGICAL_HEIGHT = 320;

/** Horizontal inset of the scene content within the logical space, in logical pixels. */
export const TRACK_MARGIN = 40;

/** Vertical centre of the cart's wheels. */
const TRACK_Y = LOGICAL_HEIGHT - 76;
const CART_WIDTH = 74;
const CART_HEIGHT = 38;
const CART_WHEEL_RADIUS = 9;
const CART_WHEEL_INSET = 22;
const CART_HALF_WIDTH = CART_WIDTH / 2;
/** Arrow length is capped at the largest net force the frozen physics range allows. */
const FORCE_FULL_SCALE_NEWTONS = 12;
const ARROW_BASE_LENGTH = 16;
const ARROW_PIXELS_PER_NEWTON = 4;
const ARROW_GAP = 6;
const MAX_ARROW_LENGTH = ARROW_BASE_LENGTH + FORCE_FULL_SCALE_NEWTONS * ARROW_PIXELS_PER_NEWTON;

/**
 * Room reserved on each side of the track for the longest force arrow at full scale.
 *
 * This is not decoration. A headless unit test caught the earlier configuration drawing
 * the arrow past the right edge of the canvas whenever the cart was near the end of the
 * track at a large force — the arrow was simply clipped off-screen, which silently removed
 * the magnitude encoding exactly when it mattered. Reserving the room makes containment a
 * property of the mapping instead of a coincidence at small forces.
 */
const ARROW_ROOM = CART_HALF_WIDTH + ARROW_GAP + MAX_ARROW_LENGTH;

/** The drawable track span. Every metre-derived x lands inside it. */
export const TRACK_START_X = TRACK_MARGIN + ARROW_ROOM;
export const TRACK_END_X = LOGICAL_WIDTH - TRACK_MARGIN - ARROW_ROOM;

export type SceneEmphasis = "idle" | "playing" | "paused" | "settled";

export interface ViewportFit {
  /** The size the renderer was asked to fit into, sanitised to finite non-negative values. */
  readonly width: number;
  readonly height: number;
  /** Uniform scale applied to the logical space. Always finite and positive. */
  readonly scale: number;
}

export interface TrackGeometry {
  readonly startX: number;
  readonly endX: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Logical pixels per metre. The scale is legible from the ticks, not from colour. */
  readonly pixelsPerMetre: number;
  readonly startMetres: number;
  readonly endMetres: number;
  /** One tick per whole metre, ascending, inside the drawable span. */
  readonly tickXs: readonly number[];
}

export interface CartGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
  readonly frontWheelX: number;
  readonly rearWheelX: number;
  readonly wheelY: number;
  readonly wheelRadius: number;
}

export interface ForceVectorGeometry {
  readonly direction: "positive" | "negative" | "balanced";
  readonly newtons: number;
  readonly magnitude: number;
  /** Null when the forces balance: a balanced cart has no arrow, not a zero-length one. */
  readonly fromX: number | null;
  readonly toX: number | null;
  /** Half-height of the arrowhead. Encodes direction redundantly with the sign of `toX - fromX`. */
  readonly headHalfHeight: number;
  readonly headLength: number;
}

export interface SceneGeometry {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly viewport: ViewportFit;
  readonly track: TrackGeometry;
  readonly cart: CartGeometry;
  readonly force: ForceVectorGeometry;
  readonly emphasis: SceneEmphasis;
  /**
   * How far through the recorded sample window the presentation clock is, in [0, 1].
   * Presentation only: it is derived from the model's active index and never feeds back.
   */
  readonly playedFraction: number;
}

/** Coerce a layout dimension to something the renderer can use. */
function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Fit the logical space into the available box, preserving aspect ratio.
 *
 * A degenerate container (zero, negative, NaN, Infinity — all reachable from a real
 * layout during mount, collapse, or a hidden panel) yields the identity fit rather than a
 * non-finite scale, because an infinite scale would poison every downstream coordinate.
 */
export function fitViewport(containerWidth: number, containerHeight: number): ViewportFit {
  const width = finitePositive(containerWidth, LOGICAL_WIDTH);
  const height = finitePositive(containerHeight, LOGICAL_HEIGHT);
  const scale = Math.min(width / LOGICAL_WIDTH, height / LOGICAL_HEIGHT);
  return {
    width,
    height,
    scale: Number.isFinite(scale) && scale > 0 ? scale : 1,
  };
}

/** Map a position in metres onto the track's logical x. Clamped to the drawn span. */
export function positionToCanvasX(
  positionMetres: number,
  endMetres: number,
  minX: number = TRACK_START_X,
  maxX: number = TRACK_END_X
): number {
  const usable = maxX - minX;
  const span = Math.max(endMetres, Number.EPSILON);
  const clamped = Math.min(Math.max(Number.isFinite(positionMetres) ? positionMetres : 0, 0), span);
  return minX + (clamped / span) * usable;
}

function emphasisFor(model: SceneModel): SceneEmphasis {
  if (model.playback.samples.length === 0) return "idle";
  if (model.reducedMotion) return "settled";
  if (model.playback.running) return "playing";
  const lastIndex = model.playback.samples.length - 1;
  return model.playback.activeIndex >= lastIndex ? "settled" : "paused";
}

function playedFractionFor(model: SceneModel): number {
  const lastIndex = model.playback.samples.length - 1;
  if (lastIndex <= 0) return model.playback.samples.length === 0 ? 0 : 1;
  const active = Math.min(Math.max(model.playback.activeIndex, 0), lastIndex);
  return active / lastIndex;
}

/**
 * Compute everything the scene needs to draw, from the model alone.
 *
 * Pure. Calling this with the same model returns deeply equal geometry, no matter how many
 * frames have been drawn in between, what the frame delta was, or what the viewport is.
 */
export function sceneGeometry(model: SceneModel, viewport?: ViewportFit): SceneGeometry {
  const fit = viewport ?? fitViewport(LOGICAL_WIDTH, LOGICAL_HEIGHT);
  const { startMetres, endMetres } = model.track;
  const usable = TRACK_END_X - TRACK_START_X;
  const span = Math.max(endMetres - startMetres, Number.EPSILON);

  const startX = TRACK_START_X;
  const endX = TRACK_END_X;

  const wholeTicks = Math.max(1, Math.floor(endMetres - startMetres));
  const tickXs: number[] = [];
  for (let tick = 0; tick <= wholeTicks; tick += 1) {
    tickXs.push(startX + (tick / wholeTicks) * usable);
  }

  const cartCenterX = positionToCanvasX(model.cart.positionMetres, endMetres);
  const cartCenterY = TRACK_Y - CART_HEIGHT / 2 - CART_WHEEL_RADIUS;

  const arrow = model.forceArrow;
  const magnitude =
    arrow.direction === "balanced"
      ? 0
      : Math.min(Math.abs(arrow.newtons), FORCE_FULL_SCALE_NEWTONS);
  const arrowLength =
    magnitude === 0 ? 0 : ARROW_BASE_LENGTH + magnitude * ARROW_PIXELS_PER_NEWTON;
  const sign = arrow.direction === "positive" ? 1 : arrow.direction === "negative" ? -1 : 0;
  const fromX = sign === 0 ? null : cartCenterX + sign * (CART_HALF_WIDTH + ARROW_GAP);
  const toX = fromX === null ? null : fromX + sign * arrowLength;

  return {
    logicalWidth: LOGICAL_WIDTH,
    logicalHeight: LOGICAL_HEIGHT,
    viewport: fit,
    track: {
      startX,
      endX,
      y: TRACK_Y,
      width: endX - startX,
      height: 10,
      pixelsPerMetre: usable / span,
      startMetres,
      endMetres,
      tickXs,
    },
    cart: {
      centerX: cartCenterX,
      centerY: cartCenterY,
      width: CART_WIDTH,
      height: CART_HEIGHT,
      frontWheelX: cartCenterX + CART_WHEEL_INSET,
      rearWheelX: cartCenterX - CART_WHEEL_INSET,
      wheelY: TRACK_Y,
      wheelRadius: CART_WHEEL_RADIUS,
    },
    force: {
      direction: arrow.direction,
      newtons: arrow.newtons,
      magnitude,
      fromX,
      toX,
      headHalfHeight: 9,
      headLength: arrowLength === 0 ? 0 : 14,
    },
    emphasis: emphasisFor(model),
    playedFraction: playedFractionFor(model),
  };
}
