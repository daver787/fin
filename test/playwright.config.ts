import { defineConfig, devices } from "@playwright/test";

// E2E config (SPEC §12). Tests target the assembled FinAlly app served on a
// single origin (FastAPI serves the static frontend + all /api/* routes on port
// 8000). The base URL is environment-driven so the same specs run both:
//   - inside docker-compose.test.yml  -> BASE_URL=http://app:8000
//   - against a locally running app   -> BASE_URL=http://localhost:8000 (default)
const BASE_URL = process.env.BASE_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./tests",
  // The price stream + simulator make some assertions inherently timing-based;
  // keep generous but bounded timeouts so a slow cold start doesn't flake.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // Streaming + DB state mutations (trades) must not race across workers, so run
  // serially. Determinism over speed for E2E.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
