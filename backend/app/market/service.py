"""Market-data feed wiring (SPEC §6).

Owns the single shared :class:`PriceCache`, builds the configured
:class:`MarketDataSource`, and runs the background loop that drives the source
and writes every quote into the cache. Startup also registers the cache as the
live price provider for trade fills (:mod:`app.portfolio.prices`) so trades fill
at the current simulated price.

Selection is source-agnostic: when a Massive API key is configured the Massive
poller will be used (implemented separately in fin-4ee1); otherwise the
in-process GBM simulator. Both satisfy the same interface, so this loop is
unchanged either way.
"""

from __future__ import annotations

import asyncio
import logging

from app.config import settings
from app.db.connection import db_connection
from app.market.base import MarketDataSource
from app.market.cache import PriceCache
from app.market.simulator import GBMSimulator
from app.portfolio.prices import SEED_PRICES, set_price_provider

logger = logging.getLogger(__name__)

# Single process-wide cache shared by every reader (SSE stream, trade pricing).
_cache = PriceCache()

# Handle to the running feed loop so startup/shutdown can manage its lifecycle.
_task: asyncio.Task | None = None


def get_cache() -> PriceCache:
    """Return the shared price cache (read by SSE streaming and pricing)."""
    return _cache


def load_watchlist_tickers() -> list[str]:
    """Return the tickers to track — the user's watchlist, seeds as fallback.

    Reads the watchlist table directly; if it is empty or unavailable (e.g.
    before seeding) the default seed tickers keep the feed populated.
    """
    try:
        with db_connection() as conn:
            rows = conn.execute("SELECT ticker FROM watchlist ORDER BY ticker").fetchall()
        tickers = [row["ticker"] for row in rows]
    except Exception:
        logger.exception("Failed to load watchlist; falling back to seed tickers")
        tickers = []
    return tickers or list(SEED_PRICES)


def create_source(tickers: list[str]) -> MarketDataSource:
    """Build the market-data source selected by configuration (SPEC §6)."""
    if settings.use_massive:
        # The Massive REST poller (fin-4ee1) implements the same interface and
        # plugs in here; until then the simulator keeps the feed running.
        logger.warning(
            "MASSIVE_API_KEY is set but the Massive poller is not yet "
            "available; using the GBM simulator."
        )
    return GBMSimulator(tickers)


async def run_feed(source: MarketDataSource, cache: PriceCache) -> None:
    """Drive ``source`` forever, writing each fetched price into ``cache``.

    Transient fetch errors are logged and retried on the next tick so a single
    failure never kills the feed.
    """
    while True:
        try:
            quotes = await source.fetch()
            for ticker, price in quotes.items():
                cache.update(ticker, price)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Market-data fetch failed; retrying next tick")
        await asyncio.sleep(source.poll_interval)


def start_market_data() -> asyncio.Task:
    """Start the background feed and register the live price provider.

    Primes the cache with each source's starting price so consumers have data
    immediately, registers the cache as the trade-fill price provider, then
    launches the feed loop. Returns the loop task for the caller to cancel on
    shutdown.
    """
    global _task

    tickers = load_watchlist_tickers()
    source = create_source(tickers)

    # Seed the cache so the first SSE read / trade fill has prices before the
    # first tick lands.
    if isinstance(source, GBMSimulator):
        for ticker, price in source.prices.items():
            _cache.update(ticker, price)

    set_price_provider(_cache.latest_price)

    _task = asyncio.create_task(run_feed(source, _cache))
    logger.info("Market-data feed started for %d tickers", len(tickers))
    return _task


async def stop_market_data() -> None:
    """Cancel the feed loop and unregister the price provider."""
    global _task

    set_price_provider(None)
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    finally:
        _task = None
