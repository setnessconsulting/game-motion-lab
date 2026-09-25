import { expect, test, type Page } from "@playwright/test";
// Both of these are Phaser-free on purpose, so this spec can import them in Node. The
// renderer package barrel statically exports the Phaser game and must not be imported here.
import { positionToCanvasX } from "../../src/renderer/labGeometry.js";
import type { RendererGeometryReadback, RendererReadback } from "../../src/renderer/readback.js";

/**
 * The real Phaser renderer lane.
 *
 * GAME-384 required at least one browser lane to exercise the REAL Phaser renderer rather
 * than replacing it with mocks, and this is it. GAME-390 / ML-06 extended it to cover the
 * three acceptance criteria that cannot be proven in Vitest:
 *
 *   AC3  the same domain trace renders the same way while frames advance and across
 *        viewport sizes — checked by comparing the logical geometry the scene actually
 *        drew, not by comparing screenshots (rasterisation is not the claim);
 *   AC4  reduced motion produces no intermediate animated state, and stepping still works,
 *        so removing the animation did not remove the ability to inspect the window;
 *   AC5  every failure stage reaches the semantic fallback, and each stage is offered the
 *        recovery that actually works: an in-place retry where a fresh renderer can be
 *        created, and a page reload where the browser remembers a failed module download
 *        (the chunk-load test states the measurement behind that split).
 *
 * These assertions read the renderer's qualification readback, which publishes what the
 * renderer was told and the geometry it computed — never a scientific result. The
 * authoritative values are compared against the semantic readouts, which come from the
 * engine.
 */

declare global {
  interface Window {
    __MOTION_LAB_RENDERER__?: RendererReadback;
    __ML06_OBSERVED__?: string[];
    __ML06_TIMER__?: number;
  }
}

const readback = (page: Page) =>
  page.evaluate(() => window.__MOTION_LAB_RENDERER__ ?? null);

const LOGICAL_FIELDS: readonly (keyof RendererGeometryReadback)[] = [
  "logicalWidth",
  "logicalHeight",
  "pixelsPerMetre",
  "cartCenterX",
  "cartCenterY",
  "trackStartX",
  "trackEndX",
  "forceFromX",
  "forceToX",
  "emphasis",
  "playedFraction",
];

function logicalGeometry(readbackState: RendererReadback | null): Record<string, unknown> {
  const geometry = readbackState?.geometry;
  if (!geometry) throw new Error("no geometry was published");
  return Object.fromEntries(LOGICAL_FIELDS.map((field) => [field, geometry[field]]));
}

/** Run a preview trial and stop the presentation clock at the end of the window. */
async function runTrialToEnd(page: Page) {
  await page.getByTestId("run-trial").click();
  await page.getByTestId("jump-to-end").click();
  await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
  await page.waitForTimeout(300);
}

test.describe("real Phaser renderer", () => {
  test("initialises the real scene and is driven by authoritative state", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    const first = await readback(page);
    expect(first).not.toBeNull();
    expect(first?.ready).toBe(true);
    expect(first?.sceneKey).toBe("MotionLabLabScene");
    expect(first?.failure).toBeNull();
    expect(first?.failureStage).toBeNull();

    // A real canvas element was created by Phaser inside the region.
    const canvas = page.locator('[data-testid="renderer-canvas"] canvas');
    await expect(canvas).toHaveCount(1);
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(100);
    expect(box?.height ?? 0).toBeGreaterThan(50);

    // A live render loop is running.
    await page.waitForTimeout(400);
    const second = await readback(page);
    expect((second?.frames ?? 0) > (first?.frames ?? 0)).toBe(true);

    // Run a trial and jump to the end, then compare the renderer's consumed model with
    // the semantic readouts that come from the engine.
    await runTrialToEnd(page);

    const after = await readback(page);
    expect(after?.lastModel).not.toBeNull();
    expect(after?.lastModel?.positionMetres).toBeCloseTo(6, 6);
    expect(after?.lastModel?.velocityMetresPerSecond).toBeCloseTo(1.5, 6);
    expect(after?.lastModel?.activeIndex).toBeGreaterThan(0);
    expect(after?.geometry).not.toBeNull();
  });

  test("draws the geometry the pure mapping function computes (AC2/AC3)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });
    await runTrialToEnd(page);

    const state = await readback(page);
    const geometry = state?.geometry;
    const model = state?.lastModel;
    expect(geometry).not.toBeNull();
    expect(model).not.toBeNull();
    if (!geometry || !model) return;

    // The drawn cart x must be exactly what the shared pure mapping produces for the
    // model's position and the drawn track end. If the scene ever computed its own
    // mapping, or read a pixel position back, these diverge.
    expect(geometry.cartCenterX).toBeCloseTo(
      positionToCanvasX(model.positionMetres, model.trackEndMetres),
      9
    );
    expect(geometry.pixelsPerMetre).toBeGreaterThan(0);
    expect(geometry.trackStartX).toBeLessThan(geometry.trackEndX);
    expect(geometry.cartCenterX).toBeGreaterThanOrEqual(geometry.trackStartX);
    expect(geometry.cartCenterX).toBeLessThanOrEqual(geometry.trackEndX);
    expect(geometry.logicalWidth).toBe(720);
    expect(geometry.logicalHeight).toBe(320);
    // Balanced forces draw no arrow, which is asserted rather than assumed because a
    // zero-length arrow and a missing arrow look different to a learner.
    expect(geometry.forceFromX).toBeNull();
    expect(geometry.forceToX).toBeNull();
    expect(geometry.emphasis).toBe("settled");
  });

  test("renders identically while frames advance (AC3, refresh-rate independence)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });
    await runTrialToEnd(page);

    const before = await readback(page);
    await page.waitForTimeout(500);
    const after = await readback(page);

    // The loop really was running between the two reads, otherwise this proves nothing.
    expect((after?.frames ?? 0) - (before?.frames ?? 0)).toBeGreaterThan(5);
    // …and not one coordinate moved, because nothing in the drawing path reads frame time.
    expect(logicalGeometry(after)).toStrictEqual(logicalGeometry(before));
  });

  test("renders identically across viewport sizes (AC3, viewport independence)", async ({
    page,
  }) => {
    const geometryAt = async (width: number, height: number) => {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
        timeout: 15_000,
      });
      await runTrialToEnd(page);

      // Responsive scaling, measured rather than assumed: the canvas fills a real part of
      // the region and never overflows it.
      const region = await page.locator('[data-testid="renderer-canvas"]').boundingBox();
      const canvas = await page
        .locator('[data-testid="renderer-canvas"] canvas')
        .boundingBox();
      expect(canvas?.width ?? 0).toBeGreaterThan(120);
      expect(canvas?.height ?? 0).toBeGreaterThan(60);
      expect(canvas?.width ?? 0).toBeLessThanOrEqual((region?.width ?? 0) + 1);
      expect(canvas?.height ?? 0).toBeLessThanOrEqual((region?.height ?? 0) + 1);

      return { state: await readback(page), canvasWidth: canvas?.width ?? 0 };
    };

    const wide = await geometryAt(1440, 900);
    const narrow = await geometryAt(420, 760);

    // The fit genuinely differed — otherwise a "same geometry" claim would be vacuous. The
    // rendered canvas is the measure, not Phaser's `zoom`: under FIT mode the scale manager
    // keeps `zoom` at 1 and expresses the fit as the canvas's CSS size, so an assertion on
    // `zoom` was reading a value that is 1 in every viewport. It passed only by failing —
    // which is how it was found.
    expect(narrow.canvasWidth).not.toBe(wide.canvasWidth);
    expect(wide.state?.geometry?.viewportWidth).not.toBe(narrow.state?.geometry?.viewportWidth);
    expect(narrow.state?.geometry?.viewportHeight).not.toBe(
      wide.state?.geometry?.viewportHeight
    );
    // Both runs drew the same window of the same trial, so the comparison is like for like.
    expect(narrow.state?.lastModel?.positionMetres).toBeCloseTo(
      wide.state?.lastModel?.positionMetres ?? 0,
      6
    );
    // The logical geometry — every value derived from metres — is untouched.
    expect(logicalGeometry(narrow.state)).toStrictEqual(logicalGeometry(wide.state));
  });

  test("reduced motion produces no intermediate animated state (AC4)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // Sample the semantic readout continuously from before the run, so an animated
    // intermediate position would be recorded if one were ever painted.
    await page.evaluate(() => {
      window.__ML06_OBSERVED__ = [];
      window.__ML06_TIMER__ = window.setInterval(() => {
        const element = document.querySelector('[data-testid="readout-position"]');
        if (element) window.__ML06_OBSERVED__?.push(element.textContent ?? "");
      }, 8);
    });

    await page.getByTestId("run-trial").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m", { timeout: 2_000 });
    await page.waitForTimeout(400);

    const observed = await page.evaluate(() => {
      if (window.__ML06_TIMER__ !== undefined) window.clearInterval(window.__ML06_TIMER__);
      return window.__ML06_OBSERVED__ ?? [];
    });

    expect(observed.length).toBeGreaterThan(5);
    // Two values are legitimate and exactly two: the baseline the panel shows before the run
    // starts, and the end of the window. Any third value — 1.20 m, 3.75 m, any point in
    // between — could only have been painted by an animation, which is what reduced motion
    // must not produce. (An earlier version of this check demanded a single distinct value,
    // which failed whenever the sampler happened to catch the pre-run baseline first: flaky
    // in the strict direction, able to fail a correct build. It was replaced with the
    // property that is actually claimed rather than loosened.)
    const distinct = [...new Set(observed)];
    expect(distinct.filter((value) => value !== "0.00 m" && value !== "6.00 m")).toStrictEqual(
      []
    );
    // The window moved from its start to its end in one step: no intermediate frame existed.
    const transitions = observed.filter((value, index) => value !== observed[index - 1]);
    expect(transitions.length).toBeLessThanOrEqual(2);
    expect(observed[observed.length - 1]).toBe("6.00 m");

    const state = await readback(page);
    expect(state?.lastModel?.reducedMotion).toBe(true);
    expect(state?.lastModel?.positionMetres).toBeCloseTo(6, 6);
    expect(state?.geometry?.emphasis).toBe("settled");
    // The trial record is the same record the animated run produces.
    await expect(page.getByTestId("trials-table")).toContainText("6.00 m");
    await expect(page.getByTestId("trials-table")).toContainText("1.50 m/s");
  });

  test("stepping still works with reduced motion, so the window stays inspectable (AC4)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });
    await page.getByTestId("run-trial").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m", { timeout: 2_000 });

    // Reduced motion removes the animation, not the ability to read the trajectory.
    await page.getByTestId("step-back").click();
    await expect(page.getByTestId("readout-position")).not.toHaveText("6.00 m");
    const steppedBack = await page.getByTestId("readout-position").textContent();

    await page.getByTestId("step-forward").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");

    // Stepping is presentation only: it seeks the clock to a recorded sample instant and
    // cannot rewrite what the trial recorded.
    expect(steppedBack).not.toBe("6.00 m");
    await expect(page.getByTestId("trials-table")).toContainText("6.00 m");
    expect((await readback(page))?.lastModel?.reducedMotion).toBe(true);
  });

  test("a chunk-load failure is reported and recovers only by reloading the page (AC5)", async ({
    page,
  }) => {
    // Block the lazily loaded renderer chunk so the real download-failure path runs.
    await page.route("**/assets/renderer-*.js", (route) => route.abort());
    await page.goto("/");

    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "failed", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("renderer-status")).toHaveAttribute(
      "data-failure-stage",
      "chunk-load"
    );
    await expect(page.getByTestId("renderer-fallback")).toBeVisible();
    await expect(page.getByTestId("renderer-failure-stage")).toHaveText("chunk-load");

    // The fallback offers the recovery that can work and not the one that cannot. A failed
    // module download is remembered for the life of the page, so an in-place retry here
    // would be a button that provably does nothing — which is exactly what an earlier
    // version of this test asserted, and what it caught when it was first run.
    await expect(page.getByTestId("renderer-retry")).toHaveCount(0);
    await expect(page.getByTestId("renderer-reload")).toBeVisible();
    await expect(page.getByTestId("renderer-reload-note")).toContainText("starts fresh");

    // Science/game state is untouched: the trial still runs and records the same result.
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");
    await expect(page.getByTestId("trials-table")).toContainText("6.00 m");

    // With the cause gone, reloading is the recovery, and it is a real one: a fresh page
    // gets a fresh module map, so the download is attempted again.
    await page.unroute("**/assets/renderer-*.js");
    const rendererRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/assets/renderer-")) rendererRequests.push(request.url());
    });
    await page.getByTestId("renderer-reload").click();
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("renderer-fallback")).toHaveCount(0);
    expect(rendererRequests.length).toBeGreaterThan(0);
    const recovered = await readback(page);
    expect(recovered?.ready).toBe(true);
    expect(recovered?.failure).toBeNull();

    // And it cost the session, exactly as the note said before the click: trial records are
    // not stored (docs/PRIVACY.md), so the reloaded page has none. The trade is asserted
    // rather than described, because it is the price of this recovery and nobody should
    // read the fallback's promise as free.
    await expect(page.getByTestId("trials-table")).toHaveCount(0);
    await expect(page.getByTestId("trials-empty")).toBeVisible();
  });

  test("a runtime failure after ready is recoverable (AC5)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    // An uncaught error in a task fires the window error event the renderer listens for.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("ml06-runtime-probe");
      }, 0);
    });

    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "failed", {
      timeout: 10_000,
    });
    await expect(page.getByTestId("renderer-status")).toHaveAttribute(
      "data-failure-stage",
      "runtime"
    );
    await expect(page.getByTestId("renderer-failure-stage")).toHaveText("runtime");

    // The investigation is still completable in the fallback.
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");

    // Recovery: a fresh renderer is created and driven by the state that was recorded
    // while the failed renderer was still mounted.
    await page.getByTestId("renderer-retry").click();
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("renderer-fallback")).toHaveCount(0);
    const recovered = await readback(page);
    expect(recovered?.failure).toBeNull();
    expect(recovered?.failureStage).toBeNull();
    expect(recovered?.lastModel?.positionMetres).toBeCloseTo(6, 6);
  });
});
