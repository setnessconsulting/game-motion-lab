#!/usr/bin/env node
/**
 * Lighthouse lab capture for Motion Lab (GAME-384 / ML-02, acceptance criterion 3).
 *
 * GAME-384 requires an "initial JS/chunk/Lighthouse/frame baseline ... recorded against the
 * exact SHA". scripts/perf-baseline.mjs covers the bundle and the Playwright frame/input
 * metrics; this script produces the Lighthouse row.
 *
 * Deliberate constraints:
 *   - It drives a Chrome binary that is ALREADY in the repository's toolchain: the Chromium
 *     that Playwright installed, resolved from playwright-core. Nothing is downloaded here,
 *     so the capture is reproducible from a clean clone after `npx playwright install chromium`.
 *   - It serves `dist/` from an in-process static server on the IPv4 loopback, so the capture
 *     does not depend on `vite preview`'s host binding (which is IPv6-only on some Windows
 *     hosts and previously broke every browser lane).
 *   - The result is written to performance/lighthouse.json and is labelled a LAB measurement.
 *     No Lighthouse score is used as a passing threshold. Scores are environment-dependent and
 *     inventing a threshold from one run would be exactly the anti-pattern docs/PERFORMANCE.md
 *     forbids.
 *
 * Usage:  npm run build && npm run perf:lighthouse
 */

import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright-core";
import { codeTreeDirty, headSha } from "./lib/repo-state.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const OUT_DIR = join(ROOT, "performance");
const OUT_FILE = join(OUT_DIR, "lighthouse.json");
const PORT = Number(process.env.MOTION_LAB_LIGHTHOUSE_PORT ?? 4193);
const ORIGIN = `http://127.0.0.1:${PORT}`;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Types worth compressing; matches what a production static host would send gzipped. */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".svg", ".map"]);

/**
 * Serve dist/ so the measurement is of the real production artifact, not a dev server.
 *
 * Responses are gzipped the way a production static host would send them. This matters
 * more than it looks: served raw, the 1.37 MB Phaser chunk dominates the transfer and
 * inflates LCP on the throttled mobile profile by multiples, which would make the recorded
 * baseline a measurement of this script rather than of the game.
 */
function startStaticServer() {
  const server = createServer(async (request, response) => {
    const urlPath = decodeURIComponent(new URL(request.url ?? "/", ORIGIN).pathname);
    const requested = urlPath === "/" ? "/index.html" : urlPath;
    // Contain the path inside dist/: normalize and re-join, then confirm containment.
    const target = join(DIST, normalize(requested).replace(/^([/\\])+/, ""));
    if (!target.startsWith(DIST)) {
      response.writeHead(403).end("forbidden");
      return;
    }

    const send = (file, body) => {
      const extension = extname(file).toLowerCase();
      const headers = {
        "content-type": MIME[extension] ?? "application/octet-stream",
        "cache-control": "no-store",
        vary: "accept-encoding",
      };
      const acceptsGzip = /gzip/.test(request.headers["accept-encoding"] ?? "");
      if (acceptsGzip && COMPRESSIBLE.has(extension) && body.length > 512) {
        headers["content-encoding"] = "gzip";
        response.writeHead(200, headers);
        response.end(gzipSync(body, { level: 9 }));
        return;
      }
      response.writeHead(200, headers);
      response.end(body);
    };

    try {
      const info = await stat(target);
      const file = info.isDirectory() ? join(target, "index.html") : target;
      send(file, await readFile(file));
    } catch {
      // SPA fallback so a deep link still resolves to the shell.
      try {
        const shell = join(DIST, "index.html");
        send(shell, await readFile(shell));
      } catch {
        response.writeHead(404).end("not found");
      }
    }
  });

  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(PORT, "127.0.0.1", () => resolveServer(server));
  });
}

function readMetrics(lhr) {
  const numeric = (id) => {
    const audit = lhr.audits?.[id];
    return audit && typeof audit.numericValue === "number" ? audit.numericValue : null;
  };
  const category = lhr.categories?.performance;
  return {
    performanceScore: category && typeof category.score === "number" ? category.score : null,
    lcpMs: numeric("largest-contentful-paint"),
    cls: numeric("cumulative-layout-shift"),
    tbtMs: numeric("total-blocking-time"),
    fcpMs: numeric("first-contentful-paint"),
    speedIndexMs: numeric("speed-index"),
    bootupTimeMs: numeric("bootup-time"),
    mainThreadWorkMs: numeric("mainthread-work-breakdown"),
    // Recording the throttling model matters: a score without it is not comparable.
    throttling: {
      method: lhr.configSettings?.throttlingMethod ?? null,
      cpuSlowdownMultiplier: lhr.configSettings?.throttling?.cpuSlowdownMultiplier ?? null,
      rttMs: lhr.configSettings?.throttling?.rttMs ?? null,
      throughputKbps: lhr.configSettings?.throttling?.throughputKbps ?? null,
      formFactor: lhr.configSettings?.formFactor ?? null,
    },
    emulatedDevice: lhr.configSettings?.emulatedFormFactor ?? lhr.configSettings?.formFactor ?? null,
    lighthouseVersion: lhr.lighthouseVersion,
  };
}

async function main() {
  if (!existsSync(DIST)) {
    console.error("dist/ not found. Run `npm run build` first.");
    process.exit(1);
  }

  const chromePath = chromium.executablePath();
  if (!existsSync(chromePath)) {
    console.error(
      `Chromium not found at ${chromePath}. Run \`npx playwright install chromium\` first.`
    );
    process.exit(1);
  }

  const server = await startStaticServer();
  let chrome = null;

  try {
    chrome = await launch({
      chromePath,
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });

    const result = await lighthouse(ORIGIN, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices"],
    });

    if (!result) throw new Error("Lighthouse returned no result");

    const lhr = result.lhr;
    const accessibleScore = lhr.categories?.accessibility?.score ?? null;

    const record = {
      schemaVersion: 1,
      milestone: "ML-02",
      jiraAuthority: "GAME-382",
      capturedBy: "GAME-384",
      sourceSha: headSha(),
      // The generated evidence directories are excluded, since writing this record modifies a
      // tracked file. See scripts/lib/repo-state.mjs.
      workingTreeDirty: codeTreeDirty(),
      capturedAt: new Date().toISOString(),
      target: `${ORIGIN}/`,
      measurementLabel:
        "Lighthouse LAB measurement of the production dist/ served over loopback with gzip and default simulated throttling; NOT field data",
      hostingAssumption:
        "Responses were gzipped because a production static host compresses text assets. If the games-site host does not compress, every number here is pessimistic and must be re-captured. ML-HOST/ML-15 must confirm the real host's compression and cache headers.",
      toolchain: {
        node: process.version,
        lighthouse: lhr.lighthouseVersion,
        chrome: chromePath,
        platform: `${process.platform}-${process.arch}`,
      },
      metrics: readMetrics(lhr),
      // Recorded for information only. Automated accessibility auditing is assistive and is
      // never accessibility sign-off (docs/ACCESSIBILITY.md).
      accessibilityAuditScoreNotSignOff: accessibleScore,
      thresholds: {
        enforced: false,
        reason:
          "No Lighthouse score is a project threshold. Scores vary with host, CPU contention, and throttle model; docs/PERFORMANCE.md requires a pinned baseline and explicit, recorded tolerances rather than invented limits. The enforceable numbers live in performance/baseline.json.",
      },
    };

    await mkdir(OUT_DIR, { recursive: true });
    await writeFile(OUT_FILE, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const m = record.metrics;
    console.log("Motion Lab Lighthouse lab capture");
    console.log(`  source SHA     : ${record.sourceSha} (dirty: ${record.workingTreeDirty})`);
    console.log(`  lighthouse     : ${m.lighthouseVersion} (${m.throttling.method})`);
    console.log(`  performance    : ${m.performanceScore}`);
    console.log(`  LCP            : ${m.lcpMs} ms`);
    console.log(`  CLS            : ${m.cls}`);
    console.log(`  TBT            : ${m.tbtMs} ms`);
    console.log(`  wrote ${relative(ROOT, OUT_FILE)}`);
  } finally {
    // Chrome cleanup is best-effort: on Windows the temporary profile directory can still
    // be locked when the process exits, which throws EPERM after the capture has already
    // succeeded. A cleanup failure must not turn a good measurement into a failed run.
    if (chrome) {
      try {
        await chrome.kill();
      } catch (error) {
        console.warn(`  note: Chrome profile cleanup skipped (${error?.code ?? error?.message})`);
      }
    }
    await new Promise((done) => server.close(done));
  }
}

main().catch((error) => {
  console.error(`Lighthouse capture failed: ${error?.message ?? error}`);
  process.exit(1);
});
