import { expect, test } from "@playwright/test";

/**
 * GAME-384 requires at least one browser lane to exercise the REAL Phaser renderer
 * rather than replacing it with mocks.
 *
 * These assertions read the renderer's qualification readback, which publishes what the
 * renderer was told — never a scientific result. The authoritative values are compared
 * against the semantic readouts, which come from the engine.
 */

interface Readback {
  ready: boolean;
  sceneKey: string;
  frames: number;
  destroyed: boolean;
  failure: string | null;
  lastModel: {
    activeIndex: number;
    positionMetres: number;
    velocityMetresPerSecond: number;
    trackEndMetres: number;
    reducedMotion: boolean;
  } | null;
}

declare global {
  interface Window {
    __MOTION_LAB_RENDERER__?: Readback;
  }
}

const readback = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__MOTION_LAB_RENDERER__ ?? null);

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
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
    await page.waitForTimeout(300);

    const after = await readback(page);
    expect(after?.lastModel).not.toBeNull();
    expect(after?.lastModel?.positionMetres).toBeCloseTo(6, 6);
    expect(after?.lastModel?.velocityMetresPerSecond).toBeCloseTo(1.5, 6);
    expect(after?.lastModel?.activeIndex).toBeGreaterThan(0);
  });

  test("propagates reduced motion to the renderer contract without changing the result", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 15_000,
    });

    await page.getByTestId("run-trial").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m", { timeout: 2_000 });
    await page.waitForTimeout(300);

    const state = await readback(page);
    expect(state?.lastModel?.reducedMotion).toBe(true);
    // Reduced motion removes animation, not evidence.
    expect(state?.lastModel?.positionMetres).toBeCloseTo(6, 6);
  });

  test("a renderer failure leaves the investigation completable (semantic fallback)", async ({
    page,
  }) => {
    // Block the lazily loaded renderer chunk so the real failure path runs.
    await page.route("**/assets/renderer-*.js", (route) => route.abort());
    await page.goto("/");

    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "failed", {
      timeout: 15_000,
    });
    await expect(page.getByTestId("renderer-fallback")).toBeVisible();

    // Science/game state is untouched: the trial still runs and records the same result.
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");

    const table = page.getByTestId("trials-table");
    await expect(table).toContainText("6.00 m");
  });
});
