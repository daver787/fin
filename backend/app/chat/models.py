"""Pydantic models for the chat API (SPEC §9, agent-contract.md).

The response shape is binding — it mirrors ``ChatResponse`` in
``frontend/src/lib/types.ts``. The LLM is asked to emit exactly this JSON; the
backend validates it, auto-executes the actions, and returns the result.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

TradeSide = Literal["buy", "sell"]
WatchlistAction = Literal["add", "remove"]


class ChatRequest(BaseModel):
    """Body for POST /api/chat — one user message."""

    message: str

    @field_validator("message")
    @classmethod
    def _non_empty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be empty")
        return value


class ChatTrade(BaseModel):
    """A trade the assistant wants to execute on the user's behalf."""

    ticker: str
    side: TradeSide
    quantity: float = Field(gt=0)

    @field_validator("ticker")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()


class WatchlistChange(BaseModel):
    """A watchlist mutation the assistant wants to apply."""

    ticker: str
    action: WatchlistAction

    @field_validator("ticker")
    @classmethod
    def _upper(cls, value: str) -> str:
        return value.strip().upper()


class ChatResponse(BaseModel):
    """Complete chat response (no token streaming) — matches the contract."""

    message: str
    trades: list[ChatTrade] = Field(default_factory=list)
    watchlist_changes: list[WatchlistChange] = Field(default_factory=list)
