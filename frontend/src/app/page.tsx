"use client";

// App shell (SPEC §10): a dense, terminal-style grid. The foundation issue
// (fin-7hni) laid out the regions and wired the live price stream + connection
// status; the trade-bar issue (fin-fxyu) adds the shared portfolio state so the
// header totals and trade bar stay in sync. Each region's full behavior is
// filled in by its own follow-up issue.

import { useEventSource } from "@/hooks/useEventSource";
import { PortfolioProvider, usePortfolio } from "@/hooks/usePortfolio";
import { Header } from "@/components/Header";
import { Watchlist } from "@/components/Watchlist";
import { MainChart } from "@/components/MainChart";
import { PortfolioViz } from "@/components/PortfolioViz";
import { PositionsTable } from "@/components/PositionsTable";
import { TradeBar } from "@/components/TradeBar";
import { ChatSidebar } from "@/components/ChatSidebar";

function Dashboard() {
  const { prices, connection } = useEventSource();
  const { portfolio } = usePortfolio();

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header
        totalValue={portfolio?.total_value ?? null}
        cashBalance={portfolio?.cash_balance ?? null}
        connection={connection}
      />

      <div className="flex min-h-0 flex-1">
        {/* Main workspace: watchlist | chart+portfolio | positions */}
        <main className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_320px] gap-2 p-2">
          <div className="flex min-h-0 flex-col">
            <Watchlist prices={prices} />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
            <MainChart />
            <PortfolioViz />
          </div>

          <div className="flex min-h-0 flex-col">
            <PositionsTable />
          </div>
        </main>

        <ChatSidebar />
      </div>

      <TradeBar />
    </div>
  );
}

export default function Home() {
  return (
    <PortfolioProvider>
      <Dashboard />
    </PortfolioProvider>
  );
}
