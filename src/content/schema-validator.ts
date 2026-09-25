/**
 * A dependency-free validator for the JSON Schema subset Motion Lab uses.
 *
 * `contracts/scenario-provenance.schema.json` is a JSON Schema 2020-12 file.
 * Pulling in a full schema library for one frozen file would add a runtime
 * dependency to a repository whose whole point is a small, auditable
 * dependency list (ADR 0001, docs/ARCHITECTURE.md section 7). So this module
 * implements exactly the keywords that file uses, and *fails closed on any
 * keyword it does not implement*.
 *
 * That last part is the important design choice. A validator that silently
 * ignores an unknown keyword would report a scenario as valid because of a
 * constraint nobody checked. Here, an unimplemented keyword is a validation
 * error with a precise path, so the frozen schema and this validator cannot
 * drift apart without the gate going red.
 *
 * Pure: it takes an already-parsed schema and an already-parsed value. Reading
 * files is the caller's job, which keeps this module usable from a test, a
 * Node script, or a future content pipeline without change.
 */

/** The keywords this validator implements. Anything else is an error. */
const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema",
  "$id",
  "title",
  "description",
  "$comment",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "allOf",
  "if",
  "then",
  "else",
  "format",
]);

export interface SchemaViolation {
  /** JSON pointer-ish path to the offending value. */
  readonly path: string;
  readonly message: string;
}

type SchemaNode = Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  if (expected === "integer") return actual === "integer";
  return actual === expected;
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index]) &&
      leftKeys.every((key) => deepEqual(left[key], right[key]))
    );
  }
  return false;
}

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

function describe(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return canonical(value) ?? String(value);
}

function child(path: string, key: string | number): string {
  const segment = String(key);
  if (path === "") return segment;
  return typeof key === "number" ? `${path}[${segment}]` : `${path}.${segment}`;
}

function validateNode(
  schema: SchemaNode,
  value: unknown,
  path: string,
  violations: SchemaViolation[]
): void {
  for (const keyword of Object.keys(schema)) {
    if (SUPPORTED_KEYWORDS.has(keyword)) continue;
    violations.push({
      path,
      message:
        `schema uses the unimplemented keyword ${JSON.stringify(keyword)}; the validator ` +
        `fails closed rather than ignoring a constraint it has not checked`,
    });
  }

  const declaredType = schema["type"];
  if (declaredType !== undefined) {
    const expected = Array.isArray(declaredType)
      ? (declaredType as unknown[]).map((entry) => String(entry))
      : [String(declaredType)];
    if (!expected.some((candidate) => matchesType(value, candidate))) {
      violations.push({
        path,
        message: `expected type ${expected.join(" or ")} but received ${typeOf(value)}`,
      });
      return;
    }
  }

  if ("const" in schema && !deepEqual(value, schema["const"])) {
    violations.push({ path, message: `expected the constant ${describe(schema["const"])}` });
  }

  const allowed = schema["enum"];
  if (Array.isArray(allowed) && !allowed.some((entry) => deepEqual(entry, value))) {
    violations.push({
      path,
      message: `value ${describe(value)} is not one of the ${allowed.length} permitted values`,
    });
  }

  if (typeof value === "string") validateString(schema, value, path, violations);
  if (typeof value === "number") validateNumber(schema, value, path, violations);
  if (Array.isArray(value)) validateArray(schema, value, path, violations);
  if (isPlainObject(value)) validateObject(schema, value, path, violations);

  for (const branch of asArray(schema["allOf"])) {
    if (!isPlainObject(branch)) continue;
    validateNode(branch, value, path, violations);
  }

  if (isPlainObject(schema["if"])) {
    const condition: SchemaViolation[] = [];
    validateNode(schema["if"], value, path, condition);
    const chosen = condition.length === 0 ? schema["then"] : schema["else"];
    if (isPlainObject(chosen)) validateNode(chosen, value, path, violations);
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function validateString(
  schema: SchemaNode,
  value: string,
  path: string,
  violations: SchemaViolation[]
): void {
  const minLength = schema["minLength"];
  if (typeof minLength === "number" && value.length < minLength) {
    violations.push({ path, message: `is shorter than the required length ${minLength}` });
  }
  const maxLength = schema["maxLength"];
  if (typeof maxLength === "number" && value.length > maxLength) {
    violations.push({ path, message: `is longer than the allowed length ${maxLength}` });
  }
  const pattern = schema["pattern"];
  if (typeof pattern === "string") {
    // JSON Schema patterns are unanchored ECMA-262 regular expressions.
    const expression = new RegExp(pattern, "u");
    if (!expression.test(value)) {
      violations.push({ path, message: `does not match the required pattern ${pattern}` });
    }
  }
  if (schema["format"] === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    violations.push({ path, message: `is not an ISO calendar date (expected YYYY-MM-DD)` });
  }
}

function validateNumber(
  schema: SchemaNode,
  value: number,
  path: string,
  violations: SchemaViolation[]
): void {
  if (!Number.isFinite(value)) {
    violations.push({ path, message: "is not a finite number" });
    return;
  }
  const minimum = schema["minimum"];
  if (typeof minimum === "number" && value < minimum) {
    violations.push({ path, message: `is below the minimum ${minimum}` });
  }
  const maximum = schema["maximum"];
  if (typeof maximum === "number" && value > maximum) {
    violations.push({ path, message: `is above the maximum ${maximum}` });
  }
  const exclusiveMinimum = schema["exclusiveMinimum"];
  if (typeof exclusiveMinimum === "number" && value <= exclusiveMinimum) {
    violations.push({ path, message: `is not above the exclusive minimum ${exclusiveMinimum}` });
  }
  const exclusiveMaximum = schema["exclusiveMaximum"];
  if (typeof exclusiveMaximum === "number" && value >= exclusiveMaximum) {
    violations.push({ path, message: `is not below the exclusive maximum ${exclusiveMaximum}` });
  }
  const multipleOf = schema["multipleOf"];
  if (typeof multipleOf === "number" && multipleOf > 0) {
    const ratio = value / multipleOf;
    if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
      violations.push({ path, message: `is not a multiple of ${multipleOf}` });
    }
  }
}

function validateArray(
  schema: SchemaNode,
  value: readonly unknown[],
  path: string,
  violations: SchemaViolation[]
): void {
  const minItems = schema["minItems"];
  if (typeof minItems === "number" && value.length < minItems) {
    violations.push({ path, message: `has ${value.length} items but at least ${minItems} required` });
  }
  const maxItems = schema["maxItems"];
  if (typeof maxItems === "number" && value.length > maxItems) {
    violations.push({ path, message: `has ${value.length} items but at most ${maxItems} allowed` });
  }
  if (schema["uniqueItems"] === true) {
    const seen = new Set<string>();
    for (const entry of value) {
      const key = canonical(entry);
      if (seen.has(key)) {
        violations.push({ path, message: `repeats the item ${key}; items must be unique` });
        break;
      }
      seen.add(key);
    }
  }
  const items = schema["items"];
  if (isPlainObject(items)) {
    value.forEach((entry, index) => validateNode(items, entry, child(path, index), violations));
  }
}

function validateObject(
  schema: SchemaNode,
  value: Record<string, unknown>,
  path: string,
  violations: SchemaViolation[]
): void {
  const required = asArray(schema["required"]).map((entry) => String(entry));
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      violations.push({ path: child(path, key), message: "is required but absent" });
    }
  }
  const properties = isPlainObject(schema["properties"]) ? schema["properties"] : {};
  for (const [key, entry] of Object.entries(value)) {
    const propertySchema = properties[key];
    if (isPlainObject(propertySchema)) {
      validateNode(propertySchema, entry, child(path, key), violations);
      continue;
    }
    if (schema["additionalProperties"] === false) {
      violations.push({
        path: child(path, key),
        message: "is not permitted; this value is closed against unlisted properties",
      });
    }
  }
}

/**
 * Validate `value` against `schema`.
 *
 * Returns an empty array when the value conforms. Every violation carries a
 * path, so a content author is told which field to fix rather than merely
 * that something is wrong.
 */
export function validateAgainstSchema(schema: unknown, value: unknown): SchemaViolation[] {
  const violations: SchemaViolation[] = [];
  if (!isPlainObject(schema)) {
    return [{ path: "", message: "the schema itself is not a JSON object" }];
  }
  validateNode(schema, value, "", violations);
  return violations;
}
