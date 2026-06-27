import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./src/tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A retry absorbs cold-start flakiness: the first hits to a freshly-started
  // server (image-heavy home page) can be slow under parallel browsers.
  retries: process.env.CI ? 2 : 1,
  // Cap parallelism: a single `next start` server serving the image-heavy home
  // page gets starved if every CPU core runs a browser at once.
  workers: 2,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "iPhone", use: { ...devices["iPhone 14"] } },
    { name: "Android", use: { ...devices["Pixel 7"] } },
  ],
  // Build + serve the production app for tests. Reuses an already-running
  // server locally so repeated runs don't rebuild.
  webServer: {
    command: "npm run build && npm run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
