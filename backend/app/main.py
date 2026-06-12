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
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.chat import router as chat_router
from app.config import settings
from app.db.init import init_db, reset_db
from app.market import start_market_data, stop_market_data
from app.portfolio import router as portfolio_router
from app.portfolio.snapshots import record_snapshot_now, snapshot_loop
from app.stream import router as stream_router
from app.watchlist import router as watchlist_router

logger = logging.getLogger(__name__)

# Where the built Next.js static export lives (SPEC §3 — FastAPI serves the
# frontend from the same origin). The Dockerfile copies the export here; in
# local dev it is frontend/out after `npm run build`.
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "out"


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
app.include_router(watchlist_router)
app.include_router(stream_router)
app.include_router(chat_router)


@app.get("/api/health", tags=["system"])
def health() -> dict[str, str]:
    """Health check for Docker/deployment (SPEC §8)."""
    return {
        "status": "ok",
        "market_data": "massive" if settings.use_massive else "simulator",
        "llm_mock": str(settings.use_mock_llm).lower(),
    }


# Test-only state reset for E2E isolation (each test starts from the fresh
# seed). Registered only when explicitly enabled — never present in production.
if settings.enable_test_reset:

    @app.post("/api/test/reset", tags=["system"])
    def test_reset() -> dict[str, str]:
        reset_db()
        return {"status": "reset"}


# Serve the built frontend from the same origin (SPEC §3). Mounted last so every
# /api/* route is matched first; this catch-all handles the SPA and its assets.
# Absent in a backend-only checkout (no build yet) — the API still runs.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:  # pragma: no cover - depends on whether the frontend has been built
    logger.warning(
        "Frontend export not found at %s; serving API only. Build the frontend "
        "(npm run build) or use the Docker image.",
        FRONTEND_DIST,
    )
