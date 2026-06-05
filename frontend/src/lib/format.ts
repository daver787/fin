// Display formatters for the dense, numeric trading UI. Centralised so currency,
// P&L, and percentage values render consistently across panels.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Plain currency, e.g. `$1,234.50`. */
export function formatCurrency(value: number): string {
  return USD.format(value);
}

/** Signed currency for P&L, e.g. `+$1,234.50` / `-$12.00`. */
export function formatSignedCurrency(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${USD.format(value)}`;
}

/** Signed percentage, e.g. `+2.34%` / `-0.50%`. */
export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Tailwind text color class for a P&L / change value. */
export function pnlColor(value: number): string {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-text-muted";
}
