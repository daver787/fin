// Same-origin API client (SPEC §10, agent-contract.md). The frontend is served
// by FastAPI from the same origin, so every call is a relative `/api/*` path —
// there is no base URL and no CORS to configure.

import type {
  ChatResponse,
  Portfolio,
  PortfolioSnapshot,
  TradeRequest,
  WatchlistEntry,
} from "./types";

/** SSE endpoint path — consumed by the useEventSource hook. */
export const PRICE_STREAM_PATH = "/api/stream/prices";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.detail ?? body?.message ?? detail;
    } catch {
      // Non-JSON error body; fall back to status text.
    }
    throw new ApiError(res.status, detail);
  }

  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiClient = {
  // System
  health: () => request<{ status: string }>("/api/health"),

  // Portfolio
  getPortfolio: () => request<Portfolio>("/api/portfolio"),
  getPortfolioHistory: () =>
    request<PortfolioSnapshot[]>("/api/portfolio/history"),
  trade: (body: TradeRequest) =>
    request<Portfolio>("/api/portfolio/trade", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Watchlist
  getWatchlist: () => request<WatchlistEntry[]>("/api/watchlist"),
  addWatchlist: (ticker: string) =>
    request<WatchlistEntry[]>("/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ ticker }),
    }),
  removeWatchlist: (ticker: string) =>
    request<void>(`/api/watchlist/${encodeURIComponent(ticker)}`, {
      method: "DELETE",
    }),

  // Chat
  chat: (message: string) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
};

export { ApiError };
