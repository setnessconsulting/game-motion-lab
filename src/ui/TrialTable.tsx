import { formatQuantity } from "../science/index.js";
import type { TrialRecord } from "../domain/index.js";

export interface TrialTableProps {
  readonly trials: readonly TrialRecord[];
  readonly onClear?: () => void;
}

/**
 * The trial record as a real, screen-reader-readable table.
 *
 * This is the semantic equivalent of anything the renderer shows. A learner can complete
 * the investigation from this table alone (docs/ACCESSIBILITY.md).
 */
export function TrialTable({ trials }: TrialTableProps) {
  if (trials.length === 0) {
    return (
      <section className="panel" aria-labelledby="trials-heading">
        <h2 id="trials-heading">4. Recorded trials</h2>
        <p data-testid="trials-empty">
          No trial recorded yet. Run a preview to create the first record.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" aria-labelledby="trials-heading">
      <h2 id="trials-heading">4. Recorded trials</h2>
      <table data-testid="trials-table">
        <caption>
          Recorded preview trials. Values are display-rounded for reading; the engine keeps
          full-precision values.
        </caption>
        <thead>
          <tr>
            <th scope="col">Trial</th>
            <th scope="col">Cart mass (kg)</th>
            <th scope="col">Applied force (N)</th>
            <th scope="col">Initial velocity (m/s)</th>
            <th scope="col">Window (s)</th>
            <th scope="col">Final position (m)</th>
            <th scope="col">Final velocity (m/s)</th>
          </tr>
        </thead>
        <tbody>
          {trials.map((trial) => (
            <tr key={trial.id}>
              <th scope="row">{trial.index + 1}</th>
              <td>{formatQuantity("mass", trial.config.cartMassKilograms)}</td>
              <td>{formatQuantity("force", trial.config.appliedForceNewtons)}</td>
              <td>{formatQuantity("velocity", trial.config.initialVelocityMetresPerSecond)}</td>
              <td>{formatQuantity("time", trial.config.observationWindowSeconds)}</td>
              <td>{formatQuantity("position", trial.finalState.positionMetres)}</td>
              <td>{formatQuantity("velocity", trial.finalState.velocityMetresPerSecond)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
