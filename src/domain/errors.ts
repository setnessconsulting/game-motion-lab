/**
 * Typed domain validation errors for the experiment/evidence layer
 * (GAME-388 / ML-04).
 *
 * The domain fails closed, exactly as the science kernel does: an invalid
 * investigation request is rejected with a typed error rather than being
 * clamped, guessed, or silently accepted. Nothing here may degrade into a
 * non-finite value inside stored trial evidence (docs/SCIENCE_MODEL.md
 * section 5).
 *
 * Purity: no DOM, React, Phaser, storage, or network. See
 * tests/architecture/purity.test.ts and eslint.config.js.
 */

export type DomainValidationCode =
  | "empty-variable-set"
  | "unknown-variable"
  | "duplicate-trial-identity"
  | "immutable-trial-record"
  | "non-finite-configuration"
  | "configuration-out-of-bounds"
  | "multiple-variables-changed"
  | "controlled-variable-changed"
  | "no-baseline-trial"
  | "unverified-evidence"
  | "unknown-trial-reference"
  | "empty-comparison-selection"
  | "invalid-seed";

/**
 * A rejected domain operation. Carries a machine-readable `code` so the
 * presentation layer can choose between *preventing* the action and
 * *pedagogically surfacing* it (docs/EXPERIMENT_MODEL.md).
 */
export class DomainValidationError extends Error {
  readonly code: DomainValidationCode;

  constructor(code: DomainValidationCode, message: string) {
    super(message);
    this.name = "DomainValidationError";
    this.code = code;
  }
}

export function isDomainValidationError(value: unknown): value is DomainValidationError {
  return value instanceof DomainValidationError;
}
