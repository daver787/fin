"""Database layer: connection helpers, schema, and lazy initialization."""

from app.db.connection import connect, db_connection, get_db
from app.db.init import init_db

__all__ = ["connect", "db_connection", "get_db", "init_db"]
