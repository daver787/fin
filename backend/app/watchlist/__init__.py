"""Watchlist domain (SPEC §8, agent-contract.md).

Owns the set of tickers the user is tracking. Adding a ticker also extends the
live market-data feed so its price starts streaming; removing one stops it from
appearing in the watchlist view (the feed may keep a cached value, which is
harmless). Exposes the ``/api/watchlist`` router.
"""

from app.watchlist.routes import router

__all__ = ["router"]
