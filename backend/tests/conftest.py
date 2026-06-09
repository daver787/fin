"""Shared test fixtures.

Each test runs against a fresh temporary SQLite file so tests never touch the
real ``db/finally.db``. We point the shared settings at a temp path before the
connection module reads it.

The market-data feed is also frozen for the whole suite: the cache is still
seeded with static seed prices, but the background GBM loop never runs, so
``TestClient`` route tests fill trades at deterministic seed prices.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def temp_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Redirect the database to a per-test temporary file."""
    db_file = tmp_path / "finally.db"
    monkeypatch.setattr(settings, "database_path", db_file)
    yield db_file


@pytest.fixture(autouse=True)
def frozen_market(monkeypatch: pytest.MonkeyPatch):
    """Freeze the market feed so seed prices stay deterministic in tests.

    The cache is seeded at startup but the evolving background loop is not
    launched, so trades fill at exact seed prices (e.g. AAPL = 190).
    """
    monkeypatch.setattr(settings, "market_data_live", False)
