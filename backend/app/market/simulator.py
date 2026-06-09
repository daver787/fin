"""In-process geometric Brownian motion price simulator (SPEC §6).

The default market-data source. Evolves each ticker with GBM using per-ticker
drift and volatility, ties tickers together through a shared market factor so
they move in a correlated way, and occasionally fires a 2-5% "event" shock on a
ticker for drama. No external dependencies — just :mod:`random` and :mod:`math`.

Time is accelerated for visible movement: each ~500ms tick advances one
simulated 5-minute trading bar, so a watchlist visibly drifts over seconds
rather than years while the GBM math stays correct.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from app.market.base import MarketDataSource
from app.portfolio.prices import SEED_PRICES

# 252 trading days × 78 five-minute bars per 6.5h session. Each fetch advances
# one bar, so ``dt`` is one bar expressed as a fraction of a trading year.
BARS_PER_YEAR = 252 * 78
STEP_DT = 1.0 / BARS_PER_YEAR

# Per-ticker per-step probability of a sudden "event" move, and its size range.
EVENT_PROBABILITY = 0.01
EVENT_MIN_PCT = 0.02
EVENT_MAX_PCT = 0.05

# Floor so a price can never go non-positive (GBM keeps it positive, events too).
MIN_PRICE = 0.01

# Seed price for tickers without a known starting value (user-added symbols).
DEFAULT_SEED_PRICE = 100.0


@dataclass(frozen=True)
class TickerProfile:
    """Annualized GBM parameters and market coupling for one ticker.

    ``correlation`` in [0, 1] is the share of each step's randomness drawn from
    the shared market factor; the remainder is idiosyncratic. High-correlation
    names (mega-cap tech) move together; lower-correlation names drift more on
    their own.
    """

    drift: float
    volatility: float
    correlation: float


# Plausible annualized drift/vol and market correlation per default-watchlist
# ticker. Tech names carry higher vol and correlation; JPM/V are steadier.
PROFILES: dict[str, TickerProfile] = {
    "AAPL": TickerProfile(drift=0.12, volatility=0.26, correlation=0.70),
    "GOOGL": TickerProfile(drift=0.11, volatility=0.30, correlation=0.70),
    "MSFT": TickerProfile(drift=0.13, volatility=0.25, correlation=0.70),
    "AMZN": TickerProfile(drift=0.10, volatility=0.33, correlation=0.65),
    "TSLA": TickerProfile(drift=0.08, volatility=0.60, correlation=0.55),
    "NVDA": TickerProfile(drift=0.20, volatility=0.50, correlation=0.60),
    "META": TickerProfile(drift=0.12, volatility=0.38, correlation=0.60),
    "JPM": TickerProfile(drift=0.07, volatility=0.22, correlation=0.45),
    "V": TickerProfile(drift=0.09, volatility=0.20, correlation=0.45),
    "NFLX": TickerProfile(drift=0.10, volatility=0.40, correlation=0.50),
}

# Default for tickers without an explicit profile (moderate, market-coupled).
DEFAULT_PROFILE = TickerProfile(drift=0.08, volatility=0.35, correlation=0.55)


def profile_for(ticker: str) -> TickerProfile:
    """Return the GBM profile for ``ticker`` (a sane default if unknown)."""
    return PROFILES.get(ticker.upper(), DEFAULT_PROFILE)


def seed_price_for(ticker: str) -> float:
    """Return the starting price for ``ticker`` (a default if unknown)."""
    return SEED_PRICES.get(ticker.upper(), DEFAULT_SEED_PRICE)


def gbm_step(price: float, drift: float, volatility: float, dt: float, shock: float) -> float:
    """Advance ``price`` one GBM step.

    Pure and deterministic given ``shock`` (a standard-normal draw), which makes
    the core math unit-testable. Implements the exact GBM solution

        S_{t+dt} = S_t · exp((μ − ½σ²)·dt + σ·√dt·Z)

    with μ=``drift``, σ=``volatility``, Z=``shock``.
    """
    drift_term = (drift - 0.5 * volatility**2) * dt
    diffusion_term = volatility * math.sqrt(dt) * shock
    return price * math.exp(drift_term + diffusion_term)


class GBMSimulator(MarketDataSource):
    """Correlated multi-ticker GBM price source (the default market data feed).

    Holds the current price for each tracked ticker and advances them all by one
    step per :meth:`fetch`. Each step draws one shared market factor plus a
    per-ticker idiosyncratic shock, blends them by the ticker's ``correlation``
    so names move together, and occasionally applies an event shock.

    An optional ``rng`` (seeded :class:`random.Random`) makes runs fully
    reproducible for tests.
    """

    def __init__(
        self,
        tickers: list[str],
        *,
        interval: float = 0.5,
        dt: float = STEP_DT,
        rng: random.Random | None = None,
    ) -> None:
        self._interval = interval
        self._dt = dt
        self._rng = rng or random.Random()
        self._prices: dict[str, float] = {}
        for ticker in tickers:
            self.add_ticker(ticker)

    @property
    def poll_interval(self) -> float:
        return self._interval

    @property
    def tickers(self) -> list[str]:
        return list(self._prices)

    @property
    def prices(self) -> dict[str, float]:
        """A copy of the current price for every tracked ticker."""
        return dict(self._prices)

    def add_ticker(self, ticker: str) -> None:
        symbol = ticker.strip().upper()
        if symbol and symbol not in self._prices:
            self._prices[symbol] = seed_price_for(symbol)

    def step(self) -> dict[str, float]:
        """Advance every ticker one GBM step and return the new prices.

        Draws a single market factor shared across all tickers, then for each
        ticker blends it with an idiosyncratic draw weighted by the ticker's
        market correlation (so the combined shock keeps unit variance), applies
        one GBM step, and may add a 2-5% event shock.
        """
        market_z = self._rng.gauss(0.0, 1.0)
        for symbol, price in self._prices.items():
            prof = profile_for(symbol)
            idio_z = self._rng.gauss(0.0, 1.0)
            # Correlated draw with unit variance: ρ from the market factor,
            # (1−ρ) from the idiosyncratic factor.
            shock = math.sqrt(prof.correlation) * market_z + math.sqrt(
                1.0 - prof.correlation
            ) * idio_z

            new_price = gbm_step(price, prof.drift, prof.volatility, self._dt, shock)
            new_price = self._maybe_event_shock(new_price)
            self._prices[symbol] = round(max(new_price, MIN_PRICE), 2)
        return self.prices

    def _maybe_event_shock(self, price: float) -> float:
        """Occasionally apply a sudden 2-5% move (random direction)."""
        if self._rng.random() >= EVENT_PROBABILITY:
            return price
        magnitude = self._rng.uniform(EVENT_MIN_PCT, EVENT_MAX_PCT)
        sign = 1.0 if self._rng.random() < 0.5 else -1.0
        return price * (1.0 + sign * magnitude)

    async def fetch(self) -> dict[str, float]:
        return self.step()
