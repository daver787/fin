"use client";

// Trade bar (SPEC §8/§10): place market orders. Ticker + quantity, Buy/Sell,
// instant fill via apiClient.trade(). On a fill we call onTraded() so the
// header, positions table, and portfolio viz re-fetch and reflect the new
// state. Prefills the ticker from the chart selection until the user types.

import { useEffect, useState } from "react";
import { ApiError, apiClient } from "@/lib/apiClient";
import type { TradeSide } from "@/lib/types";

interface TradeBarProps {
  /** Currently selected ticker (from the watchlist/chart) — prefills the input. */
  selected?: string | null;
  /** Called after a successful fill so parents can refresh portfolio data. */
  onTraded?: () => void;
}

export function TradeBar({ selected, onTraded }: TradeBarProps) {
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("");
  const [pending, setPending] = useState<TradeSide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Mirror the chart selection into the ticker field until the user takes over.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && selected) setTicker(selected);
  }, [selected, touched]);

  async function submit(side: TradeSide) {
    const symbol = ticker.trim().toUpperCase();
    const quantity = Number(qty);
    if (!symbol) {
      setError("Enter a ticker");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Enter a quantity");
      return;
    }

    setPending(side);
    setError(null);
    setNotice(null);
    try {
      await apiClient.trade({ ticker: symbol, quantity, side });
      setNotice(`${side === "buy" ? "Bought" : "Sold"} ${quantity} ${symbol}`);
      setQty("");
      onTraded?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Trade failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2 border-t border-border-muted bg-bg-deep px-4 py-2 text-sm">
      <span className="text-[10px] uppercase tracking-wider text-text-faint">
        Trade
      </span>
      <input
        value={ticker}
        onChange={(e) => {
          setTouched(true);
          setTicker(e.target.value.toUpperCase());
        }}
        placeholder="TICKER"
        aria-label="Trade ticker"
        maxLength={8}
        className="w-24 rounded border border-border-muted bg-bg-base px-2 py-1 uppercase tabular-nums text-text-primary placeholder:text-text-faint focus:border-accent-blue focus:outline-none"
      />
      <input
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="QTY"
        aria-label="Trade quantity"
        inputMode="decimal"
        className="w-20 rounded border border-border-muted bg-bg-base px-2 py-1 tabular-nums text-text-primary placeholder:text-text-faint focus:border-accent-blue focus:outline-none"
      />
      <button
        type="button"
        onClick={() => void submit("buy")}
        disabled={pending !== null}
        className="rounded bg-up/80 px-3 py-1 font-semibold text-white transition-colors hover:bg-up disabled:opacity-50"
      >
        Buy
      </button>
      <button
        type="button"
        onClick={() => void submit("sell")}
        disabled={pending !== null}
        className="rounded bg-down/80 px-3 py-1 font-semibold text-white transition-colors hover:bg-down disabled:opacity-50"
      >
        Sell
      </button>
      {error ? (
        <span className="text-xs text-down" role="alert">
          {error}
        </span>
      ) : (
        notice && <span className="text-xs text-text-muted">{notice}</span>
      )}
    </div>
  );
}
