import { defineConfig, devices } from "@playwright/test";

import { releaseVersion } from "./scripts/lib/host-identity.mjs";

// GAME-385 / ML-HOST requires proof that the built artifact works beneath the exact
// games-site asset prefix, because games-site serves it as
// /game-assets/motion-lab/<version>/ and never at the domain root. This lane is that proof.
//
// The version and prefix come from scripts/lib/host-identity.mjs, the same module the host
// server and the release manifest read, so the test cannot silently assert a prefix the
// server is not serving.
const PORT = Number(process.env.MOTION_LAB_HOST_PORT ?? 4185);
const VERSION = releaseVersion();
const PREFIX = `/game-assets/motion-lab/${VERSION}`;

// Exported so the spec asserts the same identity this config served, rather than
// re-deriving it and risking a mismatch that would still pass.
process.env.MOTION_LAB_HOST_PREFIX = PREFIX;
process.env.MOTION_LAB_HOST_VERSION = VERSION;

export default defineConfig({
  testDir: "tests/host",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}${PREFIX}/`,
    trace: "off",
  },
  projects: [
    {
      name: "chromium-nested-host",
      use: {
        ...devices["Desktop Chrome"],
        // The lane includes the real Phaser renderer, so it needs a WebGL-capable
        // context on GPU-less CI runners.
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `npm run serve:nested-host`,
    // Probe the entry document, not the root: the server refuses the root on purpose,
    // and a readiness check that ignored that would hide the very failure this asserts.
    url: `http://127.0.0.1:${PORT}${PREFIX}/index.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
