"""Watchlist business logic (SPEC §8).

Pure functions over an open :class:`sqlite3.Connection`. The route layer owns
transaction scope via the ``get_db`` dependency. Prices are read from the shared
market-data cache so the list reflects live quotes; a ticker with no cached
price yet reports ``None`` (the contract allows a null price).
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone

from app.market import add_ticker as feed_add_ticker
from app.market import get_cache
from app.watchlist.models import WatchlistEntry

DEFAULT_USER_ID = "default"


class WatchlistError(Exception):
    """A watchlist mutation failed validation (bad ticker, duplicate, ...)."""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(ticker: str) -> str:
    symbol = ticker.strip().upper()
    if not symbol:
        raise WatchlistError("ticker must not be empty")
    if not symbol.isalpha() or len(symbol) > 8:
        raise WatchlistError(f"invalid ticker: {ticker!r}")
    return symbol


def list_watchlist(
    conn: sqlite3.Connection,
    user_id: str = DEFAULT_USER_ID,
) -> list[WatchlistEntry]:
    """Return the user's watchlist tickers with their latest cached price."""
    cache = get_cache()
    rows = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY ticker",
        (user_id,),
    ).fetchall()
    return [
        WatchlistEntry(ticker=row["ticker"], price=cache.latest_price(row["ticker"]))
        for row in rows
    ]


def add_to_watchlist(
    conn: sqlite3.Connection,
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
) -> list[WatchlistEntry]:
    """Add ``ticker`` to the watchlist and start streaming its price.

    Idempotent: adding an existing ticker is a no-op (returns the current list).
    Extends the live feed so the new symbol's price begins updating immediately.
    """
    symbol = _normalize(ticker)
    conn.execute(
        """
        INSERT INTO watchlist (id, user_id, ticker, added_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, ticker) DO NOTHING
        """,
        (str(uuid.uuid4()), user_id, symbol, _now_iso()),
    )
    # Track it in the live feed (also primes the cache with a starting price).
    feed_add_ticker(symbol)
    return list_watchlist(conn, user_id)


def remove_from_watchlist(
    conn: sqlite3.Connection,
    ticker: str,
    user_id: str = DEFAULT_USER_ID,
) -> None:
    """Remove ``ticker`` from the watchlist.

    Idempotent: removing a ticker that is not present is a no-op. The feed may
    retain a cached price for the symbol, which is harmless — it simply stops
    appearing in the watchlist view.
    """
    symbol = _normalize(ticker)
    conn.execute(
        "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?",
        (user_id, symbol),
    )
