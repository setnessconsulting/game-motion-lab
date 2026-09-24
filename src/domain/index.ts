/**
 * Motion Lab domain package — the experiment/evidence authority.
 *
 * Boundary contract (ADR 0001, enforced by eslint.config.js and
 * tests/architecture/boundaries.test.ts): nothing in this package may import React,
 * Phaser, the DOM, storage, or the network.
 *
 * Content status: ML-02 bootstrap skeleton. The experiment/trial/evidence contract is
 * GAME-388 (ML-04) and the game state machine is GAME-394 (ML-10).
 */

export type {
  MissionPhase,
  MissionState,
  TrialConfig,
  TrialConfigBounds,
  TrialRecord,
} from "./types.js";
export { MISSION_PHASE_ORDER } from "./types.js";
export type { MissionIntent } from "./intents.js";
export {
  BOOTSTRAP_BOUNDS,
  BOOTSTRAP_CONFIG,
  clampConfig,
  createInitialMissionState,
  createPreviewTrial,
  reduceMission,
} from "./intents.js";
