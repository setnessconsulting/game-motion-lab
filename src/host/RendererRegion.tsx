import { useEffect, useRef, useState } from "react";
import type { SceneModel } from "../viewmodel/index.js";

/**
 * The canvas region.
 *
 * Responsibilities (docs/ARCHITECTURE.md §6):
 *   - own the renderer lifecycle;
 *   - feed the renderer the typed view model, read-only;
 *   - if the renderer fails, degrade to a semantic panel that presents the SAME
 *     authoritative numbers, and keep the investigation completable.
 *
 * The renderer is loaded as a separate chunk so the initial application bundle does not
 * pay for Phaser, and so a chunk-load failure is a recoverable renderer failure rather
 * than a blank page.
 */

type RendererStatus = "loading" | "ready" | "failed";

export interface RendererRegionProps {
  readonly model: SceneModel;
  readonly onRendererFlagChange?: (failed: boolean) => void;
}

export function RendererRegion({ model, onRendererFlagChange }: RendererRegionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{ reconcile: (m: SceneModel) => void; destroy: () => void } | null>(
    null
  );
  const [status, setStatus] = useState<RendererStatus>("loading");
  const [failureDetail, setFailureDetail] = useState<string>("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const parent = containerRef.current;
    if (!parent) return;

    onRendererFlagChange?.(false);

    void (async () => {
      try {
        const { createLabGame } = await import("../renderer/index.js");
        if (cancelled) return;
        const handle = createLabGame({ parent, width: 720, height: 320 });
        await handle.ready;
        if (cancelled) {
          handle.destroy();
          return;
        }
        handleRef.current = handle;
        handle.reconcile(model);
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setFailureDetail(message);
        setStatus("failed");
        onRendererFlagChange?.(true);
      }
    })();

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
    // `model` is intentionally excluded: the reconcile effect below handles updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  useEffect(() => {
    handleRef.current?.reconcile(model);
  }, [model]);

  const fallbackStatus = model.playback.samples.length === 0 ? "No trial run yet." : model.announcement;

  return (
    <section className="lab-region" aria-labelledby="lab-region-heading">
      <div className="lab-region__header">
        <h2 id="lab-region-heading">Experiment view</h2>
        <p className="lab-region__hint" data-testid="renderer-status" data-status={status}>
          {status === "ready"
            ? "Animated laboratory view. Every number below is available as text."
            : status === "loading"
              ? "Starting the laboratory view…"
              : "Animated view unavailable — the investigation continues below."}
        </p>
      </div>

      <div
        className="lab-region__canvas"
        data-testid="renderer-canvas"
        role="img"
        aria-label={`Laboratory view: ${model.forceArrow.label}; position ${model.cart.positionMetres.toFixed(2)} metres; velocity ${model.cart.velocityMetresPerSecond.toFixed(2)} metres per second.`}
        ref={containerRef}
      />

      {status === "failed" ? (
        <div className="lab-region__fallback" role="status" data-testid="renderer-fallback">
          <h3>Semantic experiment view</h3>
          <p>
            The animated laboratory could not start on this device. Nothing about your experiment
            has changed, and you can finish the mission using the instruments and the trial table.
          </p>
          <p className="lab-region__detail">
            Reason: <code>{failureDetail || "renderer unavailable"}</code>
          </p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Try the animated view again
          </button>
        </div>
      ) : null}

      <p className="lab-region__status" aria-live="polite">
        {fallbackStatus}
      </p>
    </section>
  );
}
