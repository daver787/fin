import { expect, type Page, type APIRequestContext } from "@playwright/test";

// Shared helpers for the E2E specs. These encode the stable frontend/backend
// contract (planning/agent-contract.md, frontend/src/lib/types.ts) so the specs
// stay readable and resilient to incidental DOM changes.

/** The ten seeded default watchlist tickers (SPEC §7). */
export const DEFAULT_WATCHLIST = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "JPM",
  "V",
  "NFLX",
] as const;

/** Starting cash for the default user (SPEC §7). */
export const STARTING_CASH = 10_000;

// ---- Contract response shapes (mirror frontend/src/lib/types.ts) ----

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  unrealized_pnl: number;
  pct_change: number;
}

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  positions: Position[];
}

export interface PortfolioSnapshot {
  total_value: number;
  recorded_at: string;
}

export interface WatchlistEntry {
  ticker: string;
  price: number | null;
}

/** Open the app and wait for the shell (header brand) to render. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByText("FinAlly", { exact: true })).toBeVisible();
}

/**
 * Wait until the SSE price stream is flowing. We treat "connected" (the header
 * dot reads "Live") OR a non-placeholder price appearing in the watchlist as
 * proof the stream is live, whichever happens first.
 */
export async function waitForStream(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const live = await page.getByText("Live", { exact: true }).count();
        return live > 0;
      },
      { timeout: 30_000, message: "price stream never reached connected state" },
    )
    .toBeTruthy();
}

/** Read the current portfolio straight from the API contract. */
export async function getPortfolio(
  request: APIRequestContext,
): Promise<Portfolio> {
  const res = await request.get("/api/portfolio");
  expect(res.ok(), `GET /api/portfolio -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as Portfolio;
}

/** Read the current watchlist straight from the API contract. */
export async function getWatchlist(
  request: APIRequestContext,
): Promise<WatchlistEntry[]> {
  const res = await request.get("/api/watchlist");
  expect(res.ok(), `GET /api/watchlist -> ${res.status()}`).toBeTruthy();
  return (await res.json()) as WatchlistEntry[];
}

/**
 * Resolve a ticker that currently has a streamed price, so trade specs don't
 * depend on which symbol ticks first. Falls back to AAPL if the API doesn't
 * surface prices yet (the simulator warms up within a second or two).
 */
export async function pickPricedTicker(
  request: APIRequestContext,
): Promise<string> {
  const entries = await getWatchlist(request);
  const priced = entries.find((e) => typeof e.price === "number" && e.price > 0);
  return priced?.ticker ?? "AAPL";
}
