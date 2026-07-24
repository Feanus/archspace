import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 20_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    browserName: "chromium",
    launchOptions: { executablePath: process.env.CHROMIUM_PATH ?? "/snap/bin/chromium" },
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/web/",
    reuseExistingServer: true,
  },
  reporter: [["line"]],
});
