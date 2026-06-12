"""Chat domain (SPEC §9, agent-contract.md).

The AI copilot: turns a natural-language message into a structured response,
auto-executes any trades and watchlist changes it implies (through the same
validated paths as the manual UI), and returns the result. Exposes the
``/api/chat`` router.
"""

from app.chat.routes import router

__all__ = ["router"]
