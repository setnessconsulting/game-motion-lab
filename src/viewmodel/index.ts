/**
 * Motion Lab view-model package.
 *
 * Projects authoritative domain state into the typed model shared by React and Phaser
 * (ADR 0002). It may import the science and domain packages; it must not import Phaser
 * or touch the DOM.
 */

export type {
  SceneModel,
  SceneReadout,
  SceneSamplePoint,
  SceneViewModelInput,
} from "./sceneModel.js";
export { massReadout, toSceneModel } from "./sceneModel.js";
