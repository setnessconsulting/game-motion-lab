/**
 * Typed validation errors for the analytical motion kernel.
 *
 * The kernel rejects invalid inputs rather than clamping or guessing
 * (docs/SCIENCE_MODEL.md §5). Callers must handle these errors; they must never
 * become silent NaN in trial evidence.
 */

export type ScienceValidationCode =
  | "non-positive-mass"
  | "non-finite-input"
  | "negative-time"
  | "sample-outside-window"
  | "unsupported-force-model"
  | "invalid-resistive-magnitude"
  | "invalid-resistive-direction"
  | "reversal-crossing-window"
  | "empty-force-list"
  | "invalid-segment"
  | "invalid-observation-window";

export class ScienceValidationError extends Error {
  readonly code: ScienceValidationCode;

  constructor(code: ScienceValidationCode, message: string) {
    super(message);
    this.name = "ScienceValidationError";
    this.code = code;
  }
}

export function isScienceValidationError(value: unknown): value is ScienceValidationError {
  return value instanceof ScienceValidationError;
}
