import { test, expect } from "../support/fixtures";
import {
  gotoApp,
  waitForStream,
  getPortfolio,
  pickPricedTicker,
} from "../support/helpers";

// SPEC §12 — Buy shares (cash down, position appears, portfolio updates) and
// sell shares (cash up, position updates or disappears). Driven through the
// trade bar UI; verified against the /api/portfolio contract so assertions are
// robust to the exact DOM of the positions table.
test.describe("Trading", () => {
  const QTY = 2;

  test("buy then sell via the trade bar", async ({ page, request }) => {
    await gotoApp(page);
    await waitForStream(page);

    const ticker = await pickPricedTicker(request);
    const before = await getPortfolio(request);

    // --- Buy ---
    await page.getByPlaceholder("TICKER").fill(ticker);
    await page.getByPlaceholder("QTY").fill(String(QTY));
    await page.getByRole("button", { name: "Buy", exact: true }).click();

    // Cash decreases and the position appears (SPEC §12). Poll the API: the
    // market order fills instantly but the UI refresh is async.
    await expect
      .poll(async () => (await getPortfolio(request)).cash_balance, {
        timeout: 15_000,
        message: "cash did not decrease after buy",
      })
      .toBeLessThan(before.cash_balance);

    const afterBuy = await getPortfolio(request);
    const bought = afterBuy.positions.find((p) => p.ticker === ticker);
    expect(bought, `position for ${ticker} should exist after buy`).toBeTruthy();
    expect(bought!.quantity).toBeGreaterThanOrEqual(QTY);

    // The position surfaces in the UI positions table.
    await expect(page.getByText(ticker, { exact: true }).first()).toBeVisible();

    // --- Sell the same quantity back ---
    await page.getByPlaceholder("TICKER").fill(ticker);
    await page.getByPlaceholder("QTY").fill(String(QTY));
    await page.getByRole("button", { name: "Sell", exact: true }).click();

    // Cash recovers relative to the post-buy low.
    await expect
      .poll(async () => (await getPortfolio(request)).cash_balance, {
        timeout: 15_000,
        message: "cash did not increase after sell",
      })
      .toBeGreaterThan(afterBuy.cash_balance);

    // The position is reduced or fully closed out.
    const afterSell = await getPortfolio(request);
    const remaining = afterSell.positions.find((p) => p.ticker === ticker);
    const remainingQty = remaining?.quantity ?? 0;
    expect(remainingQty).toBeLessThan(bought!.quantity);
  });

  test("rejects selling shares you don't own", async ({ page, request }) => {
    // A sell with no position must not corrupt cash — the backend validates
    // share availability (SPEC §8) and the balance is unchanged.
    await gotoApp(page);
    await waitForStream(page);

    const before = await getPortfolio(request);

    await page.getByPlaceholder("TICKER").fill("ORCL");
    await page.getByPlaceholder("QTY").fill("5");
    await page.getByRole("button", { name: "Sell", exact: true }).click();

    // Give the request a beat to round-trip, then confirm cash is untouched.
    await page.waitForTimeout(1_500);
    const after = await getPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance, 2);
    expect(after.positions.find((p) => p.ticker === "ORCL")).toBeFalsy();
  });
});
