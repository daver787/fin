import type { ConnectionState } from "@/lib/types";
import { ConnectionDot } from "./ConnectionDot";

interface HeaderProps {
  totalValue: number | null;
  cashBalance: number | null;
  connection: ConnectionState;
}

function fmtUsd(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Top bar (SPEC §10): portfolio total value, cash balance, connection dot. */
export function Header({ totalValue, cashBalance, connection }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-border-muted bg-bg-deep px-4 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold tracking-tight text-accent-yellow">
          FinAlly
        </span>
        <span className="text-xs text-text-faint">AI Trading Workstation</span>
      </div>

      <div className="flex items-center gap-6">
        <Metric label="Total Value" value={fmtUsd(totalValue)} accent />
        <Metric label="Cash" value={fmtUsd(cashBalance)} />
        <ConnectionDot state={connection} />
      </div>
    </header>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-text-faint">
        {label}
      </span>
      <span
        className={`text-sm font-semibold tabular-nums ${
          accent ? "text-accent-blue" : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
