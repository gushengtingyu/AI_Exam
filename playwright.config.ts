import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const browserCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/chromium",
].filter((value): value is string => Boolean(value));
const executablePath = browserCandidates.find((candidate) => existsSync(candidate));
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: "npm run db:migrate && npx next dev --hostname 127.0.0.1 --port 3100",
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      ...process.env,
      DATABASE_URL: "file:../data/e2e-v2.db",
      STORAGE_ROOT: "./storage/e2e",
      MOCK_MODE: "true",
      MOCK_STEP_DELAY_MS: "20",
      APP_BASE_URL: baseURL,
      ...(executablePath ? { PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: executablePath } : {}),
    },
  },
});
