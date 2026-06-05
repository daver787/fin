"use client";

// Positions table (SPEC §10): ticker, quantity, avg cost, current price,
// unrealized P&L, and % change for every open position. Current price and the
// derived P&L update live as SSE ticks arrive (applyLivePrices).

import { useMemo } from "react";
import type { Portfolio, PriceMap } from "@/lib/types";
import { applyLivePrices } from "@/lib/portfolio";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  pnlColor,
} from "@/lib/format";
import { Panel, PlaceholderBody } from "./Panel";

interface PositionsTableProps {
  portfolio: Portfolio | null;
  prices: PriceMap;
}

export function PositionsTable({ portfolio, prices }: PositionsTableProps) {
  const positions = useMemo(
    () => applyLivePrices(portfolio?.positions ?? [], prices),
    [portfolio?.positions, prices],
  );

  return (
    <Panel
      title="Positions"
      action={<span className="text-text-faint">{positions.length}</span>}
    >
      {positions.length === 0 ? (
        <PlaceholderBody note="No open positions" />
      ) : (
        <table className="w-full text-xs tabular-nums">
          <thead className="text-text-faint">
            <tr className="text-left">
              <th className="py-1 pr-2 font-medium">Ticker</th>
              <th className="py-1 px-2 text-right font-medium">Qty</th>
              <th className="py-1 px-2 text-right font-medium">Avg</th>
              <th className="py-1 px-2 text-right font-medium">Price</th>
              <th className="py-1 px-2 text-right font-medium">P&amp;L</th>
              <th className="py-1 pl-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {positions.map((p) => (
              <tr key={p.ticker}>
                <td className="py-1 pr-2 font-semibold text-text-primary">
                  {p.ticker}
                </td>
                <td className="py-1 px-2 text-right text-text-muted">
                  {p.quantity}
                </td>
                <td className="py-1 px-2 text-right text-text-muted">
                  {formatCurrency(p.avg_cost)}
                </td>
                <td className="py-1 px-2 text-right text-text-primary">
                  {formatCurrency(p.current_price)}
                </td>
                <td
                  className={`py-1 px-2 text-right ${pnlColor(p.unrealized_pnl)}`}
                >
                  {formatSignedCurrency(p.unrealized_pnl)}
                </td>
                <td className={`py-1 pl-2 text-right ${pnlColor(p.pct_change)}`}>
                  {formatPercent(p.pct_change)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
