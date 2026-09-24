/**
 * Renderer qualification readback hook.
 *
 * The real-render Playwright lane (playwright.phaser.config.ts) needs to prove that the
 * actual Phaser scene initialized and is being driven by deterministic authoritative
 * state — not by mocks and not by pixels. This hook publishes *what the renderer was
 * told*, never a scientific result.
 *
 * It is deliberately read-only and has no setters: the qualification lane can observe,
 * but nothing can write a measurement back through it.
 */

export interface RendererReadback {
  /** True only after the real Phaser Scene has created and attached. */
  ready: boolean;
  sceneKey: string;
  /** Frames the scene has reconciled. Proves the render loop is live. */
  frames: number;
  /** True after destroy() — the lane asserts no post-unmount work. */
  destroyed: boolean;
  /** The last view model the renderer consumed, as unit-space values. */
  lastModel: {
    activeIndex: number;
    positionMetres: number;
    velocityMetresPerSecond: number;
    trackEndMetres: number;
    reducedMotion: boolean;
  } | null;
  /** Non-null when the renderer failed to initialize or threw. */
  failure: string | null;
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
