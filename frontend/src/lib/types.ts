// Shared types for the FinAlly frontend. These mirror the `/api/*` contract in
// planning/agent-contract.md — keep them in sync if the contract changes.

export type PriceDirection = "up" | "down" | "flat";

/** A single SSE price event from `/api/stream/prices`. */
export interface PriceEvent {
  ticker: string;
  price: number;
  prev_price: number;
  timestamp: string;
  direction: PriceDirection;
}

/** Latest known price for a ticker, as accumulated by the SSE hook. */
export interface PriceTick {
  ticker: string;
  price: number;
  prevPrice: number;
  direction: PriceDirection;
  timestamp: string;
}

/** Map of ticker -> latest tick. */
export type PriceMap = Record<string, PriceTick>;

export type ConnectionState = "connecting" | "connected" | "disconnected";

export type TradeSide = "buy" | "sell";

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  unrealized_pnl: number;
  pct_change: number;
}

export interface Portfolio {
  cash_balance: number;
  total_value: number;
  positions: Position[];
}

export interface PortfolioSnapshot {
  total_value: number;
  recorded_at: string;
}

export interface WatchlistEntry {
  ticker: string;
  price: number | null;
}

export interface TradeRequest {
  ticker: string;
  quantity: number;
  side: TradeSide;
}

export interface ChatTrade {
  ticker: string;
  side: TradeSide;
  quantity: number;
}

export interface WatchlistChange {
  ticker: string;
  action: "add" | "remove";
}

export interface ChatResponse {
  message: string;
  trades?: ChatTrade[];
  watchlist_changes?: WatchlistChange[];
}
