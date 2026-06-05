"""Pydantic models for the portfolio API (SPEC §8).

Field names mirror the binding ``/api/*`` contract consumed by the frontend
(see ``frontend/src/lib/types.ts`` and ``planning/agent-contract.md``). Do not
rename fields without updating both sides.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TradeSide = Literal["buy", "sell"]


class TradeRequest(BaseModel):
    """A market-order trade request: instant fill at the current price."""

    ticker: str
    quantity: float = Field(gt=0, description="Shares to trade (fractional OK).")
    side: TradeSide

    @field_validator("ticker")
    @classmethod
    def _normalize_ticker(cls, value: str) -> str:
        normalized = value.strip().upper()
        if not normalized:
            raise ValueError("ticker must not be empty")
        return normalized


class PositionView(BaseModel):
    """A single holding with live current price and unrealized P&L."""

    ticker: str
    quantity: float
    avg_cost: float
    current_price: float
    unrealized_pnl: float
    pct_change: float


class Portfolio(BaseModel):
    """Full portfolio snapshot returned by GET /api/portfolio and trades."""

    cash_balance: float
    total_value: float
    positions: list[PositionView]


class SnapshotView(BaseModel):
    """One portfolio-value data point for the P&L chart."""

    total_value: float
    recorded_at: str
