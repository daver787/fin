"""Server-Sent Events streaming (SPEC §6, agent-contract.md).

Exposes ``/api/stream/prices`` — a one-way server→client push of the latest
price for every tracked ticker, sourced from the shared market-data cache. SSE
is used over WebSockets because the data flow is one-directional and native
``EventSource`` gives the frontend automatic reconnection for free.
"""

from app.stream.routes import router

__all__ = ["router"]
