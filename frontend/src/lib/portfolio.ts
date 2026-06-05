// Pure portfolio math (SPEC §10). The backend's `/api/portfolio` response is a
// point-in-time snapshot; these helpers overlay the live SSE price map so the
// positions table and heatmap reflect prices as they tick, without refetching.

import type { Position, PriceMap } from "./types";

/** Market value of a position at its current price. */
export function positionValue(p: Position): number {
  return p.quantity * p.current_price;
}

/**
 * Overlay live prices onto positions. For any ticker present in the SSE map we
 * recompute current price, unrealized P&L, and % change from the position's
 * average cost; positions without a live tick are returned unchanged.
 */
export function applyLivePrices(
  positions: Position[],
  prices: PriceMap,
): Position[] {
  return positions.map((p) => {
    const tick = prices[p.ticker];
    if (!tick) return p;

    const current_price = tick.price;
    const unrealized_pnl = (current_price - p.avg_cost) * p.quantity;
    const pct_change =
      p.avg_cost === 0 ? 0 : ((current_price - p.avg_cost) / p.avg_cost) * 100;

    return { ...p, current_price, unrealized_pnl, pct_change };
  });
}

/**
 * Live total value = cash + market value of all positions. Used to keep the
 * header total ticking between portfolio refetches.
 */
export function liveTotalValue(
  positions: Position[],
  cashBalance: number,
): number {
  return positions.reduce((sum, p) => sum + positionValue(p), 0) + cashBalance;
}
