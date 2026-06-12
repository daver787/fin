"""Chat API tests — exercise the deterministic mock LLM path (no API key)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def _chat(client: TestClient, message: str) -> dict:
    resp = client.post("/api/chat", json={"message": message})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_chat_buy_executes_trade():
    with TestClient(app) as client:
        body = _chat(client, "buy 2 AAPL")
        assert body["trades"] == [{"ticker": "AAPL", "side": "buy", "quantity": 2}]
        # The trade actually moved the portfolio.
        portfolio = client.get("/api/portfolio").json()
        assert any(p["ticker"] == "AAPL" for p in portfolio["positions"])
        assert portfolio["cash_balance"] < 10000.0


def test_chat_sell_without_shares_reports_error():
    with TestClient(app) as client:
        body = _chat(client, "sell 5 TSLA")
        # No shares held -> trade rejected, surfaced in the message, none applied.
        assert body["trades"] == []
        assert "could not be completed" in body["message"].lower()


def test_chat_add_to_watchlist():
    with TestClient(app) as client:
        body = _chat(client, "add PYPL to my watchlist")
        assert {"ticker": "PYPL", "action": "add"} in body["watchlist_changes"]
        tickers = [e["ticker"] for e in client.get("/api/watchlist").json()]
        assert "PYPL" in tickers


def test_chat_remove_from_watchlist():
    with TestClient(app) as client:
        body = _chat(client, "remove AAPL from watchlist")
        assert {"ticker": "AAPL", "action": "remove"} in body["watchlist_changes"]


def test_chat_portfolio_question_no_actions():
    with TestClient(app) as client:
        body = _chat(client, "how is my portfolio doing?")
        assert body["trades"] == []
        assert body["watchlist_changes"] == []
        assert "$" in body["message"]


def test_chat_empty_message_rejected():
    with TestClient(app) as client:
        resp = client.post("/api/chat", json={"message": "   "})
    assert resp.status_code == 422
