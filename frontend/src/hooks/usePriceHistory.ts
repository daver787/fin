"use client";

// usePriceHistory — accumulates a per-ticker price-over-time series from the live
// SSE price map (SPEC §10). The stream only carries the latest tick per ticker, so
// the main chart builds its history client-side, growing since page load. Each new
// tick is appended; series are kept ascending and unique by second (lightweight-
// charts requires monotonic time), and capped to bound memory.

import { useEffect, useRef, useState } from "react";
import type { PriceMap } from "@/lib/types";

/** A single charted point: UNIX time (seconds) + price. */
export interface PricePoint {
  time: number;
  value: number;
}

/** Map of ticker -> accumulated price series. */
export type PriceHistory = Record<string, PricePoint[]>;

// Cap per-ticker points so a long-lived session doesn't grow unbounded. At a
// ~1s tick cadence this is roughly 30 minutes of history.
const MAX_POINTS = 1800;

export function usePriceHistory(prices: PriceMap): PriceHistory {
  const historyRef = useRef<PriceHistory>({});
  // Track the last timestamp folded in per ticker so repeated renders of the same
  // tick don't double-append.
  const lastSeenRef = useRef<Record<string, string>>({});
  const [, bump] = useState(0);

  useEffect(() => {
    let changed = false;

    for (const tick of Object.values(prices)) {
      if (lastSeenRef.current[tick.ticker] === tick.timestamp) continue;
      lastSeenRef.current[tick.ticker] = tick.timestamp;

      const parsed = Date.parse(tick.timestamp);
      const time = Math.floor(
        (Number.isNaN(parsed) ? Date.now() : parsed) / 1000,
      );

      const series = historyRef.current[tick.ticker] ?? [];
      const last = series[series.length - 1];

      if (last && time <= last.time) {
        // Same-second (or out-of-order) tick: replace the trailing point so time
        // stays strictly ascending for the chart.
        last.value = tick.price;
      } else {
        series.push({ time, value: tick.price });
        if (series.length > MAX_POINTS) series.shift();
      }

      historyRef.current[tick.ticker] = series;
      changed = true;
    }

    // New array identities so consumers memoizing on the series re-render.
    if (changed) {
      const next: PriceHistory = {};
      for (const [ticker, series] of Object.entries(historyRef.current)) {
        next[ticker] = series.slice();
      }
      historyRef.current = next;
      bump((v) => v + 1);
    }
  }, [prices]);

  return historyRef.current;
}
