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
 * Under reduced motion the clock jumps straight to the end of the sample window so the
 * instructional result is visible immediately with no animation.
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
    if (!state.running) return;
    // A trial may be dispatched before its window is known; wait for a real duration
    // rather than immediately finishing at zero.
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return;

    if (reducedMotion) {
      setState({ seconds: totalSeconds, running: false });
      return;
    }

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

  return { playback: state, start, stop, finish, reset };
}
