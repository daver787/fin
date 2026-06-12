"""Pydantic models for the watchlist API (SPEC §8).

Field names mirror the binding ``/api/*`` contract (see
``frontend/src/lib/types.ts`` and ``planning/agent-contract.md``).
"""

from __future__ import annotations

from pydantic import BaseModel, field_validator


class WatchlistEntry(BaseModel):
    """A watchlist ticker with its latest known price (``None`` if unknown)."""

    ticker: str
    price: float | None = None


class WatchlistAddRequest(BaseModel):
    """Body for POST /api/watchlist — a single ticker to add."""

    ticker: str

    @field_validator("ticker")
    @classmethod
    def _strip(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ticker must not be empty")
        return value.strip().upper()
