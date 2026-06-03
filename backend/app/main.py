"""FinAlly FastAPI application entrypoint.

Boots the API, lazily initializes the SQLite database on startup (creating the
schema and seeding default data if missing), and exposes the health check.
Downstream issues mount their routers on this ``app``; this module owns only
the skeleton and the system endpoints.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db.init import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lazy DB init (SPEC §7): create schema + seed defaults if absent.
    init_db()
    yield


app = FastAPI(
    title="FinAlly API",
    description="AI trading workstation backend",
    version="0.1.0",
    lifespan=lifespan,
)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    """Health check for Docker/deployment (SPEC §8)."""
    return {
        "status": "ok",
        "market_data": "massive" if settings.use_massive else "simulator",
        "llm_mock": str(settings.llm_mock).lower(),
    }
