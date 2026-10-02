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
    await expect(page.getByText("analytical", { exact: false })).toBeVisible();

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

  /**
   * GAME-423.
   *
   * The reflow assertions above only ever measure the initial, no-trial state, which is why a
   * seven-column trial table that was intrinsically 464px wide survived: recording a trial was the
   * first moment the page could overflow, by 177px at 320px and 107px at 390px. These assert the
   * state the contract actually governs, with a trial recorded.
   */
  test("does not scroll the page sideways once a trial is recorded", async ({ page }) => {
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByTestId("run-trial").click();
      await page.getByTestId("jump-to-end").click();
      await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
      await expect(page.getByTestId("trials-table")).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(
        overflow,
        `page overflowed sideways at ${width}px with a trial recorded`
      ).toBeLessThanOrEqual(2);
    }
  });

  /**
   * GAME-423: the record must scroll *inside* its own bounded, keyboard-reachable region rather
   * than escape its panel, and it must stay inside the panel at every width — not only where the
   * page happens to overflow.
   *
   * At 500px the unfixed table spilled ~30px past its own panel while the document still reported
   * zero overflow, so a document-overflow assertion alone would not have caught it. Below, 500px
   * and 414px are asserted for containment only, because the record legitimately does not scroll
   * at those widths — it scrolls wherever it is wider than its region.
   */
  test("the trial record stays inside its panel and scrolls there, never escaping", async ({ page }) => {
    for (const width of [320, 390, 414, 500]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByTestId("run-trial").click();
      await page.getByTestId("jump-to-end").click();

      const region = page.getByTestId("trials-scroll");
      await expect(region).toBeVisible();

      const metrics = await region.evaluate((el) => {
        const panel = el.closest("section");
        const panelBox = panel?.getBoundingClientRect();
        const style = panel ? getComputedStyle(panel) : null;
        return {
          overflowX: getComputedStyle(el).overflowX,
          regionClient: el.clientWidth,
          regionScroll: el.scrollWidth,
          regionRight: el.getBoundingClientRect().right,
          // The panel's content edge: border box minus its padding and borders.
          panelContentRight: panelBox
            ? panelBox.right -
              parseFloat(style?.paddingRight ?? "0") -
              parseFloat(style?.borderRightWidth ?? "0")
            : 0,
        };
      });

      expect(metrics.overflowX, `region is not a scroll container at ${width}px`).toBe("auto");
      // Bounded by its panel, not merely by the viewport — this is the assertion 500px failed.
      expect(metrics.regionRight, `record escaped its panel at ${width}px`).toBeLessThanOrEqual(
        metrics.panelContentRight + 1
      );
    }

    // At 320px it genuinely scrolls, which is also the proof that the record was never crushed to
    // fit its region: the bug cannot return as seven unreadable 40px columns that merely happen to
    // stay inside the panel. The region is keyboard-reachable and named by the caption rather than
    // by an invisible string.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto("/");
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    const region = page.getByTestId("trials-scroll");
    await expect(region).toBeVisible();
    const scroll = await region.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(scroll).toBeGreaterThan(0);

    await region.focus();
    await expect(region).toBeFocused();
    const name = await region.evaluate((el) => el.getAttribute("aria-labelledby"));
    expect(name).toBe("trials-caption");
    await expect(page.locator(`#${name}`)).toHaveText(/Recorded preview trials/);
  });
});
