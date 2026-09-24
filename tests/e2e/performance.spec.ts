/**
 * Performance measurement lane (GAME-384 baseline capture).
 *
 * This is a MEASUREMENT lane, not a gate: it records lab metrics and writes them to
 * performance-results/runtime.json so scripts/perf-baseline.mjs can bind them to the
 * exact source SHA. It deliberately asserts only that the measurements exist and are
 * sane, because inventing a threshold here would be exactly the "invented budget"
 * the ML-01 contract forbids (docs/PERFORMANCE.md §1).
 *
 * Field metrics (CrUX INP) are NOT available and are recorded as unknown/pending; the
 * game deliberately ships no learner telemetry.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const OUTPUT_DIR = resolve(process.cwd(), "performance-results");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "runtime.json");

interface BrowserMetrics {
  lcpMs: number | null;
  cls: number | null;
  domContentLoadedMs: number | null;
  longTasks: { count: number; maxMs: number; totalMs: number };
  firstUsefulActionMs: number;
  inputToFrameMs: number | null;
  stateTransitionMs: number;
  rendererFramesPerSecond: number | null;
  heapStartBytes: number | null;
  heapEndBytes: number | null;
}

async function readMetrics(page: Page): Promise<Omit<BrowserMetrics, "heapStartBytes" | "heapEndBytes">> {
  return page.evaluate(async () => {
    const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));
    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    let lcpMs: number | null = null;
    let cls: number | null = null;
    const longTasks: number[] = [];

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) lcpMs = entry.startTime;
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      lcpMs = null;
    }

    try {
      const shiftObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) cls = (cls ?? 0) + entry.value;
        }
      });
      shiftObserver.observe({ type: "layout-shift", buffered: true });
    } catch {
      cls = null;
    }

    try {
      const taskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) longTasks.push(entry.duration);
      });
      taskObserver.observe({ type: "longtask", buffered: true });
    } catch {
      // longtask is Chromium-only; absence is recorded as an empty list.
    }

    await wait(400);
    const maxLongTask = longTasks.length > 0 ? Math.max(...longTasks) : 0;

    return {
      lcpMs: lcpMs ?? (navigation ? navigation.loadEventEnd || null : null),
      cls: cls ?? 0,
      domContentLoadedMs: navigation ? navigation.domContentLoadedEventEnd : null,
      longTasks: {
        count: longTasks.length,
        maxMs: maxLongTask,
        totalMs: longTasks.reduce((sum, value) => sum + value, 0),
      },
      firstUsefulActionMs: navigation ? navigation.domContentLoadedEventEnd : 0,
      inputToFrameMs: null,
      stateTransitionMs: 0,
      rendererFramesPerSecond: null,
    };
  });
}

test("records the lab performance baseline for this build", async ({ page }) => {
  const start = Date.now();
  await page.goto("/", { waitUntil: "load" });
  await expect(page.getByTestId("run-trial")).toBeEnabled();
  const firstUsefulActionMs = Date.now() - start;

  const base = await readMetrics(page);

  // Input-to-frame proxy: a custom dispatch-to-next-frame measurement. It is explicitly
  // NOT labelled INP - the W3C Event Timing spec excludes continuous events, and this is
  // a synthetic dispatch, not browser paint timing (docs/PERFORMANCE.md §3.5).
  const inputToFrameMs = await page.evaluate(async () => {
    const button = document.querySelector('[data-testid="run-trial"]') as HTMLButtonElement | null;
    if (!button) return null;
    const before = performance.now();
    button.click();
    return new Promise<number>((done) => {
      requestAnimationFrame(() => done(performance.now() - before));
    });
  });

  // State-transition latency: from the committed intent to the authoritative trial
  // record being available. This excludes the deliberate playback dwell.
  const transitionStart = Date.now();
  await expect(page.getByTestId("trials-table")).toBeVisible();
  const stateTransitionMs = Date.now() - transitionStart;

  await page.getByTestId("jump-to-end").click();
  await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");

  // Phaser frame behaviour: frames actually reconciled by the real scene per second.
  await page.waitForTimeout(200);
  const framesBefore = await page.evaluate(() => window.__MOTION_LAB_RENDERER__?.frames ?? null);
  await page.waitForTimeout(1000);
  const framesAfter = await page.evaluate(() => window.__MOTION_LAB_RENDERER__?.frames ?? null);
  const rendererFramesPerSecond =
    framesBefore !== null && framesAfter !== null && framesAfter > framesBefore
      ? framesAfter - framesBefore
      : null;

  const heap = () => page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null);
  const heapStartBytes = await heap();

  // Repeated-trial memory stability: ten more trials, then re-sample the heap.
  for (let index = 0; index < 10; index += 1) {
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
  }
  await page.waitForTimeout(300);
  const heapEndBytes = await heap();

  const metrics: BrowserMetrics & { recordedAt: string } = {
    ...base,
    firstUsefulActionMs,
    inputToFrameMs,
    stateTransitionMs,
    rendererFramesPerSecond,
    heapStartBytes,
    heapEndBytes,
    recordedAt: new Date().toISOString(),
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");

  // Sanity only. No invented threshold (docs/PERFORMANCE.md §1 and §7).
  expect(metrics.stateTransitionMs).toBeGreaterThanOrEqual(0);
  expect(metrics.longTasks.maxMs).toBeLessThan(5_000);
  expect(metrics.heapStartBytes === null || metrics.heapEndBytes === null || metrics.heapEndBytes < 400_000_000).toBe(true);
});
