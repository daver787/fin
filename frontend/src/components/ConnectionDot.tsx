import type { ConnectionState } from "@/lib/types";

const LABELS: Record<ConnectionState, string> = {
  connected: "Live",
  connecting: "Reconnecting",
  disconnected: "Offline",
};

const DOT_CLASS: Record<ConnectionState, string> = {
  connected: "bg-status-connected shadow-[0_0_6px] shadow-status-connected",
  connecting: "bg-status-reconnecting animate-pulse",
  disconnected: "bg-status-disconnected",
};

/** Header connection-status indicator (SPEC §2): green/yellow/red dot. */
export function ConnectionDot({ state }: { state: ConnectionState }) {
  return (
    <div className="flex items-center gap-2" title={`Stream: ${LABELS[state]}`}>
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${DOT_CLASS[state]}`}
        aria-hidden
      />
      <span className="text-xs text-text-muted">{LABELS[state]}</span>
    </div>
  );
}
