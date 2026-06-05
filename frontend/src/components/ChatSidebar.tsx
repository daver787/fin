"use client";

// AI chat panel (SPEC §10, fin-ahp4). A docked, collapsible sidebar that posts
// messages to /api/chat and renders the assistant's reply. Trades and watchlist
// changes the backend auto-executed come back in the response and are shown
// inline as confirmation chips. When a reply carries actions, `onActionsApplied`
// fires so the parent can refresh portfolio/watchlist data.

import { useEffect, useRef, useState } from "react";
import { ApiError, apiClient } from "@/lib/apiClient";
import type { ChatTrade, WatchlistChange } from "@/lib/types";

interface ChatSidebarProps {
  /**
   * Called after a reply that executed trades and/or watchlist changes, so the
   * portfolio and watchlist panels can re-fetch and reflect the new state.
   */
  onActionsApplied?: () => void;
}

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      trades?: ChatTrade[];
      watchlistChanges?: WatchlistChange[];
    }
  | { id: string; role: "error"; content: string };

let messageSeq = 0;
function nextId(): string {
  messageSeq += 1;
  return `m${messageSeq}`;
}

export function ChatSidebar({ onActionsApplied }: ChatSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the conversation pinned to the latest turn as it grows / while loading.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await apiClient.chat(text);
      const hasActions =
        (res.trades?.length ?? 0) > 0 ||
        (res.watchlist_changes?.length ?? 0) > 0;

      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: res.message,
          trades: res.trades,
          watchlistChanges: res.watchlist_changes,
        },
      ]);

      if (hasActions) onActionsApplied?.();
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? `${err.message} (${err.status})`
          : "Could not reach the assistant. Please try again.";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "error", content: detail },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-col items-center border-l border-border-muted bg-bg-panel py-2">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand assistant"
          title="Expand assistant"
          className="rounded p-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
        >
          ‹
        </button>
        <span
          className="mt-3 text-[10px] uppercase tracking-widest text-text-faint"
          style={{ writingMode: "vertical-rl" }}
        >
          FinAlly Assistant
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex w-80 flex-col border-l border-border-muted bg-bg-panel">
      <div className="panel-header">
        <span>FinAlly Assistant</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse assistant"
          title="Collapse assistant"
          className="rounded px-1 text-text-muted hover:bg-bg-raised hover:text-text-primary"
        >
          ›
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto p-3">
        {messages.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-faint">
            Ask about your portfolio or have the AI trade for you.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}

        {loading && <LoadingBubble />}
      </div>

      <div className="border-t border-border-subtle p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={loading}
            placeholder="Message FinAlly…"
            className="max-h-28 min-h-[34px] flex-1 resize-none rounded border border-border-muted bg-bg-base px-2 py-1.5 text-sm text-text-primary placeholder:text-text-faint focus:border-accent-blue focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || input.trim().length === 0}
            className="rounded bg-accent-purple px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-accent-blue/20 px-3 py-2 text-sm text-text-primary">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-lg border border-down/40 bg-down/10 px-3 py-2 text-sm text-down">
          {message.content}
        </div>
      </div>
    );
  }

  const trades = message.trades ?? [];
  const watchlistChanges = message.watchlistChanges ?? [];

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-bl-sm bg-bg-raised px-3 py-2 text-sm text-text-primary">
        {message.content}
      </div>
      {(trades.length > 0 || watchlistChanges.length > 0) && (
        <div className="flex max-w-[85%] flex-wrap gap-1.5">
          {trades.map((t, i) => (
            <TradeChip key={`t${i}`} trade={t} />
          ))}
          {watchlistChanges.map((c, i) => (
            <WatchlistChip key={`w${i}`} change={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function TradeChip({ trade }: { trade: ChatTrade }) {
  const isBuy = trade.side === "buy";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tabular-nums ${
        isBuy
          ? "border-up/40 bg-up/10 text-up"
          : "border-down/40 bg-down/10 text-down"
      }`}
    >
      ✓ {trade.side} {trade.quantity} {trade.ticker}
    </span>
  );
}

function WatchlistChip({ change }: { change: WatchlistChange }) {
  const isAdd = change.action === "add";
  return (
    <span className="inline-flex items-center gap-1 rounded border border-accent-yellow/40 bg-accent-yellow/10 px-1.5 py-0.5 text-[11px] font-semibold uppercase text-accent-yellow">
      {isAdd ? "＋ watch" : "－ unwatch"} {change.ticker}
    </span>
  );
}

function LoadingBubble() {
  return (
    <div className="flex justify-start">
      <div
        className="flex items-center gap-1 rounded-lg rounded-bl-sm bg-bg-raised px-3 py-2.5"
        aria-label="Assistant is thinking"
        role="status"
      >
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-muted"
      style={{ animationDelay: delay }}
    />
  );
}
