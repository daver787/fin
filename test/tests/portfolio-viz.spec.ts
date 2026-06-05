import { test, expect } from "@playwright/test";
import {
  gotoApp,
  waitForStream,
  getPortfolio,
  pickPricedTicker,
} from "../support/helpers";

// SPEC §12 — Portfolio visualization: the heatmap renders (with a colored cell
// per holding) and the P&L chart has data points. We first establish a holding
// so the heatmap has something to draw, then verify both the API contract
// (/api/portfolio/history) and the rendered visualization.
test.describe("Portfolio visualization", () => {
  test("heatmap renders and P&L chart has data points", async ({
    page,
    request,
  }) => {
    await gotoApp(page);
    await waitForStream(page);

    // Ensure at least one position exists so the heatmap is non-empty.
    const ticker = await pickPricedTicker(request);
    await page.getByPlaceholder("TICKER").fill(ticker);
    await page.getByPlaceholder("QTY").fill("3");
    await page.getByRole("button", { name: "Buy", exact: true }).click();

    await expect
      .poll(async () => (await getPortfolio(request)).positions.length, {
        timeout: 15_000,
        message: "no position established for heatmap",
      })
      .toBeGreaterThan(0);

    // The Portfolio panel no longer shows the not-yet-implemented placeholder...
    const portfolioPanel = page
      .locator("section.panel")
      .filter({ hasText: "Portfolio" });
    await expect(portfolioPanel).toBeVisible();
    await expect(portfolioPanel.getByText("Heatmap + P&L chart")).toHaveCount(0);

    // ...the held ticker appears as a heatmap cell...
    await expect(
      portfolioPanel.getByText(ticker, { exact: true }).first(),
    ).toBeVisible();

    // ...a chart surface (svg or canvas) is rendered for the P&L chart...
    await expect
      .poll(async () => portfolioPanel.locator("svg, canvas").count(), {
        timeout: 15_000,
        message: "no chart surface rendered in portfolio panel",
      })
      .toBeGreaterThan(0);

    // ...and the P&L history endpoint backs it with at least one snapshot
    // (snapshots are recorded after trades, SPEC §7).
    await expect
      .poll(
        async () => {
          const res = await request.get("/api/portfolio/history");
          if (!res.ok()) return 0;
          const snapshots = (await res.json()) as unknown[];
          return Array.isArray(snapshots) ? snapshots.length : 0;
        },
        { timeout: 15_000, message: "no P&L history data points" },
      )
      .toBeGreaterThan(0);
  });
});
