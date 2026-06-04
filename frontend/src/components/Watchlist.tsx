import type { PriceMap } from "@/lib/types";
import { Panel, PlaceholderBody } from "./Panel";

// Foundation placeholder for the watchlist panel (owned by fin-4u3q). It renders
// whatever live ticks have arrived on the SSE stream so the price wiring is
// visibly working; sparklines + flash + CRUD land in the follow-up issue.
export function Watchlist({ prices }: { prices: PriceMap }) {
  const ticks = Object.values(prices).sort((a, b) =>
    a.ticker.localeCompare(b.ticker),
  );

  return (
    <Panel
      title="Watchlist"
      action={<span className="text-text-faint">{ticks.length}</span>}
    >
      {ticks.length === 0 ? (
        <PlaceholderBody note="Awaiting price stream…" />
      ) : (
        <ul className="divide-y divide-border-subtle">
          {ticks.map((t) => (
            <li
              key={t.ticker}
              className="flex items-center justify-between py-1 tabular-nums"
            >
              <span className="font-semibold text-text-primary">
                {t.ticker}
              </span>
              <span
                className={
                  t.direction === "up"
                    ? "text-up"
                    : t.direction === "down"
                      ? "text-down"
                      : "text-text-muted"
                }
              >
                {t.price.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
