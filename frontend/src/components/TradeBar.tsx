"use client";

// Trade bar (SPEC §10, fin-fxyu): ticker + quantity inputs and Buy/Sell submit
// buttons (purple submit accent, SPEC §2). Market orders fill instantly with no
// confirmation dialog; on success the shared portfolio state is refreshed so the
// header cash balance and positions update immediately. Validation errors from
// the API (insufficient cash/shares) are surfaced inline.

import { useState } from "react";
import { apiClient, ApiError } from "@/lib/apiClient";
import { usePortfolio } from "@/hooks/usePortfolio";
import type { TradeSide } from "@/lib/types";

export function TradeBar() {
  const { applyPortfolio } = usePortfolio();
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<TradeSide | null>(null);

  async function submit(side: TradeSide) {
    if (pending) return;
    setError(null);

    const symbol = ticker.trim().toUpperCase();
    const qty = Number(quantity);
    if (!symbol) {
      setError("Enter a ticker");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Quantity must be a positive number");
      return;
    }

    setPending(side);
    try {
      const next = await apiClient.trade({ ticker: symbol, quantity: qty, side });
      applyPortfolio(next);
      setQuantity("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Trade failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit("buy");
      }}
      className="flex items-center gap-2 border-t border-border-muted bg-bg-deep px-4 py-2 text-sm"
    >
      <span className="text-[10px] uppercase tracking-wider text-text-faint">
        Trade
      </span>

      <input
        aria-label="Ticker"
        placeholder="TICKER"
        value={ticker}
        onChange={(e) => setTicker(e.target.value)}
        disabled={pending !== null}
        className="w-24 rounded border border-border-muted bg-bg-base px-2 py-1 uppercase tabular-nums text-text-primary placeholder:text-text-faint focus:border-accent-purple focus:outline-none disabled:opacity-50"
      />

      <input
        aria-label="Quantity"
        type="number"
        min="0"
        step="any"
        inputMode="decimal"
        placeholder="QTY"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        disabled={pending !== null}
        className="w-20 rounded border border-border-muted bg-bg-base px-2 py-1 tabular-nums text-text-primary placeholder:text-text-faint focus:border-accent-purple focus:outline-none disabled:opacity-50"
      />

      <button
        type="submit"
        disabled={pending !== null}
        className="rounded bg-accent-purple px-3 py-1 font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending === "buy" ? "Buying…" : "Buy"}
      </button>

      <button
        type="button"
        onClick={() => void submit("sell")}
        disabled={pending !== null}
        className="rounded border border-accent-purple px-3 py-1 font-semibold text-accent-purple transition-colors hover:bg-accent-purple/10 disabled:opacity-50"
      >
        {pending === "sell" ? "Selling…" : "Sell"}
      </button>

      {error && (
        <span role="alert" className="ml-2 truncate text-xs text-down">
          {error}
        </span>
      )}
    </form>
  );
}
