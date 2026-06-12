"use client";

// useEventSource — connects to the SSE price stream (`/api/stream/prices`) and
// exposes a live price map plus connection state (SPEC §6, §10).
//
// A long-lived EventSource can look "connected" forever even after the network
// has dropped: the browser (and intervening proxies) don't always tear down an
// already-open streaming response, so no error fires. To reflect the *real*
// connection state we recycle the connection on a short interval — closing the
// current stream and opening a fresh one. A reopen while online succeeds
// (-> "connected"); a reopen while offline fails (-> "reconnecting"). This is
// also how the header dot recovers automatically once the network returns.

import { useEffect, useRef, useState } from "react";
import { PRICE_STREAM_PATH } from "@/lib/apiClient";
import type {
  ConnectionState,
  PriceEvent,
  PriceMap,
  PriceDirection,
} from "@/lib/types";

interface UseEventSourceResult {
  prices: PriceMap;
  connection: ConnectionState;
}

// How often to reopen the stream to re-verify connectivity.
const RECYCLE_MS = 3000;

function deriveDirection(price: number, prev: number): PriceDirection {
  if (price > prev) return "up";
  if (price < prev) return "down";
  return "flat";
}

export function useEventSource(
  path: string = PRICE_STREAM_PATH,
): UseEventSourceResult {
  const [prices, setPrices] = useState<PriceMap>({});
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // EventSource is browser-only; guard for the static-export build step.
    if (typeof window === "undefined") return;

    let stopped = false;

    const open = () => {
      if (stopped) return;
      // Close the previous stream silently (.close() fires no events) before
      // opening a fresh one, so a healthy recycle never blips the dot.
      sourceRef.current?.close();
      const source = new EventSource(path);
      sourceRef.current = source;

      source.onopen = () => setConnection("connected");

      source.onmessage = (event: MessageEvent<string>) => {
        setConnection("connected");
        try {
          const data = JSON.parse(event.data) as PriceEvent;
          if (!data?.ticker || typeof data.price !== "number") return;
          const direction =
            data.direction ?? deriveDirection(data.price, data.prev_price);
          setPrices((prev) => ({
            ...prev,
            [data.ticker]: {
              ticker: data.ticker,
              price: data.price,
              prevPrice: data.prev_price,
              direction,
              timestamp: data.timestamp,
            },
          }));
        } catch {
          // Ignore malformed events; the stream keeps flowing.
        }
      };

      source.onerror = () => {
        setConnection(
          source.readyState === EventSource.CLOSED
            ? "disconnected"
            : "connecting",
        );
      };
    };

    open();
    const recycle = window.setInterval(open, RECYCLE_MS);

    return () => {
      stopped = true;
      window.clearInterval(recycle);
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, [path]);

  return { prices, connection };
}
