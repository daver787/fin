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
    # When true, the chat backend returns deterministic mock responses.
    llm_mock: bool = False

    # --- Market data (SPEC §6) ---
    # If set and non-empty, the Massive API is used; otherwise the simulator.
    massive_api_key: str = ""

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


# Shared singleton — import this everywhere config is needed.
settings = Settings()
