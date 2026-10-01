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

  /**
   * GAME-387 OF-04.
   *
   * A disabled control is not focusable, so a keyboard or screen-reader user never encounters a
   * disabled button at all. If the only explanation were a tooltip or the absence of one, the
   * reason for the disabled state would be unreachable for exactly the users who most need it.
   * This asserts the reason is present as always-readable text before a trial exists, names the
   * action that enables playback, and disappears once playback is actually available.
   */
  test("disabled playback states its reason in text a keyboard user can reach", async ({ page }) => {
    await page.goto("/");

    const reason = page.getByTestId("playback-disabled-reason");
    await expect(reason).toBeVisible();
    await expect(reason).toContainText("Run preview");

    // The controls really are disabled, so the message is describing a true state.
    await expect(page.getByTestId("toggle-runch")).toBeDisabled();

    // The reason must be readable, not merely present, and must not depend on a pointer.
    await expect(reason).not.toBeEmpty();

    await page.getByTestId("run-trial").click();
    await expect(reason).toHaveCount(0);
    await expect(page.getByTestId("toggle-runch")).toBeEnabled();
  });
});
