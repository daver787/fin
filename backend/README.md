# FinAlly Backend

FastAPI backend for the FinAlly AI trading workstation. Self-contained `uv`
project that owns server logic: database initialization/schema/seed, REST API,
SSE streaming, market data, and LLM integration.

## Layout

```
backend/
├── pyproject.toml        # uv project definition + dependencies
├── app/
│   ├── main.py           # FastAPI app, lifespan (lazy DB init), /api/health
│   ├── config.py         # Settings: env loading (.env from project root)
│   └── db/
│       ├── connection.py # SQLite connection helpers + FastAPI dependency
│       ├── schema.sql    # Full schema DDL (SPEC §7)
│       └── init.py       # Lazy initialization + default seed data
└── tests/                # pytest unit tests
```

## Quick start

```bash
cd backend
uv sync                                  # install deps into .venv
uv run uvicorn app.main:app --reload     # boots on http://localhost:8000
curl http://localhost:8000/api/health    # -> {"status":"ok"}
```

On first boot the backend lazily creates `db/finally.db` (relative to the
project root), builds the schema, and seeds the default user ($10,000 cash)
plus the 10 default watchlist tickers.

## Configuration

Environment variables (read from `.env` at the project root; see SPEC §5):

| Variable             | Default                | Purpose                                    |
|----------------------|------------------------|--------------------------------------------|
| `OPENROUTER_API_KEY` | `""`                   | LLM chat via OpenRouter                     |
| `MASSIVE_API_KEY`    | `""`                   | Real market data; empty → use simulator     |
| `LLM_MOCK`           | `false`                | Deterministic mock LLM responses (tests)    |
| `DATABASE_PATH`      | `<project>/db/finally.db` | SQLite file location                     |

## Tests

```bash
uv run pytest
```
