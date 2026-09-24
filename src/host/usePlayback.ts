import { useCallback, useEffect, useState } from "react";

export interface PlaybackState {
  readonly seconds: number;
  readonly running: boolean;
}

/**
 * Presentation-only playback clock.
 *
 * This clock selects which already-computed authoritative sample is displayed. It is
 * NOT authoritative timing: changing the frame rate, pausing, or jumping to the end
 * cannot change a sample, a measurement, or a trial record.
 *
 * Reduced motion is expressed as a **derivation** of the clock, not as a side effect
 * inside the animation effect. When reduced motion is on, the displayed position is the
 * end of the sample window and the clock does not run at all, so the instructional result
 * is visible immediately with no animation and no animated frame is ever painted.
 */
export function usePlayback(totalSeconds: number, reducedMotion: boolean) {
  const [state, setState] = useState<PlaybackState>({ seconds: 0, running: false });

  const start = useCallback(() => {
    setState({ seconds: 0, running: true });
  }, []);

  const stop = useCallback(() => {
    setState((previous) => ({ ...previous, running: false }));
  }, []);

  const finish = useCallback(() => {
    setState({ seconds: totalSeconds, running: false });
  }, [totalSeconds]);

  const reset = useCallback(() => {
    setState({ seconds: 0, running: false });
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

  // Derived, never mutated: reduced motion always presents the end of the sample window.
  const playback: PlaybackState = reducedMotion
    ? { seconds: totalSeconds, running: false }
    : state;

  return { playback, start, stop, finish, reset };
}
