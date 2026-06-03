"""SQLite connection helpers.

A fresh :class:`sqlite3.Connection` is opened per unit of work rather than
shared across threads (FastAPI runs sync work in a threadpool, and a background
market-data task writes concurrently). WAL mode keeps concurrent readers and a
single writer from blocking each other.

Usage::

    from app.db.connection import db_connection

    with db_connection() as conn:
        rows = conn.execute("SELECT * FROM watchlist").fetchall()

Or as a FastAPI dependency::

    @router.get("/watchlist")
    def list_watchlist(conn: sqlite3.Connection = Depends(get_db)):
        ...
"""

from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path

from app.config import settings


def _db_path() -> Path:
    return Path(settings.database_path)


def connect() -> sqlite3.Connection:
    """Open a new SQLite connection to the configured database file.

    The parent directory is created if needed. Rows are returned as
    :class:`sqlite3.Row` (dict-like access), foreign keys are enforced, and WAL
    journaling is enabled for better read/write concurrency.
    """
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


@contextmanager
def db_connection() -> Iterator[sqlite3.Connection]:
    """Context manager yielding a connection, committing on success.

    Commits when the block exits cleanly, rolls back on exception, and always
    closes the connection.
    """
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency yielding a request-scoped connection."""
    with db_connection() as conn:
        yield conn
