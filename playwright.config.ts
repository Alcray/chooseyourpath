import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: "/tmp/kindpath-playwright-results",
  use: {
    baseURL: process.env.TEST_UI_BASE_URL ?? "http://127.0.0.1:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
