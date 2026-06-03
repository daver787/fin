# FinAlly — Project Plan

> Derived from [`SPEC.md`](../SPEC.md). This is the shared, working plan that
> coding agents reference while building FinAlly. When the spec and this plan
> disagree, the spec wins — update this plan to match.

## 1. What We're Building

FinAlly (Finance Ally) is an AI-powered trading workstation: a Bloomberg-style
dark terminal that streams live (simulated) market data, lets the user trade a
$10,000 virtual portfolio with instant market orders, and embeds an LLM chat
assistant that can analyze the portfolio and execute trades on the user's behalf.

It ships as a **single Docker container on a single port (8000)**:

- **Frontend** — Next.js + TypeScript, built as a static export, served by FastAPI.
- **Backend** — FastAPI (Python, managed with `uv`), owns all server logic.
- **Database** — SQLite at `db/finally.db`, lazily initialized and seeded.
- **Real-time** — Server-Sent Events (SSE) for one-way price push.
- **AI** — LiteLLM -> OpenRouter (`openrouter/openai/gpt-oss-120b`, Cerebras),
  structured outputs for trade execution.
- **Market data** — built-in simulator by default; Massive API if a key is set.

## 2. Repository Layout

```
finally/
├── frontend/      Next.js TypeScript project (static export)
├── backend/       FastAPI uv project (own pyproject.toml)
│   └── db/        Schema SQL, seed data, lazy-init logic
├── planning/      Shared agent documentation (this file + agent-contract.md)
├── scripts/       start/stop scripts (mac + windows)
├── test/          Playwright E2E tests + docker-compose.test.yml
├── db/            Runtime volume mount target (finally.db lives here, gitignored)
├── Dockerfile     Multi-stage build (Node -> Python)
├── docker-compose.yml
├── .env           Gitignored; .env.example is committed
└── .gitignore
```

The boundary between `frontend/`, `backend/`, and the `/api/*` contract is
described in [`agent-contract.md`](./agent-contract.md).

## 3. Build Phases

This plan is sequenced so agents can work in parallel where dependencies allow.

### Phase 0 — Scaffolding (this bead)
- Root `.gitignore`, `.env.example`, `db/.gitkeep`, `planning/` docs, `README.md`.
- No code dependencies; unblocks everything else.

### Phase 1 — Backend foundation
- `backend/` uv project with `pyproject.toml`.
- SQLite schema + lazy init + seed data (see SPEC §7).
- `/api/health` endpoint.

### Phase 2 — Market data
- Abstract market-data interface with two implementations: GBM **simulator**
  (default) and **Massive** REST poller.
- Shared in-memory price cache (latest, previous, timestamp per ticker).
- `GET /api/stream/prices` SSE endpoint reading from the cache (~500ms cadence).

### Phase 3 — Portfolio + trading
- `GET /api/portfolio`, `POST /api/portfolio/trade`, `GET /api/portfolio/history`.
- Trade execution + P&L math; portfolio snapshots every 30s and after each trade.

### Phase 4 — Watchlist
- `GET /api/watchlist`, `POST /api/watchlist`, `DELETE /api/watchlist/{ticker}`.

### Phase 5 — LLM chat
- `POST /api/chat`: build portfolio context + history, call LLM with structured
  output, auto-execute returned trades/watchlist changes, persist messages.
- `LLM_MOCK=true` deterministic mock path for tests.

### Phase 6 — Frontend
- Watchlist (flashing prices + sparklines), main chart, portfolio heatmap,
  P&L chart, positions table, trade bar, AI chat panel, header status.
- `EventSource` SSE consumer; Tailwind dark theme; same-origin `/api/*` calls.

### Phase 7 — Packaging
- Multi-stage `Dockerfile` (Node build -> Python runtime serving static export).
- `scripts/start_*`/`stop_*`, optional `docker-compose.yml`.

### Phase 8 — Testing
- Backend pytest, frontend component tests, Playwright E2E in `test/`
  (`docker-compose.test.yml`, `LLM_MOCK=true`).

## 4. Key Contracts (do not break)

- **Single origin**: all browser calls go to `/api/*` and `/api/stream/*` — no CORS.
- **Env-driven data source**: `MASSIVE_API_KEY` selects real vs. simulated data;
  `LLM_MOCK` selects mock vs. real LLM. See SPEC §5 and `.env.example`.
- **Schema is multi-user-ready**: every table carries `user_id` (default `"default"`).
- **Market orders only**: instant fill at current price, no fees, no confirmation.
- **Lazy DB init**: backend creates + seeds the database on first use; no migration step.

## 5. Definition of Done (project level)

- `docker run` (or `scripts/start_*`) brings up the app at `http://localhost:8000`.
- Default watchlist streams prices; $10k balance; trades adjust cash + positions.
- AI chat (mocked and live) returns structured responses and executes trades.
- Backend, frontend, and E2E test suites pass.

## 6. References

- Full specification: [`SPEC.md`](../SPEC.md)
- Frontend/backend boundary + `/api/*` contract: [`agent-contract.md`](./agent-contract.md)
