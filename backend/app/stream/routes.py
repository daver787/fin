"""SSE price-stream route (SPEC §6, agent-contract.md).

Streams the latest quote for every tracked ticker as Server-Sent Events. Each
event payload matches the binding contract consumed by the frontend
``useEventSource`` hook::

    {ticker, price, prev_price, timestamp, direction}

The stream emits one event per ticker on connect (so a freshly loaded page has
immediate data) and thereafter pushes the cache contents on a ~500ms cadence —
the same cadence at which the simulator evolves prices. The endpoint never
recomputes prices; it only relays what the market-data feed has written into the
shared :class:`~app.market.cache.PriceCache`.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.market import get_cache
from app.market.base import PriceUpdate

router = APIRouter(prefix="/api/stream", tags=["stream"])

# Push cadence — matches the simulator's ~500ms tick (SPEC §6).
STREAM_INTERVAL_SECONDS = 0.5


def _format_event(update: PriceUpdate) -> str:
    """Render one :class:`PriceUpdate` as an SSE ``data:`` frame.

    Field names mirror the contract (``prev_price``, not ``previous_price``).
    """
    payload = {
        "ticker": update.ticker,
        "price": update.price,
        "prev_price": update.previous_price,
        "timestamp": update.timestamp,
        "direction": update.direction,
    }
    return f"data: {json.dumps(payload)}\n\n"


async def _price_events(request: Request) -> AsyncIterator[str]:
    """Yield SSE frames for every cached ticker until the client disconnects.

    Sends the current cache snapshot immediately, then re-sends it every
    interval. The client accumulates history from the stream, so re-sending the
    latest value each tick is exactly what the sparklines and flash animations
    consume.
    """
    cache = get_cache()
    while True:
        if await request.is_disconnected():
            break
        # Relay the latest snapshot. On connect this paints the page; on
        # subsequent ticks the simulator has moved prices, driving the
        # frontend's flash animations and sparkline accumulation.
        for update in cache.snapshot():
            yield _format_event(update)
        await asyncio.sleep(STREAM_INTERVAL_SECONDS)


@router.get("/prices")
async def stream_prices(request: Request) -> StreamingResponse:
    """SSE endpoint: live prices for every tracked ticker (~500ms cadence)."""
    return StreamingResponse(
        _price_events(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering so events flush immediately.
            "X-Accel-Buffering": "no",
        },
    )
