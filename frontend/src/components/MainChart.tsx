"use client";

// Main chart area (SPEC §10, fin-novp): a larger price-over-time chart for the
// currently selected ticker. History is accumulated client-side from the SSE
// stream (see usePriceHistory) and rendered with lightweight-charts — a canvas
// library, chosen for performance per the spec's charting note. Selection is
// driven by the watchlist via shared state lifted into the page shell.

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PriceTick } from "@/lib/types";
import type { PricePoint } from "@/hooks/usePriceHistory";
import { Panel } from "./Panel";

interface MainChartProps {
  selected: string | null;
  series: PricePoint[];
  tick?: PriceTick;
}

// Theme tokens mirrored from tailwind.config.ts so the canvas matches the panels.
const COLORS = {
  text: "#8b949e",
  grid: "#21262d",
  up: "#26a641",
  down: "#f85149",
};

export function MainChart({ selected, series, tick }: MainChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Create the chart once and keep it sized to its container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORS.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      },
      grid: {
        vertLines: { color: COLORS.grid, style: LineStyle.Dotted },
        horzLines: { color: COLORS.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: COLORS.grid },
      timeScale: {
        borderColor: COLORS.grid,
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScale: false,
      handleScroll: false,
    });

    const area = chart.addAreaSeries({
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    chartRef.current = chart;
    seriesRef.current = area;

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Feed the selected ticker's accumulated history into the chart. setData on a
  // few-hundred-point series is cheap and avoids tracking incremental diffs.
  useEffect(() => {
    const area = seriesRef.current;
    const chart = chartRef.current;
    if (!area || !chart) return;

    area.setData(
      series.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
    );

    // Color the series by net direction over the visible window.
    const first = series[0]?.value;
    const last = series[series.length - 1]?.value;
    const rising = first === undefined || last === undefined || last >= first;
    const color = rising ? COLORS.up : COLORS.down;
    area.applyOptions({
      lineColor: color,
      topColor: `${color}55`,
      bottomColor: `${color}05`,
    });

    if (series.length > 0) chart.timeScale().fitContent();
  }, [series, selected]);

  const price = tick?.price;
  const changeColor =
    tick?.direction === "up"
      ? "text-up"
      : tick?.direction === "down"
        ? "text-down"
        : "text-text-muted";

  return (
    <Panel
      title={selected ? `Chart · ${selected}` : "Chart"}
      className="min-h-0"
      action={
        price !== undefined ? (
          <span className={`tabular-nums ${changeColor}`}>
            {price.toFixed(2)}
          </span>
        ) : null
      }
    >
      <div className="relative h-full w-full">
        <div ref={containerRef} className="absolute inset-0" />
        {(!selected || series.length === 0) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-xs text-text-faint">
            {selected
              ? "Awaiting price data…"
              : "Select a ticker to view its chart"}
          </div>
        )}
      </div>
    </Panel>
  );
}
