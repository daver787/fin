import { test, expect } from "@playwright/test";
import { gotoApp, getWatchlist } from "../support/helpers";

// SPEC §12 — Add and remove a ticker from the watchlist.
test.describe("Watchlist CRUD", () => {
  // A ticker outside the default seed set so add/remove is unambiguous.
  const TICKER = "PYPL";

  test("add then remove a ticker", async ({ page, request }) => {
    await gotoApp(page);

    // --- Add ---
    const input = page.getByLabel("Add ticker to watchlist");
    await input.fill(TICKER);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // The new row appears in the panel...
    await expect(page.getByText(TICKER, { exact: true })).toBeVisible();
    // ...and the API reflects it (the POST persisted server-side).
    await expect
      .poll(async () => (await getWatchlist(request)).map((e) => e.ticker))
      .toContain(TICKER);

    // --- Remove ---
    // Each row exposes an accessible "Remove <TICKER>" control.
    await page.getByLabel(`Remove ${TICKER}`).click();

    await expect(page.getByText(TICKER, { exact: true })).toHaveCount(0);
    await expect
      .poll(async () => (await getWatchlist(request)).map((e) => e.ticker))
      .not.toContain(TICKER);
  });
});
