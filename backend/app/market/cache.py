"""Shared in-memory price cache (SPEC §6).

A single background task (the market-data feed loop) writes the latest price for
each ticker here; many readers — the SSE stream, trade-fill pricing — read
concurrently. A lock guards the dict so writes and snapshot reads are atomic.
Each entry is a :class:`~app.market.base.PriceUpdate` carrying the latest price,
the previous price, a timestamp, and the change direction, so consumers get
everything an SSE event needs without recomputing it.
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone

from app.market.base import Direction, PriceUpdate


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _direction(previous: float, current: float) -> Direction:
    if current > previous:
        return "up"
    if current < previous:
        return "down"
    return "flat"


class PriceCache:
    """Thread-safe store of the latest :class:`PriceUpdate` per ticker."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._data: dict[str, PriceUpdate] = {}

    def update(self, ticker: str, price: float, timestamp: str | None = None) -> PriceUpdate:
        """Record ``price`` for ``ticker`` and return the resulting entry.

        The previous price and direction are derived from the prior cached
        value; on the first update for a ticker the previous price equals the
        current price and the direction is ``"flat"``.
        """
        symbol = ticker.strip().upper()
        ts = timestamp or _now_iso()
        with self._lock:
            prior = self._data.get(symbol)
            previous_price = prior.price if prior is not None else price
            entry = PriceUpdate(
                ticker=symbol,
                price=price,
                previous_price=previous_price,
                timestamp=ts,
                direction=_direction(previous_price, price),
            )
            self._data[symbol] = entry
            return entry

    def get(self, ticker: str) -> PriceUpdate | None:
        """Return the latest entry for ``ticker``, or ``None`` if unknown."""
        with self._lock:
            return self._data.get(ticker.strip().upper())

    def latest_price(self, ticker: str) -> float | None:
        """Return the latest price for ``ticker``, or ``None`` if unknown.

        Shaped to plug directly into
        :func:`app.portfolio.prices.set_price_provider`.
        """
        entry = self.get(ticker)
        return entry.price if entry is not None else None

    def snapshot(self) -> list[PriceUpdate]:
        """Return a point-in-time copy of every cached entry."""
        with self._lock:
            return list(self._data.values())

    def clear(self) -> None:
        """Drop all cached entries (used by tests)."""
        with self._lock:
            self._data.clear()
