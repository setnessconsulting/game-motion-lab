import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.MOTION_LAB_PORT ?? 4183);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: ["**/accessibility.spec.ts"],
  fullyParallel: true,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "off",
  },
  projects: [
    {
      name: "chromium-a11y",
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
