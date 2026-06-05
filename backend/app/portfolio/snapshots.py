"""Periodic portfolio-value snapshot task (SPEC §8).

A single background task records a ``portfolio_snapshots`` row every 30s so the
P&L chart has a continuous series even when the user is not trading. Trades
record their own snapshot immediately (see :func:`service.execute_trade`).

The task is started/stopped by the app lifespan (see ``app.main``).
"""

from __future__ import annotations

import asyncio
import logging

from app.db.connection import db_connection
from app.portfolio import service
from app.portfolio.prices import get_current_price

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL_SECONDS = 30.0


def record_snapshot_now() -> None:
    """Record a single snapshot of the current total portfolio value."""
    with db_connection() as conn:
        portfolio = service.get_portfolio(conn, get_current_price)
        service._insert_snapshot(conn, portfolio.total_value)


async def snapshot_loop(interval: float = SNAPSHOT_INTERVAL_SECONDS) -> None:
    """Record a portfolio snapshot every ``interval`` seconds until cancelled."""
    while True:
        try:
            await asyncio.sleep(interval)
            # Run the blocking DB work off the event loop.
            await asyncio.to_thread(record_snapshot_now)
        except asyncio.CancelledError:
            raise
        except Exception:  # pragma: no cover - defensive: never kill the loop
            logger.exception("Failed to record portfolio snapshot")
