"""SSE price-stream tests.

The endpoint is an infinite generator, which deadlocks the in-process
``TestClient`` (it wants to buffer the whole response). So we drive the event
generator directly with a fake request and assert the SSE frame shape — the same
code path the route uses, without the harness limitation.
"""

from __future__ import annotations

import asyncio
import json

from app.market import get_cache
from app.market.base import PriceUpdate
from app.stream.routes import _format_event, _price_events


class _FakeRequest:
    """Request stub: connected for ``alive`` checks, then disconnected."""

    def __init__(self, alive: int = 1) -> None:
        self._checks = 0
        self._alive = alive

    async def is_disconnected(self) -> bool:
        self._checks += 1
        return self._checks > self._alive


def test_format_event_shape():
    update = PriceUpdate(
        ticker="AAPL",
        price=191.0,
        previous_price=190.0,
        timestamp="2026-06-12T00:00:00+00:00",
        direction="up",
    )
    frame = _format_event(update)
    assert frame.startswith("data: ")
    assert frame.endswith("\n\n")
    payload = json.loads(frame[len("data: ") :].strip())
    assert payload == {
        "ticker": "AAPL",
        "price": 191.0,
        "prev_price": 190.0,
        "timestamp": "2026-06-12T00:00:00+00:00",
        "direction": "up",
    }


def test_price_events_emits_cached_snapshot():
    cache = get_cache()
    cache.clear()
    cache.update("AAPL", 190.0)
    cache.update("MSFT", 430.0)

    async def collect() -> list[str]:
        events: list[str] = []
        async for frame in _price_events(_FakeRequest(alive=1)):
            events.append(frame)
            if len(events) >= 2:
                break
        return events

    events = asyncio.run(collect())
    tickers = {json.loads(e[len("data: ") :].strip())["ticker"] for e in events}
    assert {"AAPL", "MSFT"} <= tickers
