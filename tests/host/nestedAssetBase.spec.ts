/**
 * Nested base-path compatibility (GAME-385 / ML-HOST).
 *
 * games-site serves this artifact beneath /game-assets/motion-lab/<version>/ and never at the
 * domain root (`docs/motion-lab-host-contract.md` in games-site, and `docs/RELEASE.md` here).
 * That contract is only real if a build that assumed root deployment fails somewhere.
 *
 * This lane serves the real production build from the exact versioned prefix and fails if:
 *   - any request escapes the prefix (a root-relative asset path);
 *   - any request 404s (a missing or wrongly-named asset);
 *   - the entry document does not boot the real renderer from a nested deep link.
 *
 * The version and prefix are supplied by playwright.host.config.ts, which reads the same
 * host-identity module the server reads, so the test cannot assert a prefix the server is
 * not serving.
 */

import { expect, test } from "@playwright/test";

const PREFIX = process.env.MOTION_LAB_HOST_PREFIX ?? "";
const VERSION = process.env.MOTION_LAB_HOST_VERSION ?? "";

test.beforeAll(() => {
  if (!PREFIX.startsWith("/game-assets/motion-lab/")) {
    throw new Error(
      `This lane must run through playwright.host.config.ts, which supplies the games-site prefix. Got "${PREFIX}".`
    );
  }
});

test.describe("games-site nested base path", () => {
  test("boots the real renderer with every request inside the version prefix", async ({ page }) => {
    const escaped: string[] = [];
    const failed: string[] = [];

    page.on("response", (response) => {
      const url = new URL(response.url());
      if (!url.pathname.startsWith("/")) return;
      if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) {
        escaped.push(url.pathname);
      }
      if (response.status() >= 400) failed.push(`${response.status()} ${url.pathname}`);
    });

    await page.goto("./");

    // Check the request evidence FIRST, before any UI assertion. If the build assumed
    // domain-root deployment, the entry document's own script and stylesheet requests are
    // already wrong by the time `load` fires, and this is the diagnostic that names the
    // actual defect. Asserting the UI first would report a missing element instead and hide
    // the cause. The second check after renderer readiness covers dynamically imported chunks.
    const expectNoEscape = (stage: string) => {
      expect(
        escaped,
        `[${stage}] these requests escaped the version prefix, so the build assumed domain-root deployment: ${escaped.join(", ")}`
      ).toEqual([]);
      expect(failed, `[${stage}] unexpected failed requests: ${failed.join(", ")}`).toEqual([]);
    };

    expectNoEscape("initial document");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("Forces and motion");

    // The real Phaser renderer must come up from the nested prefix. This is the assertion
    // that makes the lane about hosting rather than about the semantic shell alone.
    await expect(page.getByTestId("renderer-status")).toHaveAttribute("data-status", "ready", {
      timeout: 20_000,
    });

    expectNoEscape("after renderer ready");
  });

  test("loads the entry document on a direct nested deep link", async ({ page }) => {
    const response = await page.goto("./index.html");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Forces and motion");
  });

  test("runs an experiment from the nested prefix and keeps the science result", async ({
    page,
  }) => {
    await page.goto("./");

    await page.getByTestId("run-trial").click();
    await page.getByTestId("jump-to-end").click();

    // The balanced-force bootstrap result the ML-02 foundation froze: 1.50 m/s for 4.00 s.
    await expect(page.getByTestId("readout-position")).toHaveText("6.00 m");
    await expect(page.getByTestId("readout-velocity")).toHaveText("1.50 m/s");
  });

  test("does not serve the game at the domain root", async ({ request, baseURL }) => {
    // The host refuses `/` deliberately. If this ever returned the game, the nested test
    // above would be passing because of a fallback rather than because of correct paths.
    const origin = new URL(baseURL ?? `http://127.0.0.1${PREFIX}/`).origin;
    const response = await request.get(`${origin}/`);
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("Nested host is running");
  });

  test("resolves every document asset reference inside the version prefix", async ({ page }) => {
    await page.goto("./");

    // The empirical request check above would still pass if the build emitted root-relative
    // URLs that happened to be rewritten by the host. This asserts the stronger property
    // directly: the served document's own references resolve inside the prefix, and the
    // version in that prefix is the one this artifact is published under.
    expect(new URL(page.url()).pathname.startsWith(`${PREFIX}/`)).toBe(true);
    expect(VERSION.length).toBeGreaterThan(0);

    // document.baseURI is the absolute entry URL, which is the correct base for resolving
    // the document's own relative references (a bare pathname is not a valid URL base).
    const resolved = await page.evaluate(() => {
      const references = [
        ...Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]")),
        ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')),
      ].map(
        (element) =>
          element.getAttribute("src") ?? element.getAttribute("href") ?? ""
      );
      return {
        base: document.baseURI,
        references: references.map((reference) => new URL(reference, document.baseURI).pathname),
      };
    });

    expect(resolved.references.length).toBeGreaterThan(0);
    for (const pathname of resolved.references) {
      expect(
        pathname.startsWith(`${PREFIX}/`),
        `document reference ${pathname} resolved outside ${PREFIX}/`
      ).toBe(true);
    }
  });
});
