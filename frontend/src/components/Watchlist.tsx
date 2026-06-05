"use client";

// Watchlist panel (SPEC §10, fin-4u3q). A dense grid of watched tickers showing
// symbol, current price (flashing green/red on change), daily change %, and a
// sparkline accumulated on the frontend from the SSE stream since page load.
// Add/remove controls are wired to the watchlist API; clicking a row selects the
// ticker for the main chart via shared selection state lifted into the page.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PriceDirection, PriceMap, WatchlistEntry } from "@/lib/types";
import { apiClient, ApiError } from "@/lib/apiClient";
import { Panel } from "./Panel";
import { Sparkline } from "./Sparkline";

// Cap the per-ticker history so memory stays bounded over a long session; the
// sparkline only needs a recent window to be legible.
const MAX_HISTORY = 60;

type History = Record<string, number[]>;

interface WatchlistProps {
  prices: PriceMap;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

export function Watchlist({ prices, selected, onSelect }: WatchlistProps) {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [history, setHistory] = useState<History>({});
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the watched tickers once. Prices then stream in over SSE and fill the
  // per-row price / sparkline data progressively.
  useEffect(() => {
    let active = true;
    apiClient
      .getWatchlist()
      .then((list) => {
        if (active) setEntries(list);
      })
      .catch(() => {
        if (active) setError("Failed to load watchlist");
      });
    return () => {
      active = false;
    };
  }, []);

  // Accumulate price history per ticker from the live stream. Only append when
  // the price actually moved so the sparkline reflects real ticks.
  useEffect(() => {
    setHistory((prev) => {
      let changed = false;
      const next: History = { ...prev };
      for (const tick of Object.values(prices)) {
        const series = prev[tick.ticker] ?? [];
        if (series.length > 0 && series[series.length - 1] === tick.price) {
          continue;
        }
        next[tick.ticker] = [...series, tick.price].slice(-MAX_HISTORY);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [prices]);

  const addTicker = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const ticker = input.trim().toUpperCase();
      if (!ticker || pending) return;
      setPending(true);
      setError(null);
      try {
        const list = await apiClient.addWatchlist(ticker);
        setEntries(list);
        setInput("");
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : `Could not add ${ticker}`,
        );
      } finally {
        setPending(false);
      }
    },
    [input, pending],
  );

  const removeTicker = useCallback(async (ticker: string) => {
    // Optimistic removal — the row disappears immediately; restore on failure.
    setEntries((prev) => prev.filter((e) => e.ticker !== ticker));
    setHistory((prev) => {
      const next = { ...prev };
      delete next[ticker];
      return next;
    });
    try {
      await apiClient.removeWatchlist(ticker);
    } catch {
      setError(`Could not remove ${ticker}`);
      apiClient
        .getWatchlist()
        .then(setEntries)
        .catch(() => {});
    }
  }, []);

  const rows = [...entries].sort((a, b) => a.ticker.localeCompare(b.ticker));

  return (
    <Panel
      title="Watchlist"
      className="min-h-0 flex-1"
      action={<span className="text-text-faint">{rows.length}</span>}
    >
      <div className="flex h-full min-h-0 flex-col">
        <form onSubmit={addTicker} className="flex gap-1 pb-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add ticker…"
            aria-label="Add ticker"
            spellCheck={false}
            className="min-w-0 flex-1 rounded border border-border-muted bg-bg-base px-2 py-1 text-xs uppercase text-text-primary placeholder:normal-case placeholder:text-text-faint focus:border-accent-blue focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="rounded border border-border-muted px-2 py-1 text-xs text-text-muted hover:border-accent-blue hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
        </form>

        {error && (
          <p className="pb-2 text-xs text-down" role="alert">
            {error}
          </p>
        )}

        <ul className="min-h-0 flex-1 divide-y divide-border-subtle overflow-auto">
          {rows.length === 0 ? (
            <li className="flex h-full min-h-[60px] items-center justify-center text-center text-xs text-text-faint">
              Awaiting price stream…
            </li>
          ) : (
            rows.map((entry) => {
              const tick = prices[entry.ticker];
              const series = history[entry.ticker] ?? [];
              return (
                <WatchlistRow
                  key={entry.ticker}
                  ticker={entry.ticker}
                  price={tick?.price ?? entry.price ?? null}
                  direction={tick?.direction ?? "flat"}
                  series={series}
                  selected={selected === entry.ticker}
                  onSelect={onSelect}
                  onRemove={removeTicker}
                />
              );
            })
          )}
        </ul>
      </div>
    </Panel>
  );
}

interface RowProps {
  ticker: string;
  price: number | null;
  direction: PriceDirection;
  series: number[];
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => void;
}

function WatchlistRow({
  ticker,
  price,
  direction,
  series,
  selected,
  onSelect,
  onRemove,
}: RowProps) {
  // Replay the flash animation on every price change by remounting a keyed
  // overlay (bumping the key restarts the CSS animation even for repeated
  // moves in the same direction). The overlay fades from a colored tint to
  // transparent over ~500ms (SPEC §2 price-flash effect).
  const [flash, setFlash] = useState<{ dir: PriceDirection; key: number }>({
    dir: "flat",
    key: 0,
  });
  const prevPrice = useRef<number | null>(null);

  useEffect(() => {
    if (price === null) return;
    const prev = prevPrice.current;
    if (prev !== null && price !== prev) {
      setFlash((f) => ({ dir: price > prev ? "up" : "down", key: f.key + 1 }));
    }
    prevPrice.current = price;
  }, [price]);

  // Daily change % is measured against the first price seen since page load —
  // the baseline accumulates with the sparkline (no day-open price is exposed
  // by the API).
  const baseline = series.length > 0 ? series[0] : null;
  const changePct =
    baseline && price !== null ? ((price - baseline) / baseline) * 100 : null;

  const priceColor =
    direction === "up"
      ? "text-up"
      : direction === "down"
        ? "text-down"
        : "text-text-muted";

  return (
    <li
      onClick={() => onSelect(ticker)}
      className={`group relative cursor-pointer ${
        selected ? "bg-bg-raised" : "hover:bg-bg-raised/50"
      }`}
    >
      {flash.key > 0 && (
        <span
          key={flash.key}
          aria-hidden
          className={`pointer-events-none absolute inset-0 ${
            flash.dir === "up" ? "animate-flash-up" : "animate-flash-down"
          }`}
        />
      )}

      <div className="relative flex items-center gap-2 py-1.5 pl-1 pr-1 tabular-nums">
        <span
          className={`w-12 shrink-0 truncate font-semibold ${
            selected ? "text-accent-blue" : "text-text-primary"
          }`}
        >
          {ticker}
        </span>

        <span className="flex-1">
          <Sparkline data={series} direction={direction} />
        </span>

        <span className={`w-16 shrink-0 text-right ${priceColor}`}>
          {price !== null ? price.toFixed(2) : "—"}
        </span>

        <span
          className={`w-14 shrink-0 text-right text-xs ${
            changePct === null
              ? "text-text-faint"
              : changePct > 0
                ? "text-up"
                : changePct < 0
                  ? "text-down"
                  : "text-text-muted"
          }`}
        >
          {changePct === null
            ? "—"
            : `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(ticker);
          }}
          aria-label={`Remove ${ticker}`}
          title={`Remove ${ticker}`}
          className="w-4 shrink-0 text-text-faint opacity-0 transition-opacity hover:text-down group-hover:opacity-100"
        >
          ×
        </button>
      </div>
    </li>
  );
}
