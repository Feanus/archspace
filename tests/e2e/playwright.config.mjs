import { defineConfig } from "../../web/node_modules/@playwright/test/index.mjs";

export default defineConfig({
  testDir: ".",
  testMatch: "formal-tree.spec.mjs",
  timeout: 20_000,
  workers: 1,
  outputDir: "/tmp/internspace-playwright-results",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH ?? "/snap/bin/chromium",
    },
  },
  webServer: {
    command: "node web/scripts/serve.mjs",
    cwd: new URL("../..", import.meta.url).pathname,
    url: "http://127.0.0.1:4173/web/",
    reuseExistingServer: true,
  },
  reporter: [
    ["line"],
    ["json", { outputFile: "/tmp/internspace-formal-tree-report.json" }],
  ],
});
