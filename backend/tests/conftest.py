"""Shared test fixtures.

Each test runs against a fresh temporary SQLite file so tests never touch the
real ``db/finally.db``. We point the shared settings at a temp path before the
connection module reads it.
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
