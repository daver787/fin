import { test, expect } from "@playwright/test";
import {
  DEFAULT_WATCHLIST,
  STARTING_CASH,
  gotoApp,
  waitForStream,
  getPortfolio,
} from "../support/helpers";

// SPEC §12 — Fresh start: default watchlist appears, $10k balance is shown,
// and prices are streaming.
test.describe("Fresh start", () => {
  test("default watchlist renders", async ({ page }) => {
    await gotoApp(page);

    // The watchlist panel lists the ten seeded tickers (SPEC §7). They populate
    // from GET /api/watchlist and/or the price stream; either path shows them.
    for (const ticker of DEFAULT_WATCHLIST) {
      await expect(
        page.getByText(ticker, { exact: true }).first(),
      ).toBeVisible();
    }
  });

  test("starting cash balance is $10,000", async ({ page, request }) => {
    // The header renders the live cash balance once the portfolio layer loads.
    await gotoApp(page);
    await expect(page.getByText("$10,000.00")).toBeVisible();

    // Cross-check against the contract so a formatting change in the header
    // can't silently hide a wrong balance.
    const portfolio = await getPortfolio(request);
    expect(portfolio.cash_balance).toBeCloseTo(STARTING_CASH, 2);
    expect(portfolio.positions).toHaveLength(0);
  });

  test("prices are streaming", async ({ page }) => {
    await gotoApp(page);
    await waitForStream(page);

    // The header connection indicator confirms the live SSE stream (SPEC §2/§6).
    await expect(page.getByText("Live", { exact: true })).toBeVisible();

    // At least one ticker shows a numeric price (two decimals) rather than the
    // "—" placeholder, proving ticks are arriving and rendering.
    await expect
      .poll(
        async () => page.locator("text=/^\\d+\\.\\d{2}$/").count(),
        { timeout: 30_000, message: "no numeric prices rendered" },
      )
      .toBeGreaterThan(0);
  });
});
