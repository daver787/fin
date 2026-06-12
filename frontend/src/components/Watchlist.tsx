"use client";

// Watchlist panel (SPEC §10, fin-4u3q). A dense grid of watched tickers showing
// symbol, live price (green/red flash on change), daily change %, and a
// sparkline accumulated on the frontend from the SSE stream since page load.
// Add/remove controls hit the watchlist API; clicking a row selects the ticker
// for the shared main chart.

import { useCallback, useEffect, useRef, useState } from "react";
import type { PriceMap, PriceTick } from "@/lib/types";
import { apiClient, ApiError } from "@/lib/apiClient";
import { Panel } from "./Panel";

// How many recent prices to retain per ticker for the sparkline. Bounded so the
// history can't grow without limit over a long session.
const SPARK_POINTS = 40;

interface WatchlistProps {
  prices: PriceMap;
  selected: string | null;
  onSelect: (ticker: string) => void;
}

export function Watchlist({ prices, selected, onSelect }: WatchlistProps) {
  // Canonical membership from the watchlist API. Until it loads (or if the
  // backend is unreachable) we fall back to whatever tickers the stream carries
  // so the panel still shows live data.
  const [members, setMembers] = useState<string[] | null>(null);
  const [addValue, setAddValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-ticker price history accumulated since page load (sparkline source).
  const [history, setHistory] = useState<Record<string, number[]>>({});

  const refreshMembers = useCallback(async () => {
    try {
      const entries = await apiClient.getWatchlist();
      setMembers(entries.map((e) => e.ticker));
    } catch {
      // Backend not up yet / no watchlist endpoint — degrade to stream-derived
      // rows rather than blanking the panel.
      setMembers(null);
    }
  }, []);

  useEffect(() => {
    void refreshMembers();
  }, [refreshMembers]);

  // Append each ticker's latest price to its history when it actually changes.
  useEffect(() => {
    setHistory((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const tick of Object.values(prices)) {
        const series = next[tick.ticker] ?? [];
        if (series[series.length - 1] === tick.price) continue;
        const appended = [...series, tick.price];
        if (appended.length > SPARK_POINTS) appended.shift();
        next[tick.ticker] = appended;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [prices]);

  // Row set: watchlist membership when known, otherwise streamed tickers. Union
  // with live ticks so a freshly-added ticker shows immediately, sorted A→Z.
  const tickers = Array.from(
    new Set([...(members ?? []), ...Object.keys(prices)]),
  ).sort((a, b) => a.localeCompare(b));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const ticker = addValue.trim().toUpperCase();
    if (!ticker || pending) return;
    setPending(true);
    setError(null);
    try {
      const entries = await apiClient.addWatchlist(ticker);
      setMembers(entries.map((en) => en.ticker));
      setAddValue("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Couldn't add ${ticker}`,
      );
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (ticker: string) => {
    // Optimistic removal; reconcile with the server list on completion.
    setMembers((prev) => (prev ? prev.filter((t) => t !== ticker) : prev));
    setError(null);
    try {
      await apiClient.removeWatchlist(ticker);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Couldn't remove ${ticker}`,
      );
      void refreshMembers();
    }
  };

  return (
    <Panel
      title="Watchlist"
      className="min-h-0"
      action={<span className="text-text-faint">{tickers.length}</span>}
    >
      <form onSubmit={handleAdd} className="mb-2 flex gap-1">
        <input
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
          placeholder="Add symbol…"
          aria-label="Add ticker to watchlist"
          maxLength={8}
          className="min-w-0 flex-1 rounded border border-border-muted bg-bg-base px-2 py-1 text-xs uppercase text-text-primary placeholder:text-text-faint focus:border-accent-blue focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || addValue.trim() === ""}
          className="rounded border border-border-muted px-2 py-1 text-xs text-text-muted transition-colors hover:border-accent-blue hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>

      {error && (
        <p className="mb-2 text-xs text-down" role="alert">
          {error}
        </p>
      )}

      {tickers.length === 0 ? (
        <div className="flex h-full min-h-[60px] items-center justify-center text-center text-xs text-text-faint">
          Awaiting price stream…
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {tickers.map((ticker) => (
            <WatchRow
              key={ticker}
              ticker={ticker}
              tick={prices[ticker]}
              series={history[ticker] ?? []}
              selected={ticker === selected}
              onSelect={() => onSelect(ticker)}
              onRemove={() => handleRemove(ticker)}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

interface WatchRowProps {
  ticker: string;
  tick?: PriceTick;
  series: number[];
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function WatchRow({
  ticker,
  tick,
  series,
  selected,
  onSelect,
  onRemove,
}: WatchRowProps) {
  // Daily change % is computed against the first price observed this session
  // (the SSE stream carries no daily open), so it fills in progressively.
  const baseline = series[0];
  const pct =
    tick && baseline ? ((tick.price - baseline) / baseline) * 100 : null;

  return (
    <li
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 rounded px-1.5 py-1 tabular-nums ${
        selected ? "bg-bg-raised" : "hover:bg-bg-raised/50"
      }`}
    >
      <span className="flex items-center gap-1.5 truncate">
        <span
          className={`font-semibold ${
            selected ? "text-accent-blue" : "text-text-primary"
          }`}
        >
          {ticker}
        </span>
        <button
          type="button"
          aria-label={`Remove ${ticker}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-text-faint opacity-0 transition-opacity hover:text-down focus:opacity-100 group-hover:opacity-100"
        >
          ✕
        </button>
      </span>

      <div className="flex items-center gap-2 justify-self-end">
        <Sparkline data={series} />
        <PriceCell tick={tick} />
        <span
          className={`w-14 text-right text-xs ${
            pct === null
              ? "text-text-faint"
              : pct > 0
                ? "text-up"
                : pct < 0
                  ? "text-down"
                  : "text-text-muted"
          }`}
        >
          {pct === null ? "—" : `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`}
        </span>
      </div>
    </li>
  );
}

// Live price with a brief background flash on change. Remounting on each change
// (via the incrementing key) restarts the CSS animation even for back-to-back
// moves in the same direction.
function PriceCell({ tick }: { tick?: PriceTick }) {
  const [flash, setFlash] = useState<{ cls: string; key: number }>({
    cls: "",
    key: 0,
  });
  const prevPrice = useRef<number | undefined>(tick?.price);

  useEffect(() => {
    if (tick === undefined) return;
    const prev = prevPrice.current;
    if (prev === undefined) {
      prevPrice.current = tick.price;
      return;
    }
    if (tick.price === prev) return;
    prevPrice.current = tick.price;
    setFlash((f) => ({
      cls: tick.price > prev ? "animate-flash-up" : "animate-flash-down",
      key: f.key + 1,
    }));
  }, [tick?.price, tick]);

  if (tick === undefined) {
    return <span className="w-16 text-right text-text-faint">—</span>;
  }

  return (
    <span
      key={flash.key}
      className={`w-16 rounded px-1 text-right ${flash.cls} ${
        tick.direction === "up"
          ? "text-up"
          : tick.direction === "down"
            ? "text-down"
            : "text-text-muted"
      }`}
    >
      {tick.price.toFixed(2)}
    </span>
  );
}

// Dependency-free inline sparkline. Colored by net move (last vs first point).
function Sparkline({
  data,
  width = 56,
  height = 18,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      // Leave a 1px margin so the stroke isn't clipped at the edges.
      const y = height - 1 - ((value - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const rising = data[data.length - 1] >= data[0];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      <polyline
        points={points}
        fill="none"
        stroke={rising ? "#26a641" : "#f85149"}
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
