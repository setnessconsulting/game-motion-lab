#!/usr/bin/env node
/**
 * Release manifest (GAME-385 / ML-HOST acceptance criterion 3).
 *
 * Writes the immutable-candidate identity that lets a hosted artifact be traced back to
 * exact source. games-site serves `release-manifest.json` from the same versioned prefix as
 * the build, and `--check` recomputes every artifact hash and the source SHA so drift is
 * detectable rather than assumed away.
 *
 *   node scripts/create-release-manifest.mjs dist            # write the manifest
 *   node scripts/create-release-manifest.mjs dist --check    # verify it still matches
 *
 * The manifest is metadata and is deliberately not self-hashed.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import {
  ROOT,
  assetPrefix,
  entryFile,
  identity,
  objectPrefix,
  packageJson,
  releaseVersion,
} from "./lib/host-identity.mjs";
import { codeTreeDirty, codeTreeDirtyPaths, currentBranch, headSha } from "./lib/repo-state.mjs";

const MANIFEST_NAME = "release-manifest.json";

const targetArgument = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const target = join(ROOT, targetArgument ?? "dist");
const check = process.argv.includes("--check");

if (!existsSync(target)) {
  console.error(`FAIL: ${relative(ROOT, target)} does not exist. Run the build first.`);
  process.exit(1);
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function walk(dir, accumulator = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, accumulator);
    else accumulator.push(path);
  }
  return accumulator;
}

function lockIdentity() {
  const lockPath = join(ROOT, "package-lock.json");
  if (!existsSync(lockPath)) return "no-lockfile";
  return sha256(readFileSync(lockPath));
}

const files = walk(target)
  .map((path) => relative(target, path).split("\\").join("/"))
  .filter((path) => path !== MANIFEST_NAME)
  .sort()
  .map((path) => {
    const buffer = readFileSync(join(target, path));
    return {
      path,
      bytes: buffer.length,
      sha256: sha256(buffer),
      contentType:
        path.endsWith(".html")
          ? "text/html; charset=utf-8"
          : path.endsWith(".js")
            ? "text/javascript; charset=utf-8"
            : path.endsWith(".css")
              ? "text/css; charset=utf-8"
              : path.endsWith(".json")
                ? "application/json; charset=utf-8"
                : "application/octet-stream",
    };
  });

if (check) {
  const manifestPath = join(target, MANIFEST_NAME);
  if (!existsSync(manifestPath)) {
    console.error(`FAIL: ${MANIFEST_NAME} is missing; the candidate has no verifiable identity.`);
    process.exit(1);
  }
  const existing = JSON.parse(readFileSync(manifestPath, "utf8"));
  const problems = [];

  const currentSourceSha = headSha();
  if (existing.sourceSha !== currentSourceSha) {
    problems.push(
      `source SHA drifted: manifest has ${existing.sourceSha}, HEAD is ${currentSourceSha}`
    );
  }

  const currentVersion = releaseVersion();
  if (existing.releaseVersion !== currentVersion) {
    problems.push(
      `release version drifted: manifest has ${existing.releaseVersion}, this run resolves ${currentVersion}`
    );
  }

  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const recorded of existing.files ?? []) {
    const actual = byPath.get(recorded.path);
    if (!actual) {
      problems.push(`${recorded.path} is recorded in the manifest but missing from the artifact`);
      continue;
    }
    if (actual.sha256 !== recorded.sha256) {
      problems.push(`${recorded.path} content hash changed`);
    }
    if (actual.bytes !== recorded.bytes) {
      problems.push(`${recorded.path} byte length changed`);
    }
    byPath.delete(recorded.path);
  }
  for (const extra of byPath.keys()) {
    problems.push(`${extra} is in the artifact but not recorded in the manifest`);
  }

  if (problems.length > 0) {
    console.error("FAIL: release manifest does not match the artifact\n");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(
    `PASS: release manifest matches the artifact exactly (${files.length} files, ` +
      `source ${existing.sourceSha.slice(0, 12)}, version ${existing.releaseVersion}).`
  );
  process.exit(0);
}

const version = releaseVersion();

const manifest = {
  schemaVersion: 1,
  gameSlug: identity.gameSlug,
  releaseVersion: version,
  sourceSha: headSha(),
  sourceBranch: currentBranch(),
  sourceTreeDirty: codeTreeDirty(),
  sourceTreeDirtyPaths: codeTreeDirtyPaths(),
  dependencyLockIdentity: lockIdentity(),
  packageVersion: packageJson.version,
  entryFile: entryFile(),
  assetPrefix: assetPrefix(version),
  objectPrefix: objectPrefix(version),
  hostedBy: "setnessconsulting/games-site",
  hostContract: "setnessconsulting/games-site docs/motion-lab-host-contract.md",
  // No mtimes or build timestamps are recorded: a build timestamp would make the manifest
  // differ between two byte-identical rebuilds, which is exactly what immutability forbids.
  files,
};

mkdirSync(target, { recursive: true });
writeFileSync(join(target, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `Wrote ${MANIFEST_NAME}: ${files.length} files, version ${manifest.releaseVersion}, ` +
    `source ${manifest.sourceSha.slice(0, 12)} (dirty: ${manifest.sourceTreeDirty}).`
);
console.log(`  asset prefix : ${manifest.assetPrefix}`);
console.log(`  object prefix: ${manifest.objectPrefix}`);
