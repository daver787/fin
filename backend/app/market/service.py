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

# The live source, kept so the watchlist layer can extend the tracked tickers
# at runtime (adding a symbol makes the feed start producing prices for it).
_source: MarketDataSource | None = None


def get_cache() -> PriceCache:
    """Return the shared price cache (read by SSE streaming and pricing)."""
    return _cache


def add_ticker(ticker: str) -> None:
    """Begin tracking ``ticker`` in the live feed and prime its cache entry.

    Called when a ticker is added to the watchlist so its price starts
    streaming immediately. Safe to call before the feed has started; the
    cache is seeded so the first SSE read / portfolio price has a value.
    """
    symbol = ticker.strip().upper()
    if not symbol:
        return
    if _source is not None:
        _source.add_ticker(symbol)
    # Seed the cache so consumers see a price before the next feed tick. The
    # GBM simulator seeds unknown symbols at a sane default; mirror that here.
    if _cache.get(symbol) is None:
        from app.market.simulator import seed_price_for

        _cache.update(symbol, seed_price_for(symbol))


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

    The cache is pre-seeded with starting prices before this loop runs (see
    :func:`start_market_data`), so we sleep one interval *before* the first
    fetch. That avoids a redundant evolution at t=0 and gives consumers a
    deterministic initial state (the seed prices) for the first interval.
    """
    while True:
        await asyncio.sleep(source.poll_interval)
        try:
            quotes = await source.fetch()
            for ticker, price in quotes.items():
                cache.update(ticker, price)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Market-data fetch failed; retrying next tick")


def start_market_data() -> asyncio.Task | None:
    """Start the background feed and register the live price provider.

    Primes the cache with each source's starting price so consumers have data
    immediately, registers the cache as the trade-fill price provider, then
    launches the feed loop. Returns the loop task for the caller to cancel on
    shutdown.

    When ``settings.market_data_live`` is false the cache is still seeded and the
    price provider registered, but the evolving feed loop is not launched — so
    prices stay frozen at their seed values. Returns ``None`` in that case.
    """
    global _task, _source

    tickers = load_watchlist_tickers()
    source = create_source(tickers)
    _source = source

    # Seed the cache so the first SSE read / trade fill has prices before the
    # first tick lands.
    if isinstance(source, GBMSimulator):
        for ticker, price in source.prices.items():
            _cache.update(ticker, price)

    set_price_provider(_cache.latest_price)

    if not settings.market_data_live:
        logger.info(
            "Market-data feed disabled (market_data_live=false); cache seeded "
            "with %d static prices", len(tickers)
        )
        _task = None
        return None

    _task = asyncio.create_task(run_feed(source, _cache))
    logger.info("Market-data feed started for %d tickers", len(tickers))
    return _task


async def stop_market_data() -> None:
    """Cancel the feed loop and unregister the price provider."""
    global _task, _source

    set_price_provider(None)
    _source = None
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    finally:
        _task = None
