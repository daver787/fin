"use client";

// Shared portfolio state (SPEC §10). A single source of truth for cash balance
// and positions, consumed by the header, positions table, and trade bar. The
// trade bar refreshes this after each fill so the UI updates immediately; the
// `/api/portfolio/trade` response already carries the full updated portfolio, so
// `applyPortfolio` swaps it in without a follow-up GET.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import type { Portfolio } from "@/lib/types";

interface PortfolioContextValue {
  portfolio: Portfolio | null;
  loading: boolean;
  error: string | null;
  /** Re-fetch the portfolio from the API. */
  refresh: () => Promise<void>;
  /** Replace state with a known-fresh portfolio (e.g. a trade response). */
  applyPortfolio: (next: Portfolio) => void;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await apiClient.getPortfolio();
      setPortfolio(next);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load portfolio",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const applyPortfolio = useCallback((next: Portfolio) => {
    setPortfolio(next);
    setError(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PortfolioContext.Provider
      value={{ portfolio, loading, error, refresh, applyPortfolio }}
    >
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error("usePortfolio must be used within a PortfolioProvider");
  }
  return ctx;
}
