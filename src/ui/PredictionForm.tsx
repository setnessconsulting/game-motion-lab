import { useState } from "react";

export interface PredictionFormProps {
  readonly prediction: string;
  readonly onSave: (text: string) => void;
}

/**
 * Prediction capture.
 *
 * Prediction is a recorded part of the investigation loop; it is never scored by the
 * renderer and never graded at runtime by a model (docs/PRIVACY.md).
 */
export function PredictionForm({ prediction, onSave }: PredictionFormProps) {
  const [draft, setDraft] = useState(prediction);

  return (
    <section className="panel" aria-labelledby="prediction-heading">
      <h2 id="prediction-heading">1. Predict</h2>
      <p className="panel__hint">
        Before measuring, write what you expect the cart to do and why. You can change it later —
        revising a prediction after seeing evidence is part of the method.
      </p>
      <div className="field">
        <label htmlFor="prediction-input">Your prediction</label>
        <textarea
          id="prediction-input"
          name="prediction"
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          aria-describedby="prediction-help"
        />
        <p id="prediction-help" className="field__help">
          For example: “The cart keeps a steady speed, because the forces balance.”
        </p>
      </div>
      <button type="button" onClick={() => onSave(draft)} data-testid="save-prediction">
        Save prediction
      </button>
      {prediction ? (
        <p className="panel__saved" role="status" data-testid="prediction-saved">
          Saved: “{prediction}”
        </p>
      ) : null}
    </section>
  );
}
