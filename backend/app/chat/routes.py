"""Chat REST route (SPEC §9, agent-contract.md).

Thin HTTP layer over :mod:`app.chat.service`. One request → one complete JSON
response (no token streaming, per the contract). Transaction scope is owned by
the ``get_db`` dependency so a turn that books trades commits atomically.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends

from app.chat import service
from app.chat.models import ChatRequest, ChatResponse
from app.db.connection import get_db

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def post_chat(
    request: ChatRequest,
    conn: sqlite3.Connection = Depends(get_db),
) -> ChatResponse:
    """Send a message to the AI copilot; actions are auto-executed."""
    return service.handle_message(conn, request.message)
