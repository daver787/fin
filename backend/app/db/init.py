"""Lazy database initialization and default seeding (SPEC §7).

``init_db()`` is idempotent: it creates the schema if missing and seeds default
data only when absent. It is called once on application startup (see
``app.main`` lifespan) and is safe to call again — making it suitable as a
first-request guard as well.
"""

from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.db.connection import connect

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"

DEFAULT_USER_ID = "default"
DEFAULT_CASH_BALANCE = 10000.0

# Ten default watchlist tickers (SPEC §7 seed data).
DEFAULT_WATCHLIST = [
    "AAPL",
    "GOOGL",
    "MSFT",
    "AMZN",
    "TSLA",
    "NVDA",
    "META",
    "JPM",
    "V",
    "NFLX",
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_schema(conn: sqlite3.Connection) -> None:
    """Create all tables/indexes if they do not already exist."""
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def seed_defaults(conn: sqlite3.Connection) -> None:
    """Insert default user and watchlist rows when missing (idempotent)."""
    now = _now_iso()

    # Default user with $10,000 cash.
    conn.execute(
        """
        INSERT INTO users_profile (id, cash_balance, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO NOTHING
        """,
        (DEFAULT_USER_ID, DEFAULT_CASH_BALANCE, now),
    )

    # Default watchlist tickers. UNIQUE(user_id, ticker) makes this safe to
    # re-run; existing tickers are left untouched.
    for ticker in DEFAULT_WATCHLIST:
        conn.execute(
            """
            INSERT INTO watchlist (id, user_id, ticker, added_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, ticker) DO NOTHING
            """,
            (str(uuid.uuid4()), DEFAULT_USER_ID, ticker, now),
        )


def init_db() -> None:
    """Ensure schema and default seed data exist. Idempotent."""
    conn = connect()
    try:
        create_schema(conn)
        seed_defaults(conn)
        conn.commit()
    finally:
        conn.close()


# Tables holding mutable per-user state, cleared by reset_db (test-only).
_RESETTABLE_TABLES = (
    "trades",
    "positions",
    "portfolio_snapshots",
    "chat_messages",
    "watchlist",
    "users_profile",
)


def reset_db() -> None:
    """Wipe all mutable state and re-seed defaults (test isolation only).

    Used by the guarded ``/api/test/reset`` endpoint so each E2E test starts
    from the fresh seed ($10k cash, default watchlist, no positions). Never
    exposed in production.
    """
    conn = connect()
    try:
        create_schema(conn)
        for table in _RESETTABLE_TABLES:
            conn.execute(f"DELETE FROM {table}")
        conn.commit()
    finally:
        conn.close()
    seed_defaults_into_fresh()


def seed_defaults_into_fresh() -> None:
    """Re-seed the default user and watchlist after a wipe."""
    conn = connect()
    try:
        seed_defaults(conn)
        conn.commit()
    finally:
        conn.close()
