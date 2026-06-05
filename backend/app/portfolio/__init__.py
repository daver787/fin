"""Portfolio domain (SPEC §8).

Owns trade execution, position/P&L computation, the append-only trades log,
portfolio-value snapshots, and the REST routes that surface them. The trade
execution service (:func:`app.portfolio.service.execute_trade`) is reused by the
LLM chat flow for auto-executed trades.
"""

from app.portfolio.models import Portfolio, PositionView, SnapshotView, TradeRequest
from app.portfolio.routes import router

__all__ = ["Portfolio", "PositionView", "SnapshotView", "TradeRequest", "router"]
