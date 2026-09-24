/**
 * Shared git state helpers for the performance evidence scripts (GAME-384 / ML-02).
 *
 * Why this is shared rather than duplicated: `workingTreeDirty` is a truth claim about
 * evidence, and two scripts disagreeing about what it means would be worse than not
 * recording it at all.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..", "..");

/**
 * Paths that hold *generated evidence* rather than source.
 *
 * These are excluded from the dirty-tree check on purpose. The baseline record embeds the
 * source SHA of the commit it describes, so writing the record necessarily modifies a
 * tracked file — which would make `workingTreeDirty` permanently true and therefore
 * meaningless. `"dirty"` is only useful as "the measured code differs from the named
 * commit", so the check asks exactly that question.
 */
const EVIDENCE_PATHS = ["performance/", "performance-results/"];

export function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** The commit the evidence describes. */
export function headSha() {
  return git(["rev-parse", "HEAD"]);
}

export function currentBranch() {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]);
}

/** Tracked-source modifications, excluding the generated evidence directories. */
export function codeChanges() {
  const porcelain = git(["status", "--porcelain"]);
  if (porcelain === null) return null;
  return porcelain
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.replace(/^[A-Z?!]{1,2}\s+/, "").replace(/^"(.*)"$/, "$1"))
    .filter((path) => !EVIDENCE_PATHS.some((prefix) => path.startsWith(prefix)));
}

/**
 * True when the working tree differs from HEAD in a way that matters for the measurement:
 * source, configuration, or tests changed.
 */
export function codeTreeDirty() {
  const changes = codeChanges();
  return changes === null ? null : changes.length > 0;
}

/** The source paths that differ from HEAD, for the record and for human diagnosis. */
export function codeTreeDirtyPaths() {
  return codeChanges() ?? [];
}
