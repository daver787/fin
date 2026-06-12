"""LLM integration for the chat assistant (SPEC §9).

Two interchangeable paths produce the same structured result:

* **Real** — a single OpenRouter chat-completion call (JSON response format),
  routed to a fast model. Used when ``OPENROUTER_API_KEY`` is set and
  ``LLM_MOCK`` is not forced on.
* **Mock** — a deterministic intent parser that understands the common commands
  (buy/sell/add/remove, "how am I doing"). Used on first launch with no key, in
  tests, and when ``LLM_MOCK=true``.

Both return a raw dict shaped like ``ChatResponse`` (``message`` plus optional
``trades`` and ``watchlist_changes``). The service layer validates it, executes
the actions, and reports the outcome back to the user.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Map free-text verbs to the structured action vocabulary.
_BUY = re.compile(r"\b(buy|long|purchase|acquire)\b", re.IGNORECASE)
_SELL = re.compile(r"\b(sell|short|dump|offload|close)\b", re.IGNORECASE)
_ADD = re.compile(r"\b(add|watch|track|follow)\b", re.IGNORECASE)
_REMOVE = re.compile(r"\b(remove|unwatch|untrack|drop|delete)\b", re.IGNORECASE)
# "buy 10 AAPL", "sell 5 shares of tsla", "buy 3.5 nvda"
_TRADE_RE = re.compile(
    r"(?P<qty>\d+(?:\.\d+)?)\s+(?:shares?\s+(?:of\s+)?)?(?P<ticker>[A-Za-z]{1,8})",
)
_TICKER_RE = re.compile(r"\b(?P<ticker>[A-Za-z]{1,8})\b")

SYSTEM_PROMPT = """\
You are FinAlly's AI trading copilot inside a simulated trading workstation. \
The user trades a virtual portfolio (market orders only, instant fill, no fees). \
You can analyze their portfolio and execute actions on their behalf.

Respond with a SINGLE JSON object, no prose outside it, matching exactly:
{
  "message": "<conversational reply shown to the user>",
  "trades": [{"ticker": "AAPL", "side": "buy"|"sell", "quantity": <number>}],
  "watchlist_changes": [{"ticker": "PYPL", "action": "add"|"remove"}]
}

Rules:
- "message" is required. "trades" and "watchlist_changes" are optional; omit or \
use empty arrays when there is no action.
- Only include trades/watchlist_changes the user actually asked for. Never \
invent trades.
- Quantities are share counts (fractional allowed). Tickers are upper-case.
- Speak concisely and like a trading-desk professional. If you execute actions, \
say so in the message; the system applies them and will append the result.

Current account context:
{context}
"""


def _portfolio_context(context: dict[str, Any]) -> str:
    """Render the portfolio/watchlist context block for the system prompt."""
    cash = context.get("cash_balance", 0.0)
    total = context.get("total_value", 0.0)
    positions = context.get("positions", [])
    watchlist = context.get("watchlist", [])

    lines = [f"Cash: ${cash:,.2f}", f"Total value: ${total:,.2f}"]
    if positions:
        lines.append("Positions:")
        for p in positions:
            lines.append(
                f"  {p['ticker']}: {p['quantity']:g} @ ${p['avg_cost']:.2f} "
                f"(now ${p['current_price']:.2f}, P&L ${p['unrealized_pnl']:,.2f})"
            )
    else:
        lines.append("Positions: none")
    if watchlist:
        lines.append("Watchlist: " + ", ".join(watchlist))
    return "\n".join(lines)


def complete(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Produce a raw chat result dict for ``message`` given account ``context``.

    Dispatches to the mock parser or the real OpenRouter call. Any real-path
    failure falls back to the mock parser so chat never hard-fails.
    """
    if settings.use_mock_llm:
        return mock_complete(message, context)
    try:
        return _openrouter_complete(message, context)
    except Exception:
        logger.exception("OpenRouter call failed; falling back to mock parser")
        result = mock_complete(message, context)
        result["message"] = (
            "(AI service unavailable — used a local fallback) " + result["message"]
        )
        return result


def _openrouter_complete(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Single OpenRouter chat completion returning the structured JSON dict."""
    system = SYSTEM_PROMPT.replace("{context}", _portfolio_context(context))
    resp = httpx.post(
        f"{settings.openrouter_base_url.rstrip('/')}/chat/completions",
        headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
            # OpenRouter attribution headers (optional but recommended).
            "HTTP-Referer": "https://localhost:8000",
            "X-Title": "FinAlly",
        },
        json={
            "model": settings.openrouter_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": message},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.3,
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    data = json.loads(content)
    if not isinstance(data, dict) or "message" not in data:
        raise ValueError("LLM response missing required 'message' field")
    return data


# --------------------------------------------------------------------------- #
# Deterministic mock — no network, no key. Handles the common intents.
# --------------------------------------------------------------------------- #


def mock_complete(message: str, context: dict[str, Any]) -> dict[str, Any]:
    """Parse ``message`` into a structured result deterministically.

    Recognizes buy/sell with a quantity+ticker, watchlist add/remove, and
    portfolio-status questions. Anything else gets a helpful capabilities reply.
    """
    text = message.strip()

    # --- Trades: need a verb + quantity + ticker ---
    side: str | None = None
    if _BUY.search(text):
        side = "buy"
    elif _SELL.search(text):
        side = "sell"

    if side is not None:
        m = _TRADE_RE.search(text)
        if m:
            ticker = m.group("ticker").upper()
            qty = float(m.group("qty"))
            return {
                "message": f"Placing a market order to {side} {qty:g} {ticker}.",
                "trades": [{"ticker": ticker, "side": side, "quantity": qty}],
            }
        return {
            "message": (
                f"I can {side} for you — tell me how many shares and which "
                f"ticker, e.g. '{side} 10 AAPL'."
            )
        }

    # --- Watchlist add/remove ---
    if _ADD.search(text) and not _REMOVE.search(text):
        ticker = _extract_ticker(text)
        if ticker:
            return {
                "message": f"Adding {ticker} to your watchlist.",
                "watchlist_changes": [{"ticker": ticker, "action": "add"}],
            }
    if _REMOVE.search(text):
        ticker = _extract_ticker(text)
        if ticker:
            return {
                "message": f"Removing {ticker} from your watchlist.",
                "watchlist_changes": [{"ticker": ticker, "action": "remove"}],
            }

    # --- Portfolio status questions ---
    if re.search(r"\b(portfolio|position|holding|doing|p&l|pnl|profit|balance|cash)\b", text, re.IGNORECASE):
        return {"message": _portfolio_summary(context)}

    # --- Fallback: explain capabilities ---
    return {
        "message": (
            "I'm your trading copilot. I can buy or sell (e.g. 'buy 10 AAPL'), "
            "manage your watchlist ('add NVDA', 'remove V'), and summarize your "
            "portfolio. What would you like to do?"
        )
    }


# Common English words that look like tickers but aren't, so the watchlist
# parser doesn't grab them.
_STOPWORDS = {
    "ADD", "TO", "MY", "THE", "A", "AN", "WATCH", "LIST", "WATCHLIST", "FROM",
    "REMOVE", "TRACK", "FOLLOW", "UNWATCH", "DROP", "DELETE", "PLEASE", "AND",
    "OF", "ON", "IT", "ME", "FOR", "STOCK", "SHARES", "SHARE", "TICKER",
}


def _extract_ticker(text: str) -> str | None:
    """Pull the first plausible ticker symbol out of ``text``."""
    for m in _TICKER_RE.finditer(text):
        candidate = m.group("ticker").upper()
        if candidate not in _STOPWORDS:
            return candidate
    return None


def _portfolio_summary(context: dict[str, Any]) -> str:
    """A concise natural-language portfolio summary for the mock assistant."""
    cash = context.get("cash_balance", 0.0)
    total = context.get("total_value", 0.0)
    positions = context.get("positions", [])
    if not positions:
        return (
            f"You're holding ${cash:,.2f} in cash and no open positions — "
            f"total value ${total:,.2f}. Ready when you want to make a trade."
        )
    parts = [
        f"{p['ticker']} {p['quantity']:g} shares (P&L ${p['unrealized_pnl']:,.2f})"
        for p in positions
    ]
    return (
        f"Total value ${total:,.2f} (${cash:,.2f} cash). Positions: "
        + "; ".join(parts)
        + "."
    )
