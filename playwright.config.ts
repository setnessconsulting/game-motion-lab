import { defineConfig, devices } from "@playwright/test";

// Port 4183 is chosen to avoid colliding with the other game repositories' preview
// servers when several are run on the same workstation.
const PORT = Number(process.env.MOTION_LAB_PORT ?? 4183);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: ["**/realRender.spec.ts"],
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
