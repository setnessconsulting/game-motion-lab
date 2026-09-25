import { useCallback, useEffect, useState } from "react";

export interface PlaybackState {
  readonly seconds: number;
  readonly running: boolean;
}

/**
 * Presentation-only playback clock.
 *
 * This clock selects which already-computed authoritative sample is displayed. It is
 * NOT authoritative timing: changing the frame rate, pausing, seeking, or jumping to the
 * end cannot change a sample, a measurement, or a trial record. `docs/EXPERIMENT_MODEL.md`
 * owns that guarantee; this hook only decides what the learner is looking at.
 *
 * Reduced motion (docs/ACCESSIBILITY.md §2, §6 and GAME-390 / ML-06 acceptance criterion 4)
 * is handled in `start`, not by deriving an override on the returned value:
 *
 *   - `start` resolves straight to the end of the window and never sets `running`, so the
 *     frame loop below never runs and **no intermediate animated state is ever produced**;
 *   - `seconds` stays real state, so seeking and stepping still work. That matters, because
 *     the accessibility contract says trajectory playback may *step* instead of animate —
 *     a derivation that pinned the clock to the end would have removed the animation and
 *     the manual alternative with it.
 */
export function usePlayback(totalSeconds: number, reducedMotion: boolean) {
  const [state, setState] = useState<PlaybackState>({ seconds: 0, running: false });

  const start = useCallback(
    (durationSeconds?: number) => {
      if (reducedMotion) {
        // Resolve to the end of the window at once. The loop is never started, so there is
        // no frame at which an intermediate position could be painted.
        const requested = durationSeconds ?? totalSeconds;
        const duration = Number.isFinite(requested) ? Math.max(0, requested) : 0;
        setState({ seconds: duration, running: false });
        return;
      }
      setState({ seconds: 0, running: true });
    },
    [reducedMotion, totalSeconds]
  );

  const stop = useCallback(() => {
    setState((previous) => ({ ...previous, running: false }));
  }, []);

  const finish = useCallback(() => {
    setState({ seconds: totalSeconds, running: false });
  }, [totalSeconds]);

  const reset = useCallback(() => {
    setState({ seconds: 0, running: false });
  }, []);

  /** Move the presentation clock to an absolute instant. Presentation only. */
  const seek = useCallback((seconds: number) => {
    setState((current) => ({
      seconds: Number.isFinite(seconds) ? Math.max(0, seconds) : current.seconds,
      running: false,
    }));
  }, []);

  useEffect(() => {
    // Reduced motion shows the result directly; there is no clock to advance.
    if (reducedMotion) return;
    if (!state.running) return;
    // A trial may be dispatched before its window is known; wait for a real duration
    // rather than immediately finishing at zero.
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return;

    let frame = 0;
    let previous = performance.now();

    const step = (now: number) => {
      const deltaSeconds = Math.max(0, (now - previous) / 1000);
      previous = now;
      setState((current) => {
        const next = current.seconds + deltaSeconds;
        if (next >= totalSeconds) {
          return { seconds: totalSeconds, running: false };
        }
        return { seconds: next, running: true };
      });
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [state.running, reducedMotion, totalSeconds]);

  return { playback: state, start, stop, finish, reset, seek };
}

/**
 * Step one recorded sample from the current instant.
 *
 * The targets are the authoritative sample instants the view model already carries, so
 * "step" lands exactly on a recorded point rather than on an invented fraction of the
 * window. Presentation only: `seek` moves the clock, never a measurement.
 */
export function nextSampleSeconds(
  samples: readonly { readonly atSeconds: number }[],
  currentSeconds: number,
  direction: 1 | -1
): number {
  if (samples.length === 0) return currentSeconds;
  const epsilon = 1e-9;
  if (direction === 1) {
    const next = samples.find((sample) => sample.atSeconds > currentSeconds + epsilon);
    return next?.atSeconds ?? samples[samples.length - 1]?.atSeconds ?? currentSeconds;
  }
  const previous = [...samples]
    .reverse()
    .find((sample) => sample.atSeconds < currentSeconds - epsilon);
  return previous?.atSeconds ?? samples[0]?.atSeconds ?? currentSeconds;
}
