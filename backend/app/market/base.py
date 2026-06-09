"""Source-agnostic market-data interface (SPEC §6).

Both the in-process simulator and the optional Massive REST poller implement the
same :class:`MarketDataSource` so the rest of the system — the background feed
loop, the price cache, the SSE stream — is identical regardless of where prices
come from. A source is responsible for one thing: producing the latest price for
every ticker it tracks, on demand, at its own natural cadence.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

# Change direction of a price relative to its previous value (SPEC §6 SSE event).
Direction = Literal["up", "down", "flat"]


@dataclass(frozen=True)
class PriceUpdate:
    """A single ticker's latest quote as stored in the cache and streamed out.

    Mirrors the SSE event payload (SPEC §6): ticker, price, previous price,
    timestamp, and change direction. Immutable so cached entries can be shared
    across threads without defensive copying.
    """

    ticker: str
    price: float
    previous_price: float
    timestamp: str  # ISO-8601 UTC
    direction: Direction

    @property
    def change(self) -> float:
        """Absolute price change from the previous quote."""
        return self.price - self.previous_price

    @property
    def change_pct(self) -> float:
        """Percentage change from the previous quote (0.0 when previous is 0)."""
        if self.previous_price == 0:
            return 0.0
        return (self.price - self.previous_price) / self.previous_price * 100.0


class MarketDataSource(ABC):
    """Abstract source of live prices for a set of tickers.

    Implementations evolve or poll prices however they like (GBM simulation,
    REST polling, ...) and return the current price for every tracked ticker
    from :meth:`fetch`. The driving loop calls :meth:`fetch` every
    :attr:`poll_interval` seconds and writes the results into the price cache.
    """

    @property
    @abstractmethod
    def poll_interval(self) -> float:
        """Seconds the feed loop should wait between :meth:`fetch` calls."""

    @property
    @abstractmethod
    def tickers(self) -> list[str]:
        """The tickers this source currently produces prices for."""

    @abstractmethod
    def add_ticker(self, ticker: str) -> None:
        """Begin tracking ``ticker`` (e.g. when a user extends the watchlist)."""

    @abstractmethod
    async def fetch(self) -> dict[str, float]:
        """Return the latest price for every tracked ticker.

        Maps upper-case ticker -> price. Called once per poll interval by the
        background feed loop.
        """
