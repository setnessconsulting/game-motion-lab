/**
 * Controlled-variable analysis for the experiment layer (GAME-388 / ML-04).
 *
 * A controlled investigation is fair exactly when one variable changed and
 * every controlled variable held. This module is the executable form of that
 * rule (docs/EXPERIMENT_MODEL.md section 4): it decides whether a candidate
 * configuration is a legitimate comparison against a baseline, and explains
 * itself when it is not.
 *
 * Pure: no clock, no randomness, no renderer input.
 */

import type { QuantityId } from "../science/index.js";
import { DomainValidationError } from "./errors.js";
import type {
  ChangeAssessment,
  ConfigurationValues,
  ControlledInvestigation,
  VariableChange,
  VariableId,
} from "./experiment-types.js";
import type { TrialConfig } from "./types.js";

/** Which scientific quantity each variable controls. */
export const VARIABLE_QUANTITY = {
  cartMassKilograms: "mass",
  appliedForceNewtons: "force",
  initialVelocityMetresPerSecond: "velocity",
  observationWindowSeconds: "time",
} as const satisfies Readonly<Record<VariableId, QuantityId>>;

/** Every v1 variable, in a stable order. */
export const ALL_VARIABLE_IDS: readonly VariableId[] = [
  "cartMassKilograms",
  "appliedForceNewtons",
  "initialVelocityMetresPerSecond",
  "observationWindowSeconds",
];

/** Project a configuration into a total, orderable map of variable values. */
export function configurationValues(configuration: TrialConfig): ConfigurationValues {
  return {
    cartMassKilograms: configuration.cartMassKilograms,
    appliedForceNewtons: configuration.appliedForceNewtons,
    initialVelocityMetresPerSecond: configuration.initialVelocityMetresPerSecond,
    observationWindowSeconds: configuration.observationWindowSeconds,
  };
}

/** Read one variable's value from a configuration. */
export function readVariable(configuration: TrialConfig, variableId: VariableId): number {
  return configurationValues(configuration)[variableId];
}

/** Return a new configuration with one variable replaced. */
export function withVariable(
  configuration: TrialConfig,
  variableId: VariableId,
  value: number
): TrialConfig {
  return { ...configuration, [variableId]: value };
}

/**
 * Reject a declaration that is not a well-formed controlled investigation.
 *
 * Called by every entry point that consumes an investigation, so a malformed
 * declaration fails closed before it can be used to justify a comparison.
 */
export function assertValidInvestigation(investigation: ControlledInvestigation): void {
  const declared = investigation.declaredVariables;
  if (declared.length === 0) {
    throw new DomainValidationError(
      "empty-variable-set",
      "A controlled investigation must declare at least one variable"
    );
  }

  const ids = new Set<VariableId>();
  for (const declaration of declared) {
    if (!ALL_VARIABLE_IDS.includes(declaration.id)) {
      throw new DomainValidationError(
        "unknown-variable",
        `Variable ${declaration.id} is not part of the v1 experiment contract`
      );
    }
    if (ids.has(declaration.id)) {
      throw new DomainValidationError(
        "unknown-variable",
        `Variable ${declaration.id} is declared more than once`
      );
    }
    ids.add(declaration.id);
    if (!Number.isFinite(declaration.step) || declaration.step <= 0) {
      throw new DomainValidationError(
        "unknown-variable",
        `Variable ${declaration.id} must declare a finite step greater than zero`
      );
    }
    const [min, max] = declaration.bounds;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new DomainValidationError(
        "unknown-variable",
        `Variable ${declaration.id} must declare finite, ordered bounds`
      );
    }
  }

  if (!ids.has(investigation.independentVariableId)) {
    throw new DomainValidationError(
      "unknown-variable",
      `Independent variable ${investigation.independentVariableId} is not declared`
    );
  }
  for (const dependentId of investigation.dependentVariableIds) {
    if (!ids.has(dependentId)) {
      throw new DomainValidationError(
        "unknown-variable",
        `Dependent variable ${dependentId} is not declared`
      );
    }
  }
  for (const controlledId of investigation.controlledVariableIds) {
    if (!ids.has(controlledId)) {
      throw new DomainValidationError(
        "unknown-variable",
        `Controlled variable ${controlledId} is not declared`
      );
    }
    if (controlledId === investigation.independentVariableId) {
      throw new DomainValidationError(
        "unknown-variable",
        `Variable ${controlledId} cannot be both independent and controlled`
      );
    }
  }
}

/**
 * Reject a configuration that is non-finite or outside its declared bounds.
 *
 * The science kernel independently rejects non-finite mass; this layer is what
 * makes the *experiment* well-formed before any kernel call is attempted.
 */
export function assertConfigurationWithinBounds(
  investigation: ControlledInvestigation,
  configuration: TrialConfig
): void {
  assertValidInvestigation(investigation);
  for (const declaration of investigation.declaredVariables) {
    const value = readVariable(configuration, declaration.id);
    if (!Number.isFinite(value)) {
      throw new DomainValidationError(
        "non-finite-configuration",
        `${declaration.id} must be a finite number; non-finite values may never enter evidence`
      );
    }
    const [min, max] = declaration.bounds;
    if (value < min || value > max) {
      throw new DomainValidationError(
        "configuration-out-of-bounds",
        `${declaration.id}=${value} is outside its declared bounds [${min}, ${max}]`
      );
    }
  }
  if (configuration.cartMassKilograms <= 0) {
    throw new DomainValidationError(
      "configuration-out-of-bounds",
      "cartMassKilograms must be greater than zero for a = Fnet/m to be defined"
    );
  }
  if (configuration.observationWindowSeconds <= 0) {
    throw new DomainValidationError(
      "configuration-out-of-bounds",
      "observationWindowSeconds must be greater than zero for a trial to be sampled"
    );
  }
}

function describeRole(investigation: ControlledInvestigation, variableId: VariableId): VariableChange["role"] {
  if (variableId === investigation.independentVariableId) return "independent";
  if (investigation.controlledVariableIds.includes(variableId)) return "controlled";
  return "dependent";
}

/**
 * Compare a candidate configuration against the baseline of an investigation.
 *
 * Returns a full assessment rather than a boolean so the caller can either
 * block the action or explain it to the learner.
 */
export function assessTrialChange(
  investigation: ControlledInvestigation,
  baseline: TrialConfig,
  candidate: TrialConfig
): ChangeAssessment {
  assertValidInvestigation(investigation);

  const before = configurationValues(baseline);
  const after = configurationValues(candidate);

  const changes: VariableChange[] = [];
  for (const variableId of ALL_VARIABLE_IDS) {
    if (before[variableId] === after[variableId]) continue;
    changes.push({
      variableId,
      from: before[variableId],
      to: after[variableId],
      role: describeRole(investigation, variableId),
    });
  }

  if (changes.length === 0) {
    return {
      validity: "unchanged",
      changes,
      independentChanged: false,
      controlledViolations: [],
      pedagogy: null,
    };
  }

  const independentChanges = changes.filter((change) => change.role === "independent");
  const controlledViolations = changes
    .filter((change) => change.role === "controlled")
    .map((change) => change.variableId);

  // More than one variable moved, whatever their roles. This is the classic
  // invalid multi-variable change, and it is reported before the narrower
  // "a controlled one moved" case so the learner hears the real problem.
  if (changes.length > 1) {
    const names = changes.map((change) => change.variableId).join(", ");
    return {
      validity: "multiple-variables-changed",
      changes,
      independentChanged: independentChanges.length > 0,
      controlledViolations,
      pedagogy:
        `This comparison is not a fair test: ${changes.length} variables changed at once ` +
        `(${names}). A fair test changes only ${investigation.independentVariableId}.`,
    };
  }

  if (controlledViolations.length > 0) {
    const names = controlledViolations.join(", ");
    return {
      validity: "controlled-variable-changed",
      changes,
      independentChanged: false,
      controlledViolations,
      pedagogy:
        `This comparison is not a fair test: only the controlled variable ${names} changed, ` +
        `not the independent variable ${investigation.independentVariableId}. ` +
        `Change ${investigation.independentVariableId} and keep the rest fixed.`,
    };
  }

  return {
    validity: "valid",
    changes,
    independentChanged: true,
    controlledViolations,
    pedagogy: null,
  };
}

/**
 * The enforcing half of the controlled-investigation rule: block a comparison
 * that is not fair. Use `assessTrialChange` when the learner should instead be
 * told why the comparison is invalid.
 */
export function enforceControlledVariables(
  investigation: ControlledInvestigation,
  baseline: TrialConfig,
  candidate: TrialConfig
): ChangeAssessment {
  const assessment = assessTrialChange(investigation, baseline, candidate);
  if (assessment.validity === "controlled-variable-changed") {
    throw new DomainValidationError(
      "controlled-variable-changed",
      assessment.pedagogy ?? "A controlled variable changed between compared trials"
    );
  }
  if (assessment.validity === "multiple-variables-changed") {
    throw new DomainValidationError(
      "multiple-variables-changed",
      assessment.pedagogy ?? "More than one variable changed between compared trials"
    );
  }
  return assessment;
}
