# FinAlly — AI Trading Workstation

FinAlly (Finance Ally) is a visually rich, AI-powered trading workstation: a
Bloomberg-style dark terminal that streams live (simulated) market data, lets you
trade a $10,000 virtual portfolio with instant market orders, and embeds an LLM
chat assistant that can analyze your positions and execute trades on your behalf.

It runs as a **single Docker container on a single port (8000)** — a FastAPI
backend that serves a statically-exported Next.js frontend and all `/api/*`
routes, backed by SQLite and real-time price updates over Server-Sent Events.

> Built entirely by orchestrated AI coding agents as the capstone of an agentic
> AI coding course. See [`SPEC.md`](./SPEC.md) for the full specification and
> [`planning/PLAN.md`](./planning/PLAN.md) for the working build plan.

## Quick Start

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY (required for AI chat).
# MASSIVE_API_KEY is optional — leave empty to use the built-in simulator.
```

### 2. Run with the start script

```bash
# macOS / Linux
./scripts/start_mac.sh

# Windows (PowerShell)
./scripts/start_windows.ps1
```

Then open <http://localhost:8000>. No login, no signup — you land straight in the
terminal with a 10-ticker watchlist, $10,000 in virtual cash, and live prices.

To stop:

```bash
./scripts/stop_mac.sh        # macOS / Linux
./scripts/stop_windows.ps1   # Windows
```

### Run with Docker directly

```bash
docker build -t finally .
docker run -v finally-data:/app/db -p 8000:8000 --env-file .env finally
```

The named volume `finally-data` persists the SQLite database (`db/finally.db`)
across container restarts.

## What You Can Do

- Watch 10 default tickers stream live, flashing green/red on each tick.
- Click a ticker for a detailed chart; view sparklines, a portfolio heatmap,
  a P&L chart, and a positions table.
- Buy and sell shares — market orders, instant fill, no fees.
- Chat with the **FinAlly** AI assistant to analyze your portfolio, get trade
  ideas, and have it execute trades and manage your watchlist in natural language.

## Configuration

All configuration is via environment variables (see [`.env.example`](./.env.example)):

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENROUTER_API_KEY` | Yes | LLM chat via OpenRouter (Cerebras inference). |
| `MASSIVE_API_KEY` | No | Real market data via Massive; empty = built-in simulator. |
| `LLM_MOCK` | No | `true` = deterministic mock LLM responses (testing/CI). |

## Project Layout

```
frontend/   Next.js + TypeScript (static export)
backend/    FastAPI (uv) — API, SSE, DB, market data, LLM
planning/   Shared agent docs (PLAN.md, agent-contract.md)
scripts/    start/stop scripts (mac + windows)
test/       Playwright E2E tests
db/         Runtime SQLite volume mount (finally.db is gitignored)
```

## Architecture & Contracts

- **Single origin, one port** — the frontend talks only to `/api/*` and
  `/api/stream/*`; no CORS.
- **SSE for real-time** — `GET /api/stream/prices` pushes price updates.
- **Lazy SQLite init** — the backend creates and seeds the database on first use.
- **Env-driven data/LLM source** — simulator vs. Massive, mock vs. real LLM.

The frontend/backend boundary and the full `/api/*` contract are documented in
[`planning/agent-contract.md`](./planning/agent-contract.md).

## Documentation

- [`SPEC.md`](./SPEC.md) — full project specification
- [`planning/PLAN.md`](./planning/PLAN.md) — build plan and phases
- [`planning/agent-contract.md`](./planning/agent-contract.md) — frontend/backend contract
