import { defineConfig } from "@playwright/test";

const portfolio = process.env.TEST_DEPLOYMENT === "portfolio";
const basePath = portfolio ? "/apps/plate-analyzer/" : "/plate-analyzer/";
const baseURL = process.env.TEST_BASE_URL || "http://127.0.0.1:4340" + basePath;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60000,
  reporter: "list",
  use: { baseURL, browserName: "chromium", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: `npm run ${portfolio ? "build:portfolio" : "build:pages"} && npm run preview -- --host 127.0.0.1 --port 4340 --strictPort --base=${basePath}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120000,
      },
});
