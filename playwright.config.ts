import { defineConfig, devices } from "@playwright/test";

const allowedBaseURLs = new Set([
  "https://edekhbhal-staging.vercel.app",
  "https://edekhbhal.vercel.app"
]);

const baseURL = (process.env.E2E_BASE_URL || "https://edekhbhal.vercel.app").replace(/\/+$/, "");
if (!allowedBaseURLs.has(baseURL)) {
  throw new Error(
    `Refusing to run E2E against unapproved URL: ${baseURL}. ` +
    `Allowed targets: ${Array.from(allowedBaseURLs).join(", ")}`
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }]
});
