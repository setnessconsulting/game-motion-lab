/**
 * Renderer qualification readback hook (GAME-384 / ML-02, extended by GAME-390 / ML-06).
 *
 * The real-render Playwright lane (playwright.phaser.config.ts) needs to prove that the
 * actual Phaser scene initialized and is being driven by deterministic authoritative
 * state — not by mocks and not by pixels. This hook publishes *what the renderer was
 * told* and *what geometry it computed from that*, never a scientific result.
 *
 * It is deliberately read-only and has no setters: the qualification lane can observe,
 * but nothing can write a measurement back through it.
 *
 * ML-06 added `geometry` for one specific reason. ML-06 acceptance criterion 3 says the
 * same domain trace must render the same way regardless of refresh rate. The honest way to
 * check that from outside the canvas is to publish the logical geometry the scene actually
 * drew, then assert it is byte-identical across advancing frames and across viewport
 * sizes. Comparing screenshots would test rasterisation, which is not the claim.
 */

/** Where a renderer failure happened. Each stage has a different recovery path. */
export type RendererFailureStage =
  | "chunk-load"
  | "initialise"
  | "startup-timeout"
  | "runtime";

export interface RendererGeometryReadback {
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly pixelsPerMetre: number;
  readonly cartCenterX: number;
  readonly cartCenterY: number;
  readonly trackStartX: number;
  readonly trackEndX: number;
  readonly forceFromX: number | null;
  readonly forceToX: number | null;
  readonly emphasis: string;
  readonly playedFraction: number;
  /**
   * The fitted viewport, so a lane can prove screen size did not reach the geometry's inputs.
   *
   * The canvas's CSS size is the measure, not the scale manager's zoom: under Phaser's FIT
   * mode `scale.zoom` stays 1 in every viewport, so an earlier `viewportScale` field reported
   * a constant and has been removed rather than left as a field that looks meaningful. The
   * lane compares these two values and the measured canvas box instead.
   */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface RendererReadback {
  /** True only after the real Phaser Scene has created and attached. */
  ready: boolean;
  sceneKey: string;
  /** Frames the scene has reconciled. Proves the render loop is live. */
  frames: number;
  /** True after destroy() — the lane asserts no post-unmount work. */
  destroyed: boolean;
  /** Non-null when the renderer failed to initialize or threw. */
  failure: string | null;
  /** Which stage failed, so a recoverable failure is distinguishable from a fatal one. */
  failureStage: RendererFailureStage | null;
  /** The last view model the renderer consumed, as unit-space values. */
  lastModel: {
    activeIndex: number;
    positionMetres: number;
    velocityMetresPerSecond: number;
    trackEndMetres: number;
    reducedMotion: boolean;
  } | null;
  /** The geometry the scene computed for the last model it drew, in logical pixels. */
  geometry: RendererGeometryReadback | null;
}

export const RENDERER_READBACK_KEY = "__MOTION_LAB_RENDERER__";

declare global {
  interface Window {
    [RENDERER_READBACK_KEY]?: RendererReadback;
  }
}

export function publishReadback(readback: RendererReadback): void {
  if (typeof window === "undefined") return;
  window[RENDERER_READBACK_KEY] = readback;
}
