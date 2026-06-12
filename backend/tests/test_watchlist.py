"""Watchlist API tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_default_watchlist_seeded():
    with TestClient(app) as client:
        resp = client.get("/api/watchlist")
    assert resp.status_code == 200
    body = resp.json()
    tickers = [e["ticker"] for e in body]
    assert "AAPL" in tickers
    assert len(tickers) == 10
    # Every entry carries a price field (live prices have been seeded on start).
    assert all("price" in e for e in body)


def test_add_watchlist_returns_updated_list():
    with TestClient(app) as client:
        resp = client.post("/api/watchlist", json={"ticker": "pypl"})
        assert resp.status_code == 200
        tickers = [e["ticker"] for e in resp.json()]
        assert "PYPL" in tickers  # normalized to upper-case
        # Added ticker streams a price immediately (seeded on add).
        pypl = next(e for e in resp.json() if e["ticker"] == "PYPL")
        assert pypl["price"] is not None


def test_add_watchlist_is_idempotent():
    with TestClient(app) as client:
        client.post("/api/watchlist", json={"ticker": "PYPL"})
        resp = client.post("/api/watchlist", json={"ticker": "PYPL"})
        tickers = [e["ticker"] for e in resp.json()]
        assert tickers.count("PYPL") == 1


def test_remove_watchlist():
    with TestClient(app) as client:
        resp = client.delete("/api/watchlist/AAPL")
        assert resp.status_code == 204
        tickers = [e["ticker"] for e in client.get("/api/watchlist").json()]
        assert "AAPL" not in tickers


def test_add_invalid_ticker_rejected():
    with TestClient(app) as client:
        resp = client.post("/api/watchlist", json={"ticker": "123!"})
    assert resp.status_code == 400
