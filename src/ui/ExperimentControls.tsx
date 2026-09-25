import { BOOTSTRAP_BOUNDS, type TrialConfig } from "../domain/index.js";

export interface ExperimentControlsProps {
  readonly config: TrialConfig;
  readonly disabled: boolean;
  readonly onChange: (patch: Partial<TrialConfig>) => void;
  readonly onRun: () => void;
  readonly onReset: () => void;
}

/**
 * Experiment configuration.
 *
 * Every control is a semantic form control with a keyboard path and no drag requirement
 * (docs/ACCESSIBILITY.md). Mass and applied force use the ML-03 analytical kernel.
 */
export function ExperimentControls({
  config,
  disabled,
  onChange,
  onRun,
  onReset,
}: ExperimentControlsProps) {
  const massBounds = BOOTSTRAP_BOUNDS.cartMassKilograms;
  const forceBounds = BOOTSTRAP_BOUNDS.appliedForceNewtons;
  const velocityBounds = BOOTSTRAP_BOUNDS.initialVelocityMetresPerSecond;
  const windowBounds = BOOTSTRAP_BOUNDS.observationWindowSeconds;

  return (
    <section className="panel" aria-labelledby="controls-heading">
      <h2 id="controls-heading">2. Set up the run</h2>

      <fieldset className="fieldset">
        <legend>Cart</legend>

        <div className="field">
          <label htmlFor="cart-mass">Cart mass (kg), 1.00 to 4.00</label>
          <input
            id="cart-mass"
            name="cartMass"
            type="range"
            min={massBounds[0]}
            max={massBounds[1]}
            step={0.5}
            value={config.cartMassKilograms}
            disabled={disabled}
            onChange={(event) => onChange({ cartMassKilograms: Number(event.target.value) })}
            data-testid="cart-mass-input"
          />
          <output htmlFor="cart-mass" data-testid="cart-mass">
            {config.cartMassKilograms.toFixed(2)} kg
          </output>
          <p className="field__help">
            At a fixed net force, larger mass means smaller acceleration (a = Fnet / m).
          </p>
        </div>

        <div className="field">
          <label htmlFor="applied-force">Applied force (N), −12.0 to 12.0</label>
          <input
            id="applied-force"
            name="appliedForce"
            type="range"
            min={forceBounds[0]}
            max={forceBounds[1]}
            step={1}
            value={config.appliedForceNewtons}
            disabled={disabled}
            onChange={(event) => onChange({ appliedForceNewtons: Number(event.target.value) })}
            data-testid="applied-force-input"
          />
          <output htmlFor="applied-force" data-testid="applied-force">
            {config.appliedForceNewtons.toFixed(1)} N
          </output>
          <p className="field__help">
            Positive force accelerates to the right; negative to the left. With 0.0 N the forces
            are balanced and velocity stays constant.
          </p>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Run settings</legend>

        <div className="field">
          <label htmlFor="initial-velocity">
            Initial velocity (m/s), −2.00 to 2.00
          </label>
          <input
            id="initial-velocity"
            name="initialVelocity"
            type="range"
            min={velocityBounds[0]}
            max={velocityBounds[1]}
            step={0.25}
            value={config.initialVelocityMetresPerSecond}
            disabled={disabled}
            onChange={(event) =>
              onChange({ initialVelocityMetresPerSecond: Number(event.target.value) })
            }
          />
          <output htmlFor="initial-velocity" data-testid="initial-velocity-value">
            {config.initialVelocityMetresPerSecond.toFixed(2)} m/s
          </output>
          <p className="field__help">
            A negative value sends the cart to the left; a positive value sends it to the right.
          </p>
        </div>

        <div className="field">
          <label htmlFor="observation-window">Observation window (s), 1 to 6</label>
          <input
            id="observation-window"
            name="observationWindow"
            type="number"
            min={windowBounds[0]}
            max={windowBounds[1]}
            step={0.5}
            value={config.observationWindowSeconds}
            disabled={disabled}
            onChange={(event) =>
              onChange({ observationWindowSeconds: Number(event.target.value) })
            }
          />
          <p className="field__help">How long the run is sampled, in seconds.</p>
        </div>
      </fieldset>

      <div className="actions">
        <button type="button" onClick={onRun} data-testid="run-trial">
          Run preview
        </button>
        <button type="button" className="secondary" onClick={onReset}>
          Start over
        </button>
      </div>
    </section>
  );
}
