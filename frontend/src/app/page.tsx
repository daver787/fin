"use client";

// App shell (SPEC §10): a dense, terminal-style grid. This foundation issue
// (fin-7hni) lays out the regions and wires the live price stream + connection
// status; each region's full behavior is filled in by its own follow-up issue.

import { useEffect, useMemo, useState } from "react";
import { useEventSource } from "@/hooks/useEventSource";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { usePortfolio } from "@/hooks/usePortfolio";
import { applyLivePrices, liveTotalValue } from "@/lib/portfolio";
import { Header } from "@/components/Header";
import { Watchlist } from "@/components/Watchlist";
import { MainChart } from "@/components/MainChart";
import { PortfolioViz } from "@/components/PortfolioViz";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { ChatSidebar } from "@/components/ChatSidebar";

export default function Home() {
  const { prices, connection } = useEventSource();
  // Two distinct histories: priceHistory is the per-ticker live series the main
  // chart accumulates from the SSE stream (fin-novp); portfolio.history is the
  // portfolio value snapshots driving the P&L chart (fin-vc7p).
  const priceHistory = usePriceHistory(prices);
  const { portfolio, history, refetch } = usePortfolio();

  // Shared selection state: clicking a ticker in the watchlist drives the main
  // chart (SPEC §10). Owned here so any region can read/update the selection.
  // Auto-select the first ticker that arrives so the chart is never empty once
  // the stream is flowing (fin-novp).
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (selected !== null) return;
    const first = Object.keys(prices).sort()[0];
    if (first) setSelected(first);
  }, [prices, selected]);

  // Keep the header total ticking with live prices between portfolio refetches;
  // cash is fixed until the next fetch, but position values move with the stream.
  const cashBalance = portfolio?.cash_balance ?? null;
  const totalValue = useMemo(() => {
    if (!portfolio) return null;
    const live = applyLivePrices(portfolio.positions, prices);
    return liveTotalValue(live, portfolio.cash_balance);
  }, [portfolio, prices]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        totalValue={totalValue}
        cashBalance={cashBalance}
        connection={connection}
      />

      <div className="flex min-h-0 flex-1">
        {/* Main workspace: watchlist | chart+portfolio | positions */}
        <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px] gap-2 p-2">
          <div className="flex min-h-0 flex-col">
            <Watchlist
              prices={prices}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
            <MainChart
              selected={selected}
              series={(selected && priceHistory[selected]) || []}
              tick={selected ? prices[selected] : undefined}
            />
            <PortfolioViz
              portfolio={portfolio}
              history={history}
              prices={prices}
            />
          </div>

          <div className="flex min-h-0 flex-col">
            <PositionsTable portfolio={portfolio} prices={prices} />
          </div>
        </main>

        {/* Chat auto-executes trades/watchlist changes server-side; refresh the
            portfolio panels when it reports actions were applied. */}
        <ChatSidebar onActionsApplied={refetch} />
      </div>

      <TradeBar selected={selected} onTraded={refetch} />
    </div>
  );
}
