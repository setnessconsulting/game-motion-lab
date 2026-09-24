import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Automated accessibility lane.
 *
 * IMPORTANT: a passing axe run is NOT accessibility sign-off. It catches structural
 * regressions only. Manual keyboard, screen-reader, zoom, reduced-motion and non-colour
 * review remain open human gates (docs/ACCESSIBILITY.md §4, GAME-400).
 */

const SERIOUS = ["serious", "critical"];

test.describe("automated accessibility (assistive, not sign-off)", () => {
  test("initial view has no serious or critical violations", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) =>
      SERIOUS.includes(violation.impact ?? "")
    );
    expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toStrictEqual([]);
  });

  test("a recorded trial has no serious or critical violations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();
    await expect(page.getByTestId("trials-table")).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((violation) =>
      SERIOUS.includes(violation.impact ?? "")
    );
    expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toStrictEqual([]);
  });

  test("every instrument value is reachable as text with units", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();

    for (const id of ["position", "velocity", "acceleration", "netForce", "time"]) {
      const readout = page.getByTestId(`readout-${id}`);
      await expect(readout).toBeVisible();
      await expect(readout).not.toBeEmpty();
    }
    // The force direction is stated in words, so it is never colour-only.
    await expect(page.getByTestId("force-label")).toContainText("balanced");
  });

  test("the trial record is a real table with a caption and scoped headers", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();

    const table = page.getByTestId("trials-table");
    await expect(table.locator("caption")).toHaveCount(1);
    await expect(table.getByRole("columnheader")).toHaveCount(7);
    await expect(table.getByRole("rowheader")).toHaveCount(1);
  });
});
