import { useCallback, useMemo, useReducer } from "react";
import {
  MISSION_PHASE_ORDER,
  createInitialMissionState,
  reduceMission,
  type TrialConfig,
} from "../domain/index.js";
import { toSceneModel } from "../viewmodel/index.js";
import { RendererRegion } from "../host/RendererRegion.js";
import { nextSampleSeconds, usePlayback } from "../host/usePlayback.js";
import { usePrefersReducedMotion } from "../host/usePrefersReducedMotion.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { FoundationNotice } from "../ui/FoundationNotice.js";
import { PredictionForm } from "../ui/PredictionForm.js";
import { ExperimentControls } from "../ui/ExperimentControls.js";
import { InstrumentPanel } from "../ui/InstrumentPanel.js";
import { TrialTable } from "../ui/TrialTable.js";

const MISSION_ID = "foundation-preview";

/**
 * The application shell.
 *
 * React renders authoritative engine state and sends bounded intents back. It does not
 * compute a single scientific value (docs/ARCHITECTURE.md §4).
 */
export function App() {
  const [state, dispatch] = useReducer(reduceMission, MISSION_ID, createInitialMissionState);
  const reducedMotion = usePrefersReducedMotion();

  const latestTrial = state.trials.length > 0 ? state.trials[state.trials.length - 1] : undefined;
  const totalSeconds = latestTrial?.config.observationWindowSeconds ?? 0;

  const { playback, start, stop, finish, reset, seek } = usePlayback(totalSeconds, reducedMotion);

  const model = useMemo(
    () =>
      toSceneModel(state, {
        playbackSeconds: playback.seconds,
        running: playback.running,
        reducedMotion,
      }),
    [state, playback.seconds, playback.running, reducedMotion]
  );

  const handleConfigChange = useCallback((patch: Partial<TrialConfig>) => {
    dispatch({ kind: "set-draft", patch });
  }, []);

  const handleRun = useCallback(() => {
    dispatch({ kind: "begin-preview-trial" });
    // The window is known before the trial lands, so reduced motion can resolve to the end
    // of the run in one step rather than waiting for a duration it does not yet have.
    start(state.draft.observationWindowSeconds);
  }, [start, state.draft.observationWindowSeconds]);

  const handleResumeFromStart = useCallback(() => {
    start(totalSeconds);
  }, [start, totalSeconds]);

  // Presentation only: this seeks the playback clock to the next or previous *recorded*
  // sample instant. It cannot change a sample, a measurement, or a trial record.
  const handleStep = useCallback(
    (direction: 1 | -1) => {
      const samples = model.playback.samples;
      if (samples.length === 0) return;
      seek(nextSampleSeconds(samples, playback.seconds, direction));
    },
    [model.playback.samples, playback.seconds, seek]
  );

  const handleReset = useCallback(() => {
    dispatch({ kind: "reset-session" });
    reset();
  }, [reset]);

  return (
    <main className="app">
      <header className="app__header">
        <p className="app__eyebrow">Motion Lab</p>
        <h1>Forces and motion — experiment bench</h1>
        <p className="app__summary">
          Design a run, watch it, read the instruments, and record what you see. Motion Lab is an
          evidence game: your job is to compare trials, not to guess.
        </p>
      </header>

      <FoundationNotice />

      <div className="app__grid">
        <div className="app__column">
          <PredictionForm
            prediction={state.prediction}
            onSave={(text) => dispatch({ kind: "set-prediction", text })}
          />
          <ExperimentControls
            config={state.draft}
            disabled={state.phase === "run"}
            onChange={handleConfigChange}
            onRun={handleRun}
            onReset={handleReset}
          />
        </div>

        <div className="app__column">
          <ErrorBoundary
            fallback={(message) => (
              <section className="panel" role="alert" data-testid="renderer-boundary">
                <h2>Experiment view unavailable</h2>
                <p>
                  The animated view stopped. Your experiment data is safe — keep going with the
                  instruments and the trial table below.
                </p>
                <p className="lab-region__detail">
                  Reason: <code>{message}</code>
                </p>
              </section>
            )}
          >
            <RendererRegion model={model} />
          </ErrorBoundary>

          <InstrumentPanel
            model={model}
            onPause={playback.running ? stop : handleResumeFromStart}
            onJumpToEnd={finish}
            onRestart={() => {
              reset();
              start(totalSeconds);
            }}
            onStep={handleStep}
            canControl={latestTrial !== undefined}
          />
        </div>
      </div>

      <TrialTable trials={state.trials} />

      <footer className="app__footer">
        <h2>Investigation steps</h2>
        <ol className="phase-list" data-testid="phase-list">
          {MISSION_PHASE_ORDER.map((phase) => (
            <li key={phase} aria-current={phase === state.phase ? "step" : undefined}>
              {phase}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="secondary"
          onClick={() => dispatch({ kind: "advance-phase" })}
          data-testid="advance-phase"
        >
          Next step
        </button>
        <p className="app__motion-note" data-testid="motion-preference">
          Reduced motion: {reducedMotion ? "on — playback jumps straight to the result" : "off"}
        </p>
      </footer>
    </main>
  );
}
