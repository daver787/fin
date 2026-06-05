"use client";

// App shell (SPEC §10): a dense, terminal-style grid. This foundation issue
// (fin-7hni) lays out the regions and wires the live price stream + connection
// status; each region's full behavior is filled in by its own follow-up issue.

import { useState } from "react";
import { useEventSource } from "@/hooks/useEventSource";
import { Header } from "@/components/Header";
import { Watchlist } from "@/components/Watchlist";
import { MainChart } from "@/components/MainChart";
import { PortfolioViz } from "@/components/PortfolioViz";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { ChatSidebar } from "@/components/ChatSidebar";

export default function Home() {
  const { prices, connection } = useEventSource();

  // Shared selection state: clicking a ticker in the watchlist drives the main
  // chart (SPEC §10). Owned here so any region can read/update the selection.
  const [selected, setSelected] = useState<string | null>(null);

  // Portfolio totals are owned by the portfolio issue; the header shows live
  // placeholders until that data layer is wired in.
  const totalValue = null;
  const cashBalance = null;

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
            <MainChart selected={selected} />
            <PortfolioViz />
          </div>

          <div className="flex min-h-0 flex-col">
            <PositionsTable />
          </div>
        </main>

        {/* ChatSidebar exposes onActionsApplied(); the portfolio/watchlist
            panels will pass a refresh callback once their data layers land. */}
        <ChatSidebar />
      </div>

      <TradeBar />
    </div>
  );
}
