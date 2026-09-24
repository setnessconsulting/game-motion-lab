import type { SceneModel } from "../viewmodel/index.js";

export interface InstrumentPanelProps {
  readonly model: SceneModel;
  readonly onPause: () => void;
  readonly onJumpToEnd: () => void;
  readonly onRestart: () => void;
  readonly canControl: boolean;
}

/**
 * The instruments.
 *
 * Every value the renderer draws is also available here as text with units, so the
 * investigation is completable without looking at the canvas (docs/ACCESSIBILITY.md).
 * Values are display-rounded for reading only; they never feed back into the engine.
 */
export function InstrumentPanel({
  model,
  onPause,
  onJumpToEnd,
  onRestart,
  canControl,
}: InstrumentPanelProps) {
  return (
    <section className="panel" aria-labelledby="instruments-heading">
      <h2 id="instruments-heading">3. Measure</h2>

      <p className="force-label" data-testid="force-label">
        <span className="force-label__swatch" aria-hidden="true">
          {model.forceArrow.direction === "positive"
            ? "\u2192"
            : model.forceArrow.direction === "negative"
              ? "\u2190"
              : "\u2194"}
        </span>
        Net force: <strong>{model.forceArrow.label}</strong>
      </p>

      <dl className="readouts" data-testid="readouts">
        {model.readouts.map((readout) => (
          <div className="readouts__row" key={readout.id}>
            <dt>{readout.label}</dt>
            <dd data-testid={`readout-${readout.id}`}>{readout.text}</dd>
          </div>
        ))}
      </dl>

      <div className="actions">
        <button type="button" onClick={onPause} disabled={!canControl} data-testid="toggle-runch">
          {model.playback.running ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onJumpToEnd}
          disabled={!canControl}
          data-testid="jump-to-end"
        >
          Jump to end
        </button>
        <button
          type="button"
          className="secondary"
          onClick={onRestart}
          disabled={!canControl}
          data-testid="restart-playback"
        >
          Replay
        </button>
      </div>

      <p className="panel__hint">
        Playback controls only change what is on screen. The recorded trial values never change.
      </p>
    </section>
  );
}
