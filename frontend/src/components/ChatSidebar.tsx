// Placeholder for the AI chat panel (owned by fin-ahp4). The real version wires
// the input to apiClient.chat() and renders streaming-style conversation turns.
export function ChatSidebar() {
  return (
    <aside className="flex w-80 flex-col border-l border-border-muted bg-bg-panel">
      <div className="panel-header">
        <span>FinAlly Assistant</span>
        <span className="text-accent-purple">●</span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-text-faint">
        Ask about your portfolio or have the AI trade for you.
      </div>
      <div className="border-t border-border-subtle p-3">
        <input
          disabled
          placeholder="Message FinAlly…"
          className="w-full rounded border border-border-muted bg-bg-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-faint disabled:opacity-50"
        />
      </div>
    </aside>
  );
}
