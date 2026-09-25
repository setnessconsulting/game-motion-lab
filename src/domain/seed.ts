/**
 * Deterministic seeding and integrity digests (GAME-388 / ML-04).
 *
 * The frozen science contract allows a seeded pseudo-random generator at the
 * content/authoring layer only: randomness may choose *which* configuration a
 * seeded variant runs, and may never enter an authoritative motion
 * computation (docs/SCIENCE_MODEL.md section 6,
 * contracts/science-conventions.v1.json `determinism`).
 *
 * The digest here is a deterministic integrity invariant, not a security
 * boundary. See docs/EXPERIMENT_MODEL.md section 7.
 */

import { DomainValidationError } from "./errors.js";

/**
 * mulberry32, the generator family named in the frozen contract.
 *
 * Same seed always yields the same sequence, in this process and any other.
 */
export function createSeededRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0) {
    throw new DomainValidationError(
      "invalid-seed",
      `A variant seed must be a non-negative integer; received ${seed}`
    );
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick a deterministic index into `length` candidates from a seeded stream. */
export function seededIndex(random: () => number, length: number): number {
  if (!Number.isInteger(length) || length <= 0) {
    throw new DomainValidationError(
      "invalid-seed",
      `Seeded selection requires a positive candidate count; received ${length}`
    );
  }
  const index = Math.floor(random() * length);
  return index < 0 ? 0 : index >= length ? length - 1 : index;
}

/**
 * Canonical JSON: object keys sorted, no incidental whitespace.
 *
 * Two structurally equal values always serialise to the same string, which is
 * what makes the digest below stable across runs and across key-insertion
 * order. Arrays keep their order deliberately — sample order is scientific.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new DomainValidationError(
        "non-finite-configuration",
        "A non-finite number may never be serialised into evidence provenance"
      );
    }
    // Object.is distinguishes -0 from 0 so the digest changes if either does.
    return Object.is(value, -0) ? "-0" : JSON.stringify(value);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    // JSON.stringify turns an undefined array element into null; mirror that so
    // the canonical form really is valid JSON text.
    return `[${value.map((entry) => (entry === undefined ? "null" : canonicalJson(entry))).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const entry = record[key];
      // JSON.stringify omits an undefined object property; mirror that, so a
      // declared-but-absent optional field does not change the canonical form.
      if (entry === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalJson(entry)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new DomainValidationError(
    "non-finite-configuration",
    `Value of type ${typeof value} is not JSON-safe and may not enter evidence`
  );
}

/**
 * FNV-1a, 32 bit, returned as 8 lowercase hex characters.
 *
 * Implemented locally rather than imported from a crypto library so this
 * module stays pure TypeScript with no platform dependency, and so the value
 * is reproducible by a reviewer reading the record.
 */
export function digestOf(value: unknown): string {
  const text = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // hash *= 16777619, kept in 32-bit range without BigInt.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
