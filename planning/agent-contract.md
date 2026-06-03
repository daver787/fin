# Agent Contract — Frontend / Backend Boundary

> The shared contract that lets the Frontend and Backend/Market-Data agents work
> independently. Keep this file in sync with [`SPEC.md`](../SPEC.md) §3, §8.

## The Boundary

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  frontend/  (Next.js, TS)   │        │  backend/  (FastAPI, uv)     │
│                             │        │                              │
│  - Static export            │  HTTP  │  - REST     /api/*           │
│  - Knows NO Python          │ ─────▶ │  - SSE      /api/stream/*    │
│  - Talks ONLY via /api/*    │  same  │  - Serves the static export  │
│                             │ origin │  - Owns DB, market data, LLM │
└─────────────────────────────┘        └──────────────────────────────┘
```

- **Same origin, one port (8000).** FastAPI serves the built frontend as static
  files and also hosts every `/api/*` route. There is **no CORS** to configure.
- **`frontend/`** is self-contained. It never imports backend code and knows
  nothing about Python, SQLite, or the LLM. Its only integration surface is the
  HTTP contract below.
- **`backend/`** is self-contained (`uv` project, own `pyproject.toml`). It owns
  database init/schema/seed, all API routes, SSE streaming, market data, and LLM
  integration. Internal structure is the backend agent's choice.
- Internal layout on each side is up to that side's agent. **Only the `/api/*`
  contract is binding** — neither side may change it unilaterally.

## The `/api/*` Contract

All endpoints are same-origin. Request/response bodies are JSON unless noted.

### Market Data (SSE)
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/stream/prices` | SSE stream. Each event: `{ticker, price, prev_price, timestamp, direction}`. Client uses native `EventSource` (auto-reconnect). ~500ms cadence. |

### Portfolio
| Method | Path | Body / Notes |
|--------|------|--------------|
| GET | `/api/portfolio` | Returns positions, cash balance, total value, unrealized P&L. |
| POST | `/api/portfolio/trade` | `{ticker, quantity, side}` where `side` ∈ `"buy"`/`"sell"`. Market order, instant fill. Validates cash (buy) / shares (sell). |
| GET | `/api/portfolio/history` | Portfolio value snapshots over time (P&L chart). |

### Watchlist
| Method | Path | Body / Notes |
|--------|------|--------------|
| GET | `/api/watchlist` | Watchlist tickers with latest prices. |
| POST | `/api/watchlist` | `{ticker}` — add a ticker. |
| DELETE | `/api/watchlist/{ticker}` | Remove a ticker. |

### Chat
| Method | Path | Body / Notes |
|--------|------|--------------|
| POST | `/api/chat` | `{message}` -> complete JSON response `{message, trades[], watchlist_changes[]}`. Backend auto-executes returned actions. No token streaming. |

### System
| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | Health check for Docker/deployment. |

## LLM Structured-Output Shape (backend-internal, surfaced via `/api/chat`)

```json
{
  "message": "Conversational response shown to the user",
  "trades": [{ "ticker": "AAPL", "side": "buy", "quantity": 10 }],
  "watchlist_changes": [{ "ticker": "PYPL", "action": "add" }]
}
```

- `message` is required; `trades` and `watchlist_changes` are optional arrays.
- Each trade is validated like a manual trade; failures are reported back in the
  chat response so the assistant can explain them to the user.

## Ground Rules for Agents

1. **Do not break the contract above.** If an endpoint must change, update this
   file and `SPEC.md §8` in the same change, and flag the other side.
2. **Frontend talks only to `/api/*`** — never assume a separate backend origin.
3. **Backend owns all persistence and external calls** (DB, market data, LLM).
4. **Environment drives behavior**: `MASSIVE_API_KEY` (real vs. simulated data)
   and `LLM_MOCK` (mock vs. real LLM). See [`.env.example`](../.env.example).
5. **Single-user for now**, but every DB table carries `user_id` (default
   `"default"`) so multi-user is a non-breaking future change.
