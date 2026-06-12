"""Watchlist REST routes (SPEC §8, agent-contract.md).

Thin HTTP layer over :mod:`app.watchlist.service`. Transaction scope is owned by
the ``get_db`` dependency (commit on success, rollback on error).
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app.db.connection import get_db
from app.watchlist import service
from app.watchlist.models import WatchlistAddRequest, WatchlistEntry

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("", response_model=list[WatchlistEntry])
def get_watchlist(conn: sqlite3.Connection = Depends(get_db)) -> list[WatchlistEntry]:
    """The user's watchlist tickers with their latest prices."""
    return service.list_watchlist(conn)


@router.post("", response_model=list[WatchlistEntry])
def add_watchlist(
    request: WatchlistAddRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> list[WatchlistEntry]:
    """Add a ticker and return the updated watchlist."""
    try:
        return service.add_to_watchlist(conn, request.ticker)
    except service.WatchlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/{ticker}", status_code=status.HTTP_204_NO_CONTENT)
def delete_watchlist(
    ticker: str,
    conn: sqlite3.Connection = Depends(get_db),
) -> Response:
    """Remove a ticker from the watchlist."""
    try:
        service.remove_from_watchlist(conn, ticker)
    except service.WatchlistError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
