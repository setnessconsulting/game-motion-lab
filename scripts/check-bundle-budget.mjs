#!/usr/bin/env node
/**
 * Compare the current production build against the pinned ML-02 performance baseline.
 *
 * docs/PERFORMANCE.md §6: a material regression is remediated or explicitly waived; it is
 * never silently absorbed. The tolerance is the one stored NEXT TO the baseline, not a
 * number invented here to make a check pass.
 *
 * Usage:  npm run build && npm run perf:check
 * Exit:   0 = within tolerance, 1 = material regression or missing inputs.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASELINE_FILE = join(ROOT, "performance", "baseline.json");

function classify(assetPath) {
  if (assetPath.endsWith(".html")) return "html";
  if (assetPath.endsWith(".css")) return "css";
  if (/phaser-.*\.js$/.test(assetPath)) return "gameChunk";
  if (/renderer-.*\.js$/.test(assetPath)) return "rendererChunk";
  if (/\.js$/.test(assetPath)) return "initialJs";
  return "other";
}

function currentBuckets() {
  const buckets = { initialJs: 0, gameChunk: 0, rendererChunk: 0, css: 0, html: 0, other: 0 };
  for (const entry of readdirSync(DIST, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const absolute = join(entry.parentPath ?? DIST, entry.name);
    const kind = classify(relative(DIST, absolute).split(sep).join("/"));
    buckets[kind] += gzipSync(readFileSync(absolute), { level: 9 }).length;
  }
  return buckets;
}

function main() {
  if (!existsSync(BASELINE_FILE)) {
    console.error("performance/baseline.json not found. Run `npm run perf:baseline` first.");
    process.exit(1);
  }
  if (!existsSync(DIST)) {
    console.error("dist/ not found. Run `npm run build` first.");
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
  const tolerance = baseline.regressionTolerance ?? {};
  const before = baseline.bundle.bucketsGzipBytes;
  const after = currentBuckets();

  const checks = [
    ["initial JS", "initialJs", tolerance.initialJsGzipRatio],
    ["game chunk", "gameChunk", tolerance.gameChunkGzipRatio],
  ];

  console.log(`Pinned baseline: ${baseline.sourceSha} (ML-02)`);
  console.log(`Current build  : ${statSync(DIST).mtime.toISOString()}`);
  console.log("");

  let failed = 0;
  for (const [label, key, ratio] of checks) {
    const beforeBytes = before[key] ?? 0;
    const afterBytes = after[key];
    const delta = afterBytes - beforeBytes;
    const percent = beforeBytes > 0 ? (delta / beforeBytes) * 100 : 0;
    const allowed = (ratio ?? 0) * 100;
    const ok = beforeBytes === 0 ? true : percent <= allowed;
    if (!ok) failed += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"} ${label.padEnd(14)} ${(beforeBytes / 1024).toFixed(2)} -> ` +
        `${(afterBytes / 1024).toFixed(2)} kB gzip  (${delta >= 0 ? "+" : ""}${percent.toFixed(2)}%, ` +
        `allowed +${allowed.toFixed(2)}%)`
    );
  }

  const beforeTotal = Object.values(before).reduce((sum, value) => sum + value, 0);
  const afterTotal = Object.values(after).reduce((sum, value) => sum + value, 0);
  const totalRatio = (tolerance.totalPayloadGzipRatio ?? 0) * 100;
  const totalPercent = beforeTotal > 0 ? ((afterTotal - beforeTotal) / beforeTotal) * 100 : 0;
  const totalOk = totalPercent <= totalRatio;
  if (!totalOk) failed += 1;
  console.log(
    `${totalOk ? "PASS" : "FAIL"} ${"total payload".padEnd(14)} ${(beforeTotal / 1024).toFixed(2)} -> ` +
      `${(afterTotal / 1024).toFixed(2)} kB gzip  (${totalPercent >= 0 ? "+" : ""}${totalPercent.toFixed(2)}%, ` +
      `allowed +${totalRatio.toFixed(2)}%)`
  );

  console.log("");
  if (failed > 0) {
    console.log(`${failed} metric(s) exceed the recorded tolerance.`);
    console.log(
      "Remediate the regression, or record an explicit, owner-approved waiver in docs/DECISIONS.md."
    );
    process.exit(1);
  }
  console.log("Within the recorded tolerance.");
}

main();
