import { expect, test } from "@playwright/test";

/**
 * GAME-384 browser lane: the minimal app boots with a semantic React shell, the
 * investigation is completable without the canvas, the console is clean, and no
 * unintended request leaves the origin.
 */

const ORIGIN_ALLOWED = ["127.0.0.1", "localhost"];

test.describe("bootstrap", () => {
  test("boots with a semantic shell and no console errors or off-origin requests", async ({
    page,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    const offOrigin: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!ORIGIN_ALLOWED.some((host) => url.hostname === host)) offOrigin.push(request.url());
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Forces and motion");
    await expect(page.getByTestId("foundation-notice")).toBeVisible();
    await expect(page.getByText("balanced forces", { exact: false })).toBeVisible();

    // The instruments are present before any trial exists.
    await expect(page.getByTestId("readouts")).toBeVisible();
    await expect(page.getByTestId("trials-empty")).toBeVisible();

    // Give the lazily loaded renderer a chance to fail loudly if it is going to.
    await page.waitForTimeout(1500);

    expect(consoleErrors).toStrictEqual([]);
    expect(offOrigin).toStrictEqual([]);
    expect(baseURL).toBeTruthy();
  });

  test("runs a preview trial by pointer, records it, and reports balanced forces", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();

    await expect(page.getByTestId("force-label")).toContainText("balanced (0.0 N)");
    await expect(page.getByTestId("readout-netForce")).toHaveText("0.0 N");
    await expect(page.getByTestId("readout-acceleration")).toHaveText("0.00 m/s\u00b2");
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");
    // Default preview: 1.50 m/s for 4.00 s from the origin.
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");

    const table = page.getByTestId("trials-table");
    await expect(table).toBeVisible();
    await expect(table.getByRole("row")).toHaveCount(2); // header + one trial
    await expect(table).toContainText("6.00 m");
    await expect(table).toContainText("1.50 m/s");
  });

  test("reaches the same result by keyboard only", async ({ page }) => {
    await page.goto("/");

    const runButton = page.getByTestId("run-trial");
    await runButton.focus();
    await expect(runButton).toBeFocused();
    await page.keyboard.press("Enter");

    const jump = page.getByTestId("jump-to-end");
    await jump.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");
  });

  test("changes the declared velocity through a semantic control and re-runs deterministically", async ({
    page,
  }) => {
    await page.goto("/");

    const velocity = page.getByLabel(/Initial velocity/);
    await velocity.focus();
    await velocity.fill("-1");
    await expect(page.getByTestId("initial-velocity-value")).toHaveText("-1.00 m/s");

    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();

    // -1.00 m/s for 4.00 s from the origin: the cart moves left (x = -4.00 m).
    await expect(page.getByTestId("readout-position")).toHaveText("-4.00 m");
    await expect(page.getByTestId("readout-velocity")).toHaveText("-1.00 m/s");
  });

  test("reduced motion preserves the instructional result with no animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByTestId("motion-preference")).toContainText("Reduced motion: on");

    await page.getByTestId("run-trial").click();

    // With reduced motion the result is available immediately; no playback wait.
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m", { timeout: 2_000 });
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");
  });

  test("reflows at a narrow viewport without losing function", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("run-trial")).toBeVisible();
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
  });

  test("does not scroll horizontally at 200% zoom", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/");
    // Emulating a 200% zoom by halving the effective viewport while keeping the layout.
    await page.setViewportSize({ width: 500, height: 800 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
