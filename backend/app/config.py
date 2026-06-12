"""Application settings and environment loading.

Settings are read from environment variables and from a ``.env`` file located
at the project root (the directory above ``backend/``). See SPEC §5.

Downstream modules should import the shared :data:`settings` instance rather
than reading ``os.environ`` directly, so configuration stays in one place.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> backend/app -> backend -> project root
BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# The top-level db/ directory is the Docker volume mount point (SPEC §4/§11).
DEFAULT_DB_PATH = PROJECT_ROOT / "db" / "finally.db"


class Settings(BaseSettings):
    """Runtime configuration sourced from the environment / project ``.env``."""

    # --- LLM (SPEC §9) ---
    openrouter_api_key: str = ""
    # When true, the chat backend returns deterministic mock responses. Mock
    # mode is also used automatically when no API key is configured, so the app
    # is fully functional on first launch without any secrets.
    llm_mock: bool = False
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    # Fast, capable default routed through OpenRouter (SPEC §9 — Cerebras for
    # fast inference). Override via OPENROUTER_MODEL.
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"

    # --- Market data (SPEC §6) ---
    # If set and non-empty, the Massive API is used; otherwise the simulator.
    massive_api_key: str = ""
    # When false, startup seeds the price cache with static seed prices but does
    # NOT launch the background feed that evolves them. Trades then fill at the
    # deterministic seed price — used by the test suite so route assertions are
    # exact (and available to anyone wanting a frozen market).
    market_data_live: bool = True

    # --- Testing ---
    # Exposes POST /api/test/reset to wipe + re-seed state for E2E isolation.
    # Off by default; enabled only by the test harness. Never enable in prod.
    enable_test_reset: bool = False

    # --- Database (SPEC §7) ---
    # SQLite file location. Defaults to <project_root>/db/finally.db so the
    # Docker volume mount at /app/db persists data across restarts.
    database_path: Path = DEFAULT_DB_PATH

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def use_massive(self) -> bool:
        """True when a non-empty Massive API key is configured."""
        return bool(self.massive_api_key.strip())

    @property
    def use_mock_llm(self) -> bool:
        """True when the chat backend should use deterministic mock responses.

        Explicitly via ``LLM_MOCK=true``, or implicitly when no OpenRouter key
        is configured (so the assistant still works without secrets).
        """
        return self.llm_mock or not self.openrouter_api_key.strip()


# Shared singleton — import this everywhere config is needed.
settings = Settings()
