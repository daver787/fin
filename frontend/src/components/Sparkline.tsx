import type { PriceDirection } from "@/lib/types";

// Lightweight inline-SVG sparkline (SPEC §10). The watchlist accumulates a short
// price series per ticker from the SSE stream since page load, so this fills in
// progressively. No charting library is pulled in for these mini-charts — the
// heavier canvas chart lives in the main chart area.

interface SparklineProps {
  /** Price points in chronological order (oldest → newest). */
  data: number[];
  /** Drives the stroke color so it matches the row's up/down semantics. */
  direction: PriceDirection;
  width?: number;
  height?: number;
}

const STROKE: Record<PriceDirection, string> = {
  up: "#26a641",
  down: "#f85149",
  flat: "#6e7681",
};

export function Sparkline({
  data,
  direction,
  width = 64,
  height = 20,
}: SparklineProps) {
  // Need at least two points to draw a line; otherwise reserve the space so the
  // row layout stays stable while the series accumulates.
  if (data.length < 2) {
    return <span className="inline-block" style={{ width, height }} aria-hidden />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  // Pad vertically by 1px so the stroke isn't clipped at the extremes.
  const points = data
    .map((value, i) => {
      const x = i * stepX;
      const y = height - 1 - ((value - min) / range) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={STROKE[direction]}
        strokeWidth={1}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
