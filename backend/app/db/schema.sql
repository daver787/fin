-- FinAlly database schema (SPEC §7).
-- All tables carry a user_id (hardcoded "default" for now) so the single-user
-- model can grow into multi-user without a migration. All timestamps are
-- ISO-8601 TEXT. IDs are UUID strings except users_profile.id which is the
-- user key itself ("default").

-- User state: cash balance.
CREATE TABLE IF NOT EXISTS users_profile (
    id           TEXT PRIMARY KEY,                 -- default: "default"
    cash_balance REAL NOT NULL DEFAULT 10000.0,
    created_at   TEXT NOT NULL                     -- ISO timestamp
);

-- Tickers the user is watching.
CREATE TABLE IF NOT EXISTS watchlist (
    id       TEXT PRIMARY KEY,                     -- UUID
    user_id  TEXT NOT NULL DEFAULT 'default',
    ticker   TEXT NOT NULL,
    added_at TEXT NOT NULL,                        -- ISO timestamp
    UNIQUE (user_id, ticker)
);

-- Current holdings: one row per ticker per user.
CREATE TABLE IF NOT EXISTS positions (
    id         TEXT PRIMARY KEY,                   -- UUID
    user_id    TEXT NOT NULL DEFAULT 'default',
    ticker     TEXT NOT NULL,
    quantity   REAL NOT NULL,                      -- fractional shares supported
    avg_cost   REAL NOT NULL,
    updated_at TEXT NOT NULL,                      -- ISO timestamp
    UNIQUE (user_id, ticker)
);

-- Trade history: append-only log.
CREATE TABLE IF NOT EXISTS trades (
    id          TEXT PRIMARY KEY,                  -- UUID
    user_id     TEXT NOT NULL DEFAULT 'default',
    ticker      TEXT NOT NULL,
    side        TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity    REAL NOT NULL,                     -- fractional shares supported
    price       REAL NOT NULL,
    executed_at TEXT NOT NULL                      -- ISO timestamp
);

-- Portfolio value over time (P&L chart). Recorded every ~30s and after trades.
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id          TEXT PRIMARY KEY,                  -- UUID
    user_id     TEXT NOT NULL DEFAULT 'default',
    total_value REAL NOT NULL,
    recorded_at TEXT NOT NULL                      -- ISO timestamp
);

-- Conversation history with the LLM.
CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,                   -- UUID
    user_id    TEXT NOT NULL DEFAULT 'default',
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content    TEXT NOT NULL,
    actions    TEXT,                               -- JSON; null for user messages
    created_at TEXT NOT NULL                       -- ISO timestamp
);

-- Helpful indexes for the read patterns downstream code uses.
CREATE INDEX IF NOT EXISTS idx_trades_user_time
    ON trades (user_id, executed_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_time
    ON portfolio_snapshots (user_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_chat_user_time
    ON chat_messages (user_id, created_at);
