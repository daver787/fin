"use client";

// Portfolio heatmap (SPEC §10): a treemap where each rectangle is a position
// sized by portfolio weight (market value) and colored by P&L — green for a
// gain, red for a loss, with intensity scaling to the magnitude of % change.

import { useMemo } from "react";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import type { Portfolio, PriceMap } from "@/lib/types";
import { applyLivePrices, positionValue } from "@/lib/portfolio";
import { formatPercent, formatSignedCurrency } from "@/lib/format";
import { Panel, PlaceholderBody } from "./Panel";

// Spec palette up/down colors; alpha encodes P&L magnitude.
const UP = "38, 166, 65"; // #26a641
const DOWN = "248, 81, 73"; // #f85149
// % change at which a cell reaches full color intensity.
const SATURATION_PCT = 5;

/** rgba fill for a position's % change: hue by sign, alpha by magnitude. */
function heatColor(pct: number): string {
  const rgb = pct >= 0 ? UP : DOWN;
  const intensity = Math.min(Math.abs(pct) / SATURATION_PCT, 1);
  const alpha = 0.2 + intensity * 0.65; // 0.20 (flat) → 0.85 (saturated)
  return `rgba(${rgb}, ${alpha.toFixed(3)})`;
}

interface HeatCell {
  name: string;
  size: number;
  pct: number;
  pnl: number;
  // Recharts' TreemapDataType requires an index signature on the data rows.
  [key: string]: string | number;
}

// Recharts injects the computed rect plus our datum fields via cloneElement, so
// every field is optional from the type system's point of view.
interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  pct?: number;
}

function HeatmapCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  name,
  pct = 0,
}: CellProps) {
  // Root container node has no name — skip it so only leaf cells paint.
  if (!name) return null;

  const showLabel = width > 44 && height > 26;
  const showPct = width > 56 && height > 40;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={heatColor(pct)}
        stroke="#161b22"
        strokeWidth={2}
      />
      {showLabel && (
        <text
          x={x + 6}
          y={y + 16}
          fill="#e6edf3"
          fontSize={11}
          fontWeight={600}
          className="font-mono"
        >
          {name}
        </text>
      )}
      {showPct && (
        <text
          x={x + 6}
          y={y + 30}
          fill="#e6edf3"
          fontSize={10}
          className="font-mono"
        >
          {formatPercent(pct)}
        </text>
      )}
    </g>
  );
}

function HeatmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: HeatCell }[];
}) {
  if (!active || !payload?.length) return null;
  const cell = payload[0]?.payload;
  if (!cell) return null;
  return (
    <div className="rounded border border-border-muted bg-bg-raised px-2 py-1 text-xs">
      <div className="font-semibold text-text-primary">{cell.name}</div>
      <div className="text-text-muted">{formatSignedCurrency(cell.pnl)}</div>
      <div className="text-text-muted">{formatPercent(cell.pct)}</div>
    </div>
  );
}

interface PortfolioHeatmapProps {
  portfolio: Portfolio | null;
  prices: PriceMap;
}

export function PortfolioHeatmap({ portfolio, prices }: PortfolioHeatmapProps) {
  const data = useMemo<HeatCell[]>(() => {
    const positions = applyLivePrices(portfolio?.positions ?? [], prices);
    return positions
      .map((p) => ({
        name: p.ticker,
        size: positionValue(p),
        pct: p.pct_change,
        pnl: p.unrealized_pnl,
      }))
      .filter((c) => c.size > 0);
  }, [portfolio?.positions, prices]);

  return (
    <Panel title="Heatmap" className="min-h-0">
      {data.length === 0 ? (
        <PlaceholderBody note="No open positions" />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            isAnimationActive={false}
            content={<HeatmapCell />}
          >
            <Tooltip content={<HeatmapTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
