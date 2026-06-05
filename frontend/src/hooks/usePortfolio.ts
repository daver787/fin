"use client";

// usePortfolio — loads the portfolio snapshot (`/api/portfolio`) and value
// history (`/api/portfolio/history`) that drive the heatmap, P&L chart, and
// positions table (SPEC §10). Live price ticks are layered on at render time by
// the consuming components via applyLivePrices, so this hook only needs to
// refetch periodically to pick up new backend snapshots and trade fills.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";
import type { Portfolio, PortfolioSnapshot } from "@/lib/types";

interface UsePortfolioResult {
  portfolio: Portfolio | null;
  history: PortfolioSnapshot[];
  loading: boolean;
  error: string | null;
  /** Re-fetch immediately — call after a trade fills to refresh positions. */
  refetch: () => Promise<void>;
}

/** Default cadence for picking up new backend snapshots / fills. */
const DEFAULT_POLL_MS = 30_000;

export function usePortfolio(pollMs: number = DEFAULT_POLL_MS): UsePortfolioResult {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [history, setHistory] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track mount status so a slow request resolving after unmount can't set state.
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        apiClient.getPortfolio(),
        apiClient.getPortfolioHistory(),
      ]);
      if (!mountedRef.current) return;
      setPortfolio(p);
      setHistory(h);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load portfolio");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refetch();

    const id =
      pollMs > 0 ? window.setInterval(() => void refetch(), pollMs) : undefined;

    return () => {
      mountedRef.current = false;
      if (id !== undefined) window.clearInterval(id);
    };
  }, [refetch, pollMs]);

  return { portfolio, history, loading, error, refetch };
}
