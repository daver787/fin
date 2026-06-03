"""Database schema and seeding tests (SPEC §7)."""

from __future__ import annotations

from app.db.connection import db_connection
from app.db.init import (
    DEFAULT_CASH_BALANCE,
    DEFAULT_USER_ID,
    DEFAULT_WATCHLIST,
    init_db,
)

EXPECTED_TABLES = {
    "users_profile",
    "watchlist",
    "positions",
    "trades",
    "portfolio_snapshots",
    "chat_messages",
}


def _table_names() -> set[str]:
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    return {r["name"] for r in rows}


def test_init_creates_all_tables():
    init_db()
    assert EXPECTED_TABLES.issubset(_table_names())


def test_seed_default_user():
    init_db()
    with db_connection() as conn:
        row = conn.execute(
            "SELECT id, cash_balance FROM users_profile WHERE id = ?",
            (DEFAULT_USER_ID,),
        ).fetchone()
    assert row is not None
    assert row["cash_balance"] == DEFAULT_CASH_BALANCE


def test_seed_default_watchlist():
    init_db()
    with db_connection() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ?",
            (DEFAULT_USER_ID,),
        ).fetchall()
    tickers = {r["ticker"] for r in rows}
    assert tickers == set(DEFAULT_WATCHLIST)
    assert len(rows) == len(DEFAULT_WATCHLIST)


def test_init_is_idempotent():
    init_db()
    init_db()  # second run must not duplicate seed data or error
    with db_connection() as conn:
        user_count = conn.execute(
            "SELECT COUNT(*) AS c FROM users_profile"
        ).fetchone()["c"]
        wl_count = conn.execute(
            "SELECT COUNT(*) AS c FROM watchlist"
        ).fetchone()["c"]
    assert user_count == 1
    assert wl_count == len(DEFAULT_WATCHLIST)
