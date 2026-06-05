"""Portfolio service and route tests (SPEC §8).

Service-level tests inject a deterministic ``price_lookup`` so trade math and
P&L are exact and independent of the market-data layer. Route-level tests drive
the real endpoints through ``TestClient`` (prices come from the seed fallback).
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.db.connection import db_connection
from app.db.init import DEFAULT_CASH_BALANCE, init_db
from app.main import app
from app.portfolio import service
from app.portfolio.models import TradeRequest


def _prices(mapping: dict[str, float]):
    """Build a price_lookup over a fixed mapping (default 100.0)."""
    return lambda ticker: mapping.get(ticker.upper(), 100.0)


@pytest.fixture
def seeded_db():
    """Initialize schema + default seed and yield nothing (uses temp_db)."""
    init_db()
    yield


# --------------------------------------------------------------------------- #
# Service: portfolio view
# --------------------------------------------------------------------------- #


def test_empty_portfolio(seeded_db):
    with db_connection() as conn:
        pf = service.get_portfolio(conn, _prices({}))
    assert pf.cash_balance == DEFAULT_CASH_BALANCE
    assert pf.total_value == DEFAULT_CASH_BALANCE
    assert pf.positions == []


# --------------------------------------------------------------------------- #
# Service: buys
# --------------------------------------------------------------------------- #


def test_buy_creates_position_and_debits_cash(seeded_db):
    lookup = _prices({"AAPL": 100.0})
    with db_connection() as conn:
        pf = service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), lookup
        )
    assert pf.cash_balance == pytest.approx(DEFAULT_CASH_BALANCE - 1000.0)
    assert len(pf.positions) == 1
    pos = pf.positions[0]
    assert pos.ticker == "AAPL"
    assert pos.quantity == 10
    assert pos.avg_cost == pytest.approx(100.0)
    assert pos.current_price == pytest.approx(100.0)
    assert pos.unrealized_pnl == pytest.approx(0.0)
    # Total value conserved: cash spent is now position value.
    assert pf.total_value == pytest.approx(DEFAULT_CASH_BALANCE)


def test_buy_more_uses_weighted_average_cost(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 100.0})
        )
        pf = service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 200.0})
        )
    pos = pf.positions[0]
    assert pos.quantity == 20
    # (10*100 + 10*200) / 20 = 150
    assert pos.avg_cost == pytest.approx(150.0)


def test_buy_insufficient_cash_rejected(seeded_db):
    with db_connection() as conn:
        with pytest.raises(service.TradeError):
            service.execute_trade(
                conn,
                TradeRequest(ticker="AAPL", quantity=1000, side="buy"),
                _prices({"AAPL": 100.0}),
            )
        # No partial state: cash untouched, no position, no trade row.
        cash = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE id = 'default'"
        ).fetchone()["cash_balance"]
        assert cash == DEFAULT_CASH_BALANCE
        assert conn.execute("SELECT COUNT(*) AS c FROM positions").fetchone()["c"] == 0
        assert conn.execute("SELECT COUNT(*) AS c FROM trades").fetchone()["c"] == 0


# --------------------------------------------------------------------------- #
# Service: sells
# --------------------------------------------------------------------------- #


def test_sell_partial_reduces_quantity_and_credits_cash(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 100.0})
        )
        pf = service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=4, side="sell"), _prices({"AAPL": 150.0})
        )
    pos = pf.positions[0]
    assert pos.quantity == 6
    # Avg cost unchanged by a sell.
    assert pos.avg_cost == pytest.approx(100.0)
    # Cash: 10000 - 1000 (buy) + 600 (sell 4 @ 150) = 9600
    assert pf.cash_balance == pytest.approx(DEFAULT_CASH_BALANCE - 1000.0 + 600.0)


def test_sell_all_removes_position(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 100.0})
        )
        pf = service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="sell"), _prices({"AAPL": 120.0})
        )
    assert pf.positions == []
    assert pf.cash_balance == pytest.approx(DEFAULT_CASH_BALANCE - 1000.0 + 1200.0)


def test_sell_more_than_held_rejected(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=5, side="buy"), _prices({"AAPL": 100.0})
        )
        with pytest.raises(service.TradeError):
            service.execute_trade(
                conn,
                TradeRequest(ticker="AAPL", quantity=6, side="sell"),
                _prices({"AAPL": 100.0}),
            )


def test_sell_without_position_rejected(seeded_db):
    with db_connection() as conn:
        with pytest.raises(service.TradeError):
            service.execute_trade(
                conn,
                TradeRequest(ticker="TSLA", quantity=1, side="sell"),
                _prices({"TSLA": 100.0}),
            )


# --------------------------------------------------------------------------- #
# Service: P&L math
# --------------------------------------------------------------------------- #


def test_unrealized_pnl_and_pct_change(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 100.0})
        )
        # Price rises to 130 -> +30/share -> +300 total, +30%.
        pf = service.get_portfolio(conn, _prices({"AAPL": 130.0}))
    pos = pf.positions[0]
    assert pos.current_price == pytest.approx(130.0)
    assert pos.unrealized_pnl == pytest.approx(300.0)
    assert pos.pct_change == pytest.approx(30.0)
    # Total value = cash (9000) + market value (1300) = 10300.
    assert pf.total_value == pytest.approx(DEFAULT_CASH_BALANCE + 300.0)


def test_unrealized_loss(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=10, side="buy"), _prices({"AAPL": 100.0})
        )
        pf = service.get_portfolio(conn, _prices({"AAPL": 80.0}))
    pos = pf.positions[0]
    assert pos.unrealized_pnl == pytest.approx(-200.0)
    assert pos.pct_change == pytest.approx(-20.0)


# --------------------------------------------------------------------------- #
# Service: trades log + snapshots
# --------------------------------------------------------------------------- #


def test_trades_log_is_appended(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=2, side="buy"), _prices({"AAPL": 100.0})
        )
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=1, side="sell"), _prices({"AAPL": 110.0})
        )
        rows = conn.execute(
            "SELECT ticker, side, quantity, price FROM trades ORDER BY executed_at, id"
        ).fetchall()
    assert len(rows) == 2
    assert rows[0]["side"] == "buy" and rows[0]["price"] == pytest.approx(100.0)
    assert rows[1]["side"] == "sell" and rows[1]["price"] == pytest.approx(110.0)


def test_each_trade_records_a_snapshot(seeded_db):
    with db_connection() as conn:
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=2, side="buy"), _prices({"AAPL": 100.0})
        )
        service.execute_trade(
            conn, TradeRequest(ticker="AAPL", quantity=1, side="sell"), _prices({"AAPL": 110.0})
        )
        history = service.get_history(conn)
    assert len(history) == 2
    # Snapshots are returned oldest-first.
    assert all(isinstance(s.total_value, float) for s in history)


# --------------------------------------------------------------------------- #
# Routes (TestClient) — prices come from the seed fallback (AAPL=190)
# --------------------------------------------------------------------------- #


def test_route_get_portfolio_default():
    with TestClient(app) as client:
        resp = client.get("/api/portfolio")
    assert resp.status_code == 200
    body = resp.json()
    assert body["cash_balance"] == DEFAULT_CASH_BALANCE
    assert body["total_value"] == DEFAULT_CASH_BALANCE
    assert body["positions"] == []


def test_route_trade_buy_then_portfolio_updates():
    with TestClient(app) as client:
        resp = client.post(
            "/api/portfolio/trade",
            json={"ticker": "aapl", "quantity": 2, "side": "buy"},
        )
        assert resp.status_code == 200
        body = resp.json()
        # Seed price AAPL = 190 -> cost 380.
        assert body["cash_balance"] == pytest.approx(DEFAULT_CASH_BALANCE - 380.0)
        assert len(body["positions"]) == 1
        pos = body["positions"][0]
        assert pos["ticker"] == "AAPL"  # normalized to upper-case
        assert pos["quantity"] == 2
        assert pos["avg_cost"] == pytest.approx(190.0)


def test_route_trade_insufficient_cash_returns_400():
    with TestClient(app) as client:
        resp = client.post(
            "/api/portfolio/trade",
            json={"ticker": "AAPL", "quantity": 100000, "side": "buy"},
        )
    assert resp.status_code == 400
    assert "Insufficient cash" in resp.json()["detail"]


def test_route_trade_invalid_quantity_returns_422():
    with TestClient(app) as client:
        resp = client.post(
            "/api/portfolio/trade",
            json={"ticker": "AAPL", "quantity": 0, "side": "buy"},
        )
    assert resp.status_code == 422


def test_route_history_returns_list():
    with TestClient(app) as client:
        # Startup records a baseline snapshot; a trade adds one more.
        client.post(
            "/api/portfolio/trade",
            json={"ticker": "AAPL", "quantity": 1, "side": "buy"},
        )
        resp = client.get("/api/portfolio/history")
    assert resp.status_code == 200
    history = resp.json()
    assert isinstance(history, list)
    assert len(history) >= 1
    assert "total_value" in history[0] and "recorded_at" in history[0]
