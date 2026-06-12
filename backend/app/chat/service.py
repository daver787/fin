"""Chat orchestration (SPEC §9).

Ties the LLM to the trading engine: builds account context, asks the LLM for a
structured response, **auto-executes** any trades and watchlist changes it
returned (reusing the exact same validated paths as the manual UI), records the
conversation, and reports the outcome back to the user.

Action execution reuses :func:`app.portfolio.service.execute_trade` and the
watchlist service, so an AI-initiated trade is validated and booked identically
to a manual one (SPEC §8 — single trade-execution entry point).
"""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Any

from app.chat import llm
from app.chat.models import ChatResponse, ChatTrade, WatchlistChange
from app.portfolio import service as portfolio_service
from app.portfolio.models import TradeRequest
from app.portfolio.prices import get_current_price
from app.watchlist import service as watchlist_service

logger = logging.getLogger(__name__)

DEFAULT_USER_ID = "default"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_context(conn: sqlite3.Connection, user_id: str) -> dict[str, Any]:
    """Assemble the portfolio + watchlist context handed to the LLM."""
    portfolio = portfolio_service.get_portfolio(conn, get_current_price, user_id)
    watch_rows = conn.execute(
        "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY ticker",
        (user_id,),
    ).fetchall()
    return {
        "cash_balance": portfolio.cash_balance,
        "total_value": portfolio.total_value,
        "positions": [p.model_dump() for p in portfolio.positions],
        "watchlist": [r["ticker"] for r in watch_rows],
    }


def _execute_trades(
    conn: sqlite3.Connection, trades: list[ChatTrade], user_id: str
) -> tuple[list[ChatTrade], list[str]]:
    """Execute each requested trade, returning (succeeded, error messages)."""
    done: list[ChatTrade] = []
    errors: list[str] = []
    for trade in trades:
        try:
            req = TradeRequest(
                ticker=trade.ticker, quantity=trade.quantity, side=trade.side
            )
            portfolio_service.execute_trade(conn, req, get_current_price, user_id)
            done.append(trade)
        except portfolio_service.TradeError as exc:
            errors.append(f"{trade.side} {trade.quantity:g} {trade.ticker}: {exc}")
        except Exception as exc:  # pragma: no cover - defensive
            logger.exception("Chat trade execution failed")
            errors.append(f"{trade.side} {trade.quantity:g} {trade.ticker}: {exc}")
    return done, errors


def _apply_watchlist(
    conn: sqlite3.Connection, changes: list[WatchlistChange], user_id: str
) -> tuple[list[WatchlistChange], list[str]]:
    """Apply each watchlist change, returning (succeeded, error messages)."""
    done: list[WatchlistChange] = []
    errors: list[str] = []
    for change in changes:
        try:
            if change.action == "add":
                watchlist_service.add_to_watchlist(conn, change.ticker, user_id)
            else:
                watchlist_service.remove_from_watchlist(conn, change.ticker, user_id)
            done.append(change)
        except watchlist_service.WatchlistError as exc:
            errors.append(f"{change.action} {change.ticker}: {exc}")
    return done, errors


def _record(
    conn: sqlite3.Connection,
    user_message: str,
    response: ChatResponse,
    user_id: str,
) -> None:
    """Persist the user turn and the assistant turn to ``chat_messages``."""
    now = _now_iso()
    conn.execute(
        """
        INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)
        VALUES (?, ?, 'user', ?, NULL, ?)
        """,
        (str(uuid.uuid4()), user_id, user_message, now),
    )
    actions = json.dumps(
        {
            "trades": [t.model_dump() for t in response.trades],
            "watchlist_changes": [w.model_dump() for w in response.watchlist_changes],
        }
    )
    conn.execute(
        """
        INSERT INTO chat_messages (id, user_id, role, content, actions, created_at)
        VALUES (?, ?, 'assistant', ?, ?, ?)
        """,
        (str(uuid.uuid4()), user_id, response.message, actions, now),
    )


def handle_message(
    conn: sqlite3.Connection,
    message: str,
    user_id: str = DEFAULT_USER_ID,
) -> ChatResponse:
    """Run the full chat turn and return the response actually applied.

    The returned ``trades`` / ``watchlist_changes`` reflect what *succeeded*;
    any failures are appended to the message so the user sees what happened.
    """
    context = _build_context(conn, user_id)

    raw = llm.complete(message, context)
    # Validate the LLM (or mock) output against the contract before acting.
    proposed = ChatResponse.model_validate(raw)

    traded, trade_errors = _execute_trades(conn, proposed.trades, user_id)
    watched, watch_errors = _apply_watchlist(conn, proposed.watchlist_changes, user_id)

    message_text = proposed.message
    errors = trade_errors + watch_errors
    if errors:
        message_text += "\n\nSome actions could not be completed:\n- " + "\n- ".join(
            errors
        )

    response = ChatResponse(
        message=message_text,
        trades=traded,
        watchlist_changes=watched,
    )
    _record(conn, message, response, user_id)
    return response
