/**
 * What counts as learner payload (GAME-384 / GAME-385).
 *
 * The bundle metric exists to answer "how much does a learner download". Release metadata
 * is not downloaded by the game, so folding it into the payload number would make the
 * tracked metric drift for a reason that has nothing to do with the learner, and would
 * eventually force a tolerance increase that hides a real regression.
 *
 * Both the baseline capture and the budget check import this so they cannot disagree about
 * what they are measuring.
 */

/** Files that describe the artifact rather than being part of it. */
export const NON_PAYLOAD_FILES = ["release-manifest.json"];

export function isPayloadFile(relativePath) {
  const normalized = relativePath.split("\\").join("/");
  const name = normalized.split("/").pop() ?? "";
  return !NON_PAYLOAD_FILES.includes(name);
}
