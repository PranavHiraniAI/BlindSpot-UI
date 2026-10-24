import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: `"${process.execPath}" node_modules/tsx/dist/cli.mjs server/src/index.ts`,
      url: "http://127.0.0.1:3101/api/health",
      env: { PORT: "3101", GEMINI_API_KEY: "" },
      reuseExistingServer: false,
    },
    {
      command: `"${process.execPath}" node_modules/vite/bin/vite.js client --host 127.0.0.1 --port 4173 --strictPort`,
      url: "http://127.0.0.1:4173",
      env: { API_PORT: "3101" },
      reuseExistingServer: false,
    },
  ],
});
