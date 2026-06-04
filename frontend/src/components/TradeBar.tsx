// Placeholder for the trade bar (owned by fin-fxyu). The real version wires the
// inputs to apiClient.trade(); here we render the disabled control layout.
export function TradeBar() {
  return (
    <div className="flex items-center gap-2 border-t border-border-muted bg-bg-deep px-4 py-2 text-sm">
      <span className="text-[10px] uppercase tracking-wider text-text-faint">
        Trade
      </span>
      <input
        disabled
        placeholder="TICKER"
        className="w-24 rounded border border-border-muted bg-bg-base px-2 py-1 uppercase tabular-nums text-text-primary placeholder:text-text-faint disabled:opacity-50"
      />
      <input
        disabled
        placeholder="QTY"
        className="w-20 rounded border border-border-muted bg-bg-base px-2 py-1 tabular-nums text-text-primary placeholder:text-text-faint disabled:opacity-50"
      />
      <button
        disabled
        className="rounded bg-up/80 px-3 py-1 font-semibold text-white disabled:opacity-50"
      >
        Buy
      </button>
      <button
        disabled
        className="rounded bg-down/80 px-3 py-1 font-semibold text-white disabled:opacity-50"
      >
        Sell
      </button>
    </div>
  );
}
