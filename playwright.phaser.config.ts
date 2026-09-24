import { defineConfig, devices } from "@playwright/test";

// GAME-384 requires at least one qualification lane to exercise the real Phaser
// renderer rather than replacing it with mocks. This config runs exactly that lane.
const PORT = Number(process.env.MOTION_LAB_PORT ?? 4183);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Real-browser lanes: the real Phaser renderer, plus the performance baseline capture.
  testMatch: ["**/realRender.spec.ts", "**/performance.spec.ts"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium-real-render",
      use: {
        ...devices["Desktop Chrome"],
        // Phaser needs a real GPU/WebGL-capable context; SwiftShader keeps this
        // lane headless on CI runners that have no GPU.
        launchOptions: {
          args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        },
      },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
