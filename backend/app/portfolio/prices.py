"""Current-price resolution for trade fills and P&L (SPEC §6 / §8).

Trades fill at the *current market price*. The authoritative source is the
in-memory price cache fed by the market-data background task (SPEC §6). To keep
the portfolio layer decoupled from — and independently testable without — the
market-data implementation, prices are resolved through a pluggable provider:

    market-data layer  --set_price_provider(fn)-->  get_current_price(ticker)

The market-data startup wiring registers a provider that reads the live cache.
When no provider is registered (unit tests, or before the market task has
started), a deterministic seed price keeps the API functional. Seed prices match
the realistic starting values in SPEC §6.
"""

from __future__ import annotations

from collections.abc import Callable

# A provider maps a (normalized, upper-case) ticker to its latest price, or
# ``None`` when the price is unknown.
PriceProvider = Callable[[str], "float | None"]

_provider: PriceProvider | None = None

# Realistic seed prices for the default watchlist (SPEC §6). Used as a fallback
# only; live prices come from the registered provider once the market task runs.
SEED_PRICES: dict[str, float] = {
    "AAPL": 190.0,
    "GOOGL": 175.0,
    "MSFT": 430.0,
    "AMZN": 185.0,
    "TSLA": 250.0,
    "NVDA": 120.0,
    "META": 500.0,
    "JPM": 200.0,
    "V": 280.0,
    "NFLX": 630.0,
}

# Fallback for tickers without a known seed (e.g. user-added symbols before the
# market layer has a price). A sane non-zero default keeps P&L math well-defined.
_FALLBACK_PRICE = 100.0


def set_price_provider(provider: PriceProvider | None) -> None:
    """Register the live price source (called by the market-data startup)."""
    global _provider
    _provider = provider


def get_current_price(ticker: str) -> float:
    """Resolve the current price for ``ticker``.

    Tries the registered live provider first; if it is absent or has no price
    for the ticker, falls back to the deterministic seed price. Always returns a
    usable float so trades and P&L never fail purely for lack of a quote.
    """
    symbol = ticker.strip().upper()
    if _provider is not None:
        try:
            price = _provider(symbol)
        except Exception:
            price = None
        if price is not None:
            return float(price)
    return SEED_PRICES.get(symbol, _FALLBACK_PRICE)
