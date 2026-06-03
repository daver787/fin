"""Health endpoint and app-boot smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_200():
    # Using the context manager runs lifespan startup (lazy DB init).
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"


def test_app_boot_creates_db(temp_db):
    assert not temp_db.exists()
    with TestClient(app):
        pass
    # Lifespan startup should have created and seeded the database file.
    assert temp_db.exists()
