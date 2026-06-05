"use client";

// P&L chart (SPEC §10): a line chart of total portfolio value over time, sourced
// from `/api/portfolio/history` (the `portfolio_snapshots` table). The line is
// colored by overall trajectory — green if up since the first snapshot, red if
// down.

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PortfolioSnapshot } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import { Panel, PlaceholderBody } from "./Panel";

const UP = "#26a641";
const DOWN = "#f85149";

interface PnlPoint {
  t: number; // epoch millis for ordering / axis
  value: number;
  label: string; // formatted time for the tooltip
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function PnlTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PnlPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded border border-border-muted bg-bg-raised px-2 py-1 text-xs">
      <div className="text-text-muted">{point.label}</div>
      <div className="font-semibold text-text-primary">
        {formatCurrency(point.value)}
      </div>
    </div>
  );
}

export function PnlChart({ history }: { history: PortfolioSnapshot[] }) {
  const data = useMemo<PnlPoint[]>(
    () =>
      history
        .map((s) => ({
          t: new Date(s.recorded_at).getTime(),
          value: s.total_value,
          label: formatTime(s.recorded_at),
        }))
        .sort((a, b) => a.t - b.t),
    [history],
  );

  // Need at least two points to draw a meaningful line.
  const stroke =
    data.length >= 2 && data[data.length - 1].value < data[0].value ? DOWN : UP;

  return (
    <Panel title="P&L" className="min-h-0">
      {data.length < 2 ? (
        <PlaceholderBody note="Awaiting portfolio history…" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="#21262d" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6e7681", fontSize: 10 }}
              stroke="#30363d"
              minTickGap={32}
            />
            <YAxis
              width={56}
              tick={{ fill: "#6e7681", fontSize: 10 }}
              stroke="#30363d"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => formatCurrency(v)}
            />
            <Tooltip content={<PnlTooltip />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
