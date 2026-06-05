"""Portfolio REST routes (SPEC §8 / agent-contract.md).

Thin HTTP layer over :mod:`app.portfolio.service`. Transaction scope is owned by
the ``get_db`` dependency (commit on success, rollback if the handler raises).
Prices are resolved via the shared :func:`get_current_price` seam.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.db.connection import get_db
from app.portfolio import service
from app.portfolio.models import Portfolio, SnapshotView, TradeRequest
from app.portfolio.prices import get_current_price

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


@router.get("", response_model=Portfolio)
def read_portfolio(conn: sqlite3.Connection = Depends(get_db)) -> Portfolio:
    """Current positions, cash balance, total value, and unrealized P&L."""
    return service.get_portfolio(conn, get_current_price)


@router.post("/trade", response_model=Portfolio)
def post_trade(
    request: TradeRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> Portfolio:
    """Execute a market order (instant fill) and return the updated portfolio."""
    try:
        return service.execute_trade(conn, request, get_current_price)
    except service.TradeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/history", response_model=list[SnapshotView])
def read_history(conn: sqlite3.Connection = Depends(get_db)) -> list[SnapshotView]:
    """Portfolio-value snapshots over time (P&L chart series)."""
    return service.get_history(conn)
