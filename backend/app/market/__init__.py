"""Market-data domain (SPEC §6).

Defines a source-agnostic :class:`~app.market.base.MarketDataSource` interface
and ships the default in-process :class:`~app.market.simulator.GBMSimulator`. A
single background task (see :mod:`app.market.service`) drives the configured
source and writes every quote into the shared
:class:`~app.market.cache.PriceCache`. Downstream consumers — the SSE stream,
trade-fill pricing, the frontend — read from the cache and never depend on which
source produced the prices.
"""

from app.market.base import MarketDataSource, PriceUpdate
from app.market.cache import PriceCache
from app.market.service import add_ticker, get_cache, start_market_data, stop_market_data
from app.market.simulator import GBMSimulator

__all__ = [
    "MarketDataSource",
    "PriceUpdate",
    "PriceCache",
    "GBMSimulator",
    "add_ticker",
    "get_cache",
    "start_market_data",
    "stop_market_data",
]
