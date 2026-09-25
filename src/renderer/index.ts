/**
 * Motion Lab Phaser renderer package (presentation only).
 *
 * Boundary contract (ADR 0002, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): the renderer may consume the typed view model
 * and draw. It may not import the science/domain/content packages, compute a scientific
 * value, or derive one from pixels, sprites, or animation timing.
 *
 * `labGeometry.ts` is exported because the geometry is the renderer's contract with the
 * rest of the system: it maps authoritative metres onto canvas pixels as a pure function,
 * and that function is unit-tested without a browser (GAME-390 / ML-06).
 */

export { createLabGame, RendererUnavailableError, LAB_SCENE_KEY } from "./createLabGame.js";
export type { CreateLabGameOptions, LabGameHandle } from "./createLabGame.js";
export { LAB_SCENE_RUNTIME, resetLabSceneRuntime } from "./labScene.js";
export {
  fitViewport,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  positionToCanvasX,
  sceneGeometry,
  TRACK_END_X,
  TRACK_MARGIN,
  TRACK_START_X,
} from "./labGeometry.js";
export type {
  CartGeometry,
  ForceVectorGeometry,
  SceneEmphasis,
  SceneGeometry,
  TrackGeometry,
  ViewportFit,
} from "./labGeometry.js";
export { RENDERER_READBACK_KEY } from "./readback.js";
export type {
  RendererFailureStage,
  RendererGeometryReadback,
  RendererReadback,
} from "./readback.js";
