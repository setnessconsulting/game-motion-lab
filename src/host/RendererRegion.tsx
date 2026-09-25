import { useCallback, useEffect, useRef, useState } from "react";
import { findReading, type SceneModel } from "../viewmodel/index.js";
import {
  failureExplanationFor,
  isRendererStage,
  rendererRecoveryFor,
  type HostFailureStage,
} from "./recovery.js";

/**
 * The canvas region.
 *
 * Responsibilities (docs/ARCHITECTURE.md §6, docs/ACCESSIBILITY.md §2):
 *   - own the renderer lifecycle;
 *   - feed the renderer the typed view model, read-only;
 *   - fit the renderer to the available box;
 *   - if the renderer fails at any stage, degrade to a semantic panel that presents the
 *     SAME authoritative numbers, name the stage, and let the learner ask again.
 *
 * The renderer is loaded as a separate chunk so the initial application bundle does not
 * pay for Phaser, and so a chunk-load failure is a recoverable renderer failure rather
 * than a blank page.
 *
 * GAME-390 / ML-06 completed the failure story the ML-02 bootstrap started. Previously
 * only the chunk-load path reached the fallback, so a failure *after* the renderer was
 * ready left the region claiming to be fine. Now every stage the renderer can report —
 * chunk load, initialisation, startup timeout, and a runtime throw once ready — moves the
 * region into the fallback. The investigation never depended on the canvas, so none of
 * this can cost the learner their numbers.
 *
 * One stage is recovered differently, and the difference was measured, not assumed. A
 * failed module download cannot be retried from the same page: the browser remembers the
 * failure for the life of the page, so importing the same specifier again rejects without
 * issuing a request. The qualification lane proved it directly — with the renderer chunk
 * blocked and then unblocked, the same URL rejected again (no second network request on
 * the wire) while a cache-busted URL resolved. So a chunk-load failure offers a reload,
 * not an in-place retry, and states plainly that a reload starts a fresh session because
 * trial records are deliberately not stored (docs/PRIVACY.md). Every other stage recreates
 * the renderer in place, which does work — the runtime-throw lane exercises that path.
 *
 * Offering a retry that provably cannot succeed would have been the smaller change and the
 * worse one: the learner would click it and watch the same failure reappear with no
 * explanation. The fallback says what is true instead.
 */

type RendererStatus = "loading" | "ready" | "failed";

export interface RendererRegionProps {
  readonly model: SceneModel;
  readonly onRendererFlagChange?: (failed: boolean) => void;
}

/**
 * The canvas's accessible name (ML-07 AC3).
 *
 * It is built from the same instrument readings the visible readouts use, rather than from its
 * own formatting of the same numbers, so a screen-reader user and a sighted user cannot be told
 * different values — and a unit can never be spelled two ways.
 */
function canvasLabel(model: SceneModel): string {
  const position = findReading(model.readouts, "position");
  const velocity = findReading(model.readouts, "velocity");
  const parts = [
    `Laboratory view: ${model.forceArrow.label}`,
    position ? `${position.label} ${position.text}` : undefined,
    velocity ? `${velocity.label} ${velocity.text}` : undefined,
  ].filter((part): part is string => part !== undefined);
  return `${parts.join("; ")}.`;
}

export function RendererRegion({ model, onRendererFlagChange }: RendererRegionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<{
    reconcile: (m: SceneModel) => void;
    resize: (width: number, height: number) => void;
    destroy: () => void;
  } | null>(null);
  const [status, setStatus] = useState<RendererStatus>("loading");
  const [failureDetail, setFailureDetail] = useState<string>("");
  const [failureStage, setFailureStage] = useState<HostFailureStage | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const parent = containerRef.current;
    if (!parent) return;

    onRendererFlagChange?.(false);

    void (async () => {
      // Read before the load so attribution stays honest: a failure after the module
      // loaded is not a download failure, however tempting it is to blame the network.
      let rendererLoaded = false;
      try {
        const { createLabGame } = await import("../renderer/index.js");
        rendererLoaded = true;
        if (cancelled) return;

        const handle = createLabGame({
          parent,
          width: parent.clientWidth,
          height: parent.clientHeight,
          onFailure: ({ stage, message }) => {
            // A failure after `ready` resolves is invisible to the promise below. Without
            // this the region would keep saying "ready" over a frozen canvas.
            if (cancelled) return;
            setFailureDetail(message);
            setFailureStage(stage);
            setStatus("failed");
            onRendererFlagChange?.(true);
          },
        });

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
        const reported = (error as { stage?: unknown } | null)?.stage;
        const stage: HostFailureStage = !rendererLoaded
          ? "chunk-load"
          : isRendererStage(reported)
            ? reported
            : "initialise";
        setFailureDetail(message);
        setFailureStage(stage);
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

  // Fit the renderer to the box it was actually given. The reported size is CSS pixels and
  // is used only for fitting: the scene draws in a fixed logical space, so a viewport can
  // never change a metre value.
  useEffect(() => {
    const parent = containerRef.current;
    if (!parent || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      handleRef.current?.resize(parent.clientWidth, parent.clientHeight);
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  const retry = useCallback(() => {
    setStatus("loading");
    setFailureStage(null);
    setFailureDetail("");
    setAttempt((value) => value + 1);
  }, []);

  /**
   * The only recovery a failed module download has: a new page gets a new module map, so
   * the download is attempted again. It costs the session, because trial records are not
   * stored — the fallback says so before the learner clicks.
   */
  const reloadPage = useCallback(() => {
    window.location.reload();
  }, []);

  const fallbackStatus =
    model.playback.samples.length === 0 ? "No trial run yet." : model.announcement;

  return (
    <section className="lab-region" aria-labelledby="lab-region-heading">
      <div className="lab-region__header">
        <h2 id="lab-region-heading">Experiment view</h2>
        <p
          className="lab-region__hint"
          data-testid="renderer-status"
          data-status={status}
          data-failure-stage={failureStage ?? "none"}
        >
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
        aria-label={canvasLabel(model)}
        ref={containerRef}
      />

      {status === "failed" ? (
        <div className="lab-region__fallback" role="status" data-testid="renderer-fallback">
          <h3>Semantic experiment view</h3>
          <p>
            {failureExplanationFor(failureStage)}{" "}
            Nothing about your experiment has changed, and you can finish the investigation using
            the instruments and the trial table.
          </p>
          <p className="lab-region__detail">
            Stage:{" "}
            <code data-testid="renderer-failure-stage">{failureStage ?? "unknown"}</code> — reason:{" "}
            <code>{failureDetail || "renderer unavailable"}</code>
          </p>
          {rendererRecoveryFor(failureStage) === "reload-page" ? (
            <>
              <p className="lab-region__detail" data-testid="renderer-reload-note">
                Loading the same file again from this page will not work — the browser remembers
                the failed download for the life of the page — so this reloads the page instead.
                Trial records are not stored, so the session starts fresh: note down anything you
                still need before reloading.
              </p>
              <button type="button" onClick={reloadPage} data-testid="renderer-reload">
                Reload the page to try the animated view
              </button>
            </>
          ) : (
            <button type="button" onClick={retry} data-testid="renderer-retry">
              Try the animated view again
            </button>
          )}
        </div>
      ) : null}

      <p className="lab-region__status" aria-live="polite">
        {fallbackStatus}
      </p>
    </section>
  );
}
