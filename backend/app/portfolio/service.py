"""Portfolio business logic (SPEC §8).

Pure-ish functions that operate on an open :class:`sqlite3.Connection` and a
``price_lookup`` callable (so prices and the DB can both be stubbed in tests).
The route layer owns transaction scope (commit/rollback) via the ``get_db``
dependency; these functions only issue statements.

:func:`execute_trade` is the single, reusable trade-execution entry point — both
the manual trade bar (POST /api/portfolio/trade) and the LLM chat auto-execution
flow go through it, guaranteeing identical validation and bookkeeping.
"""

from __future__ import annotations

import sqlite3
import uuid
from collections.abc import Callable
from datetime import datetime, timezone

from app.portfolio.models import Portfolio, PositionView, SnapshotView, TradeRequest

DEFAULT_USER_ID = "default"

# Tolerance for float comparisons so accumulated rounding doesn't reject valid
# trades (e.g. selling exactly the held quantity) or leave dust positions.
_EPS = 1e-9

PriceLookup = Callable[[str], float]


class TradeError(Exception):
    """A trade failed validation (insufficient cash/shares, bad input).

    Carries a human-readable message suitable for surfacing to the user (the
    route layer maps this to HTTP 400; the chat flow relays it to the LLM).
    """


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_cash(conn: sqlite3.Connection, user_id: str) -> float:
    row = conn.execute(
        "SELECT cash_balance FROM users_profile WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        # Should never happen post-seed; treat as a hard error rather than
        # silently assuming a balance.
        raise TradeError("User profile not initialized")
    return float(row["cash_balance"])


def _insert_snapshot(
    conn: sqlite3.Connection,
    total_value: float,
    user_id: str = DEFAULT_USER_ID,
    when: str | None = None,
) -> None:
    """Append a portfolio-value snapshot (P&L chart series)."""
    conn.execute(
        """
        INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at)
        VALUES (?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), user_id, total_value, when or _now_iso()),
    )


def get_portfolio(
    conn: sqlite3.Connection,
    price_lookup: PriceLookup,
    user_id: str = DEFAULT_USER_ID,
) -> Portfolio:
    """Build the full portfolio view: cash, positions w/ P&L, and total value."""
    cash = _get_cash(conn, user_id)

    rows = conn.execute(
        """
        SELECT ticker, quantity, avg_cost
        FROM positions
        WHERE user_id = ?
        ORDER BY ticker
        """,
        (user_id,),
    ).fetchall()

    positions: list[PositionView] = []
    positions_value = 0.0
    for row in rows:
        ticker = row["ticker"]
        quantity = float(row["quantity"])
        avg_cost = float(row["avg_cost"])
        current_price = float(price_lookup(ticker))

        market_value = quantity * current_price
        cost_basis = quantity * avg_cost
        unrealized_pnl = market_value - cost_basis
        pct_change = (unrealized_pnl / cost_basis * 100.0) if cost_basis else 0.0

        positions_value += market_value
        positions.append(
            PositionView(
                ticker=ticker,
                quantity=quantity,
                avg_cost=avg_cost,
                current_price=current_price,
                unrealized_pnl=unrealized_pnl,
                pct_change=pct_change,
            )
        )

    return Portfolio(
        cash_balance=cash,
        total_value=cash + positions_value,
        positions=positions,
    )


def get_history(
    conn: sqlite3.Connection,
    user_id: str = DEFAULT_USER_ID,
) -> list[SnapshotView]:
    """Return portfolio-value snapshots oldest-first (for the P&L chart)."""
    rows = conn.execute(
        """
        SELECT total_value, recorded_at
        FROM portfolio_snapshots
        WHERE user_id = ?
        ORDER BY recorded_at ASC, id ASC
        """,
        (user_id,),
    ).fetchall()
    return [
        SnapshotView(total_value=float(r["total_value"]), recorded_at=r["recorded_at"])
        for r in rows
    ]


def execute_trade(
    conn: sqlite3.Connection,
    request: TradeRequest,
    price_lookup: PriceLookup,
    user_id: str = DEFAULT_USER_ID,
) -> Portfolio:
    """Execute a market order and return the updated portfolio.

    All validation runs *before* any write, so a rejected trade never leaves
    partial state regardless of transaction handling. On success this updates
    cash and the position, appends to the trades log, and records a snapshot
    immediately (SPEC §8).
    """
    ticker = request.ticker  # already normalized/validated by the model
    quantity = request.quantity
    price = float(price_lookup(ticker))
    now = _now_iso()

    cash = _get_cash(conn, user_id)
    position = conn.execute(
        "SELECT id, quantity, avg_cost FROM positions WHERE user_id = ? AND ticker = ?",
        (user_id, ticker),
    ).fetchone()

    # --- Validate (no writes yet) ---
    if request.side == "buy":
        cost = quantity * price
        if cost > cash + _EPS:
            raise TradeError(
                f"Insufficient cash: {ticker} buy costs ${cost:,.2f}, "
                f"available ${cash:,.2f}"
            )
    else:  # sell
        held = float(position["quantity"]) if position else 0.0
        if quantity > held + _EPS:
            raise TradeError(
                f"Insufficient shares: cannot sell {quantity:g} {ticker}, "
                f"only {held:g} held"
            )

    # --- Apply (writes) ---
    if request.side == "buy":
        new_cash = cash - quantity * price
        if position:
            old_qty = float(position["quantity"])
            old_avg = float(position["avg_cost"])
            new_qty = old_qty + quantity
            # Weighted-average cost basis across the existing lot and the fill.
            new_avg = (old_qty * old_avg + quantity * price) / new_qty
            conn.execute(
                "UPDATE positions SET quantity = ?, avg_cost = ?, updated_at = ? WHERE id = ?",
                (new_qty, new_avg, now, position["id"]),
            )
        else:
            conn.execute(
                """
                INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (str(uuid.uuid4()), user_id, ticker, quantity, price, now),
            )
    else:  # sell
        new_cash = cash + quantity * price
        remaining = float(position["quantity"]) - quantity
        if remaining <= _EPS:
            # Fully closed — drop the row so it disappears from the table.
            conn.execute("DELETE FROM positions WHERE id = ?", (position["id"],))
        else:
            # Selling never changes average cost of the remaining lot.
            conn.execute(
                "UPDATE positions SET quantity = ?, updated_at = ? WHERE id = ?",
                (remaining, now, position["id"]),
            )

    conn.execute(
        "UPDATE users_profile SET cash_balance = ? WHERE id = ?",
        (new_cash, user_id),
    )

    # Append-only trades log.
    conn.execute(
        """
        INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), user_id, ticker, request.side, quantity, price, now),
    )

    # Snapshot immediately after the trade (SPEC §8), then return fresh state.
    portfolio = get_portfolio(conn, price_lookup, user_id)
    _insert_snapshot(conn, portfolio.total_value, user_id, now)
    return portfolio
