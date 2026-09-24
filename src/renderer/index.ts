/**
 * Motion Lab Phaser renderer package (presentation only).
 *
 * Boundary contract (ADR 0002, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): the renderer may consume the typed view model
 * and draw. It may not import the science/domain/content packages, compute a scientific
 * value, or derive one from pixels, sprites, or animation timing.
 *
 * This is the ML-02 bootstrap scene. The production lab renderer is GAME-390 (ML-06).
 */

export { createLabGame, RendererUnavailableError, LAB_SCENE_KEY } from "./createLabGame.js";
export type { CreateLabGameOptions, LabGameHandle } from "./createLabGame.js";
export { LAB_SCENE_RUNTIME, resetLabSceneRuntime } from "./labScene.js";
export { RENDERER_READBACK_KEY } from "./readback.js";
export type { RendererReadback } from "./readback.js";
