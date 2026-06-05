"use client";

// Portfolio visualization region (SPEC §10): the P&L heatmap and the portfolio
// value chart, side by side, fed by usePortfolio + the live SSE price map.

import type { Portfolio, PortfolioSnapshot, PriceMap } from "@/lib/types";
import { PortfolioHeatmap } from "./PortfolioHeatmap";
import { PnlChart } from "./PnlChart";

interface PortfolioVizProps {
  portfolio: Portfolio | null;
  history: PortfolioSnapshot[];
  prices: PriceMap;
}

export function PortfolioViz({
  portfolio,
  history,
  prices,
}: PortfolioVizProps) {
  return (
    <div className="grid min-h-0 grid-cols-2 gap-2">
      <PortfolioHeatmap portfolio={portfolio} prices={prices} />
      <PnlChart history={history} />
    </div>
  );
}
