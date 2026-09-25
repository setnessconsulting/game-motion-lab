/**
 * Motion Lab host identity (GAME-385 / ML-HOST).
 *
 * One reader for the facts that the game repository and games-site must agree on:
 * the slug, the entry document, and the versioned asset prefix. Both the nested host
 * server and the release manifest import this, so a prefix that drifts in one place
 * cannot disagree with the other.
 *
 * The games-site counterpart of this contract is
 * games-site `docs/motion-lab-host-contract.md`.
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..", "..");

/** games-site's own VERSION_PATTERN, restated so a version it would reject fails locally. */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export const identity = readJson(join(ROOT, "host-identity.json"));

export const packageJson = readJson(join(ROOT, "package.json"));

/**
 * The immutable version this artifact is published under.
 *
 * `MOTION_LAB_VERSION` wins so a qualification run can pin an exact candidate; otherwise
 * the version is the package version plus the reviewed qualifier. A bare package version
 * would not be immutable enough to be a release identity, and an unqualified `0.1.0`
 * would silently collide with the next rebuild.
 */
export function releaseVersion() {
  const override = process.env.MOTION_LAB_VERSION?.trim();
  if (override) {
    if (!VERSION_PATTERN.test(override)) {
      throw new Error(
        `MOTION_LAB_VERSION "${override}" is not path-safe; games-site would reject it.`
      );
    }
    return override;
  }
  const derived = `${packageJson.version}-${identity.releaseQualifier}`;
  if (!VERSION_PATTERN.test(derived)) {
    throw new Error(`Derived release version "${derived}" is not path-safe.`);
  }
  return derived;
}

/** The exact asset base games-site serves this artifact from, without a trailing slash. */
export function assetPrefix(version = releaseVersion()) {
  return `${identity.assetPrefixBase}/${identity.gameSlug}/${version}`;
}

/** The R2 object prefix that `assetPrefix()` maps onto. */
export function objectPrefix(version = releaseVersion()) {
  return `${identity.gameSlug}/${version}`;
}

export function entryFile() {
  return identity.entryFile;
}
