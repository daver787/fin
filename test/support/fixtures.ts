import { test as base, expect } from "@playwright/test";

// Per-test isolation. The app keeps a single persistent backend (single-user,
// SPEC §7), so without a reset the specs would bleed state into one another
// (e.g. a chat-initiated buy would change the "fresh start" cash balance). An
// auto fixture resets the seed before every test via the guarded test-only
// endpoint (enabled by ENABLE_TEST_RESET in docker-compose.test.yml). This
// changes no assertion — it just guarantees each test starts from $10k cash +
// the default watchlist, the state every spec already assumes.

export const test = base.extend<{ freshState: void }>({
  freshState: [
    async ({ request }, use) => {
      const res = await request.post("/api/test/reset");
      expect(
        res.ok(),
        `POST /api/test/reset -> ${res.status()} (is ENABLE_TEST_RESET set?)`,
      ).toBeTruthy();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
