"""FinAlly FastAPI application entrypoint.

Boots the API, lazily initializes the SQLite database on startup (creating the
schema and seeding default data if missing), and exposes the health check.
Downstream issues mount their routers on this ``app``; this module owns only
the skeleton and the system endpoints.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.db.init import init_db
from app.market import start_market_data, stop_market_data
from app.portfolio import router as portfolio_router
from app.portfolio.snapshots import record_snapshot_now, snapshot_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Lazy DB init (SPEC §7): create schema + seed defaults if absent.
    init_db()

    # Launch the market-data feed (SPEC §6): a single background task evolves
    # prices into the shared cache and becomes the live trade-fill price source.
    start_market_data()

    # Seed the P&L series with a baseline point, then snapshot every 30s
    # (SPEC §8). Trades record their own snapshot immediately.
    try:
        record_snapshot_now()
    except Exception:  # pragma: no cover - never block startup on a snapshot
        logger.exception("Failed to record initial portfolio snapshot")
    snapshot_task = asyncio.create_task(snapshot_loop())

    try:
        yield
    finally:
        snapshot_task.cancel()
        try:
            await snapshot_task
        except asyncio.CancelledError:
            pass
        await stop_market_data()


app = FastAPI(
    title="FinAlly API",
    description="AI trading workstation backend",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(portfolio_router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    """Health check for Docker/deployment (SPEC §8)."""
    return {
        "status": "ok",
        "market_data": "massive" if settings.use_massive else "simulator",
        "llm_mock": str(settings.llm_mock).lower(),
    }
