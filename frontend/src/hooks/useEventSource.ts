"use client";

// useEventSource — connects to the SSE price stream (`/api/stream/prices`) and
// exposes a live price map plus connection state (SPEC §6, §10). Native
// EventSource handles reconnection automatically; we surface those transitions
// as the connection-status dot in the header.

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
  // Hold the live source in a ref so the effect cleanup can close it without
  // re-running on every state update.
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // EventSource is browser-only; guard for the static-export build step.
    if (typeof window === "undefined") return;

    setConnection("connecting");
    const source = new EventSource(path);
    sourceRef.current = source;

    source.onopen = () => setConnection("connected");

    source.onmessage = (event: MessageEvent<string>) => {
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

    // EventSource auto-reconnects on error; reflect that as "connecting" while
    // it retries, "disconnected" only once the browser gives up (CLOSED).
    source.onerror = () => {
      setConnection(
        source.readyState === EventSource.CLOSED
          ? "disconnected"
          : "connecting",
      );
    };

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [path]);

  return { prices, connection };
}
