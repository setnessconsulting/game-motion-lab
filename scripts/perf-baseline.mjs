#!/usr/bin/env node
/**
 * Capture the Motion Lab performance baseline (GAME-384 / ML-02).
 *
 * docs/PERFORMANCE.md §5 requires ML-02 to capture a clean, exact-SHA baseline of the
 * foundation build. This script:
 *   - reads the production build in dist/ and records raw + gzip bytes per asset;
 *   - binds the record to the exact source SHA and the toolchain versions; and
 *   - folds in the browser-lab metrics recorded by tests/e2e/performance.spec.ts if
 *     they are present.
 *
 * It does NOT invent thresholds. The only budget recorded here is the regression
 * tolerance stored next to the baseline itself (delegated decision G-01 in
 * docs/DECISIONS.md), which scripts/check-bundle-budget.mjs then enforces.
 *
 * Lighthouse is intentionally not run by this script: it is not a dependency of this
 * repository, and a previous portfolio repository recorded that the pinned Chrome
 * launcher fails on this Windows workstation. LCP/CLS are measured in a real browser
 * by the performance lane instead, and are labelled as browser-lab measurements.
 * Field metrics (CrUX INP) remain unknown/pending: the game ships no learner telemetry.
 *
 * Usage:  npm run build && npm run perf:baseline
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASELINE_DIR = join(ROOT, "performance");
const BASELINE_FILE = join(BASELINE_DIR, "baseline.json");
const RUNTIME_FILE = join(ROOT, "performance-results", "runtime.json");
const LIGHTHOUSE_FILE = join(ROOT, "performance", "lighthouse.json");

/** Regression tolerance stored WITH the baseline. A change here is a recorded decision. */
const REGRESSION_TOLERANCE = {
  initialJsGzipRatio: 0.05,
  gameChunkGzipRatio: 0.05,
  totalPayloadGzipRatio: 0.05,
  rationale:
    "Set alongside the ML-02 baseline (delegated decision G-01). A 5% band absorbs build-tool noise without hiding a real payload regression.",
};

function git(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** The commit the baseline describes. Used to reject a stale Lighthouse record. */
function headSha() {
  return git(["rev-parse", "HEAD"]);
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath ?? dir, entry.name);
    out.push(absolute);
  }
  return out;
}

function describe(absolutePath) {
  const bytes = readFileSync(absolutePath);
  return {
    path: relative(DIST, absolutePath).split(sep).join("/"),
    rawBytes: statSync(absolutePath).size,
    gzipBytes: gzipSync(bytes, { level: 9 }).length,
  };
}

function classify(assetPath) {
  if (assetPath.endsWith(".html")) return "html";
  if (assetPath.endsWith(".css")) return "css";
  if (/phaser-.*\.js$/.test(assetPath)) return "gameChunk";
  if (/renderer-.*\.js$/.test(assetPath)) return "rendererChunk";
  if (/\.js$/.test(assetPath)) return "initialJs";
  return "other";
}

function main() {
  if (!existsSync(DIST)) {
    console.error("dist/ not found. Run `npm run build` first.");
    process.exit(1);
  }

  const files = walk(DIST).map(describe);
  const buckets = { initialJs: 0, gameChunk: 0, rendererChunk: 0, css: 0, html: 0, other: 0 };
  const assets = files.map((file) => {
    const kind = classify(file.path);
    buckets[kind] += file.gzipBytes;
    return { ...file, kind };
  });

  const totalGzip = assets.reduce((sum, asset) => sum + asset.gzipBytes, 0);

  let runtimeMetrics = null;
  let runtimeMetricsReason = null;
  if (existsSync(RUNTIME_FILE)) {
    runtimeMetrics = JSON.parse(readFileSync(RUNTIME_FILE, "utf8"));
  } else {
    runtimeMetricsReason =
      "tests/e2e/performance.spec.ts has not been run in this checkout; run `npm run test:phaser-render` before capturing the baseline.";
  }

  // The Lighthouse row satisfies GAME-384 acceptance criterion 3. It is a separate record
  // (scripts/lighthouse-baseline.mjs) because it needs its own Chrome launch; this file folds
  // it in so a reader has one entry point. It carries its own SHA, which is checked here: a
  // Lighthouse row captured from different code would silently misrepresent this baseline.
  let lighthouse = null;
  let lighthouseReason = null;
  if (existsSync(LIGHTHOUSE_FILE)) {
    const record = JSON.parse(readFileSync(LIGHTHOUSE_FILE, "utf8"));
    if (record.sourceSha !== headSha()) {
      lighthouseReason = `performance/lighthouse.json was captured at ${record.sourceSha}, not ${headSha()}; re-run \`npm run perf:lighthouse\` on this commit.`;
    } else {
      lighthouse = record;
    }
  } else {
    lighthouseReason = "not captured; run `npm run perf:lighthouse` before capturing the baseline.";
  }

  const baseline = {
    schemaVersion: 1,
    milestone: "ML-02",
    jiraAuthority: "GAME-382",
    capturedBy: "GAME-384",
    sourceSha: headSha(),
    sourceBranch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    workingTreeDirty: (git(["status", "--porcelain"]) ?? "") !== "",
    capturedAt: new Date().toISOString(),
    toolchain: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
    },
    measurementLabels: {
      bundle: "exact production build output (Vite), gzip level 9",
      lcpCls: "browser lab (Chromium via Playwright, PerformanceObserver) - NOT field data",
      field: "unavailable: no learner telemetry and no public CrUX-eligible route",
      lighthouse: "not run: not a repository dependency; see docs/PERFORMANCE.md",
    },
    bundle: {
      bucketsGzipBytes: buckets,
      totalGzipBytes: totalGzip,
      assets,
    },
    runtimeMetrics,
    runtimeMetricsReason,
    lighthouse,
    lighthouseReason,
    regressionTolerance: REGRESSION_TOLERANCE,
  };

  mkdirSync(BASELINE_DIR, { recursive: true });
  writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");

  console.log("Motion Lab performance baseline captured");
  console.log(`  source SHA    : ${baseline.sourceSha}`);
  console.log(`  initial JS    : ${(buckets.initialJs / 1024).toFixed(2)} kB gzip`);
  console.log(`  game chunk    : ${(buckets.gameChunk / 1024).toFixed(2)} kB gzip`);
  console.log(`  renderer chunk: ${(buckets.rendererChunk / 1024).toFixed(2)} kB gzip`);
  console.log(`  css           : ${(buckets.css / 1024).toFixed(2)} kB gzip`);
  console.log(`  total payload : ${(totalGzip / 1024).toFixed(2)} kB gzip`);
  console.log(
    `  runtime metrics: ${runtimeMetrics === null ? "not captured (see runtimeMetricsReason)" : "captured"}`
  );
  console.log(
    `  lighthouse     : ${lighthouse === null ? `not captured (${lighthouseReason})` : `perf ${lighthouse.metrics.performanceScore}, LCP ${lighthouse.metrics.lcpMs?.toFixed(0)} ms`}`
  );
  console.log(`  wrote ${relative(ROOT, BASELINE_FILE)}`);
}

main();
