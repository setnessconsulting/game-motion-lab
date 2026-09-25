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
export { toSceneModel } from "./sceneModel.js";

export type {
  ConfiguredValues,
  Direction,
  InstrumentReading,
  ReadingOrigin,
  RulerTick,
} from "./instruments.js";
export {
  DIRECTION_CONVENTION,
  MEASUREMENT_LABELS,
  QUANTITY_LABELS,
  RULER_MAX_TICKS,
  configuredReadingsFor,
  directionWords,
  findReading,
  measurementReadingsFor,
  measuredReadingsFor,
  quantityReading,
  rulerStepMetres,
  rulerTicks,
  stopwatchReading,
} from "./instruments.js";
