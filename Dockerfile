# FinAlly — single-container build (SPEC §3, §11).
#
# Stage 1 builds the Next.js static export with Node. Stage 2 is a slim Python
# runtime (uv) that serves both the static frontend and the FastAPI API on one
# port (8000). One image, one command, one port — no orchestration.

# ---- Stage 1: build the Next.js static export -> frontend/out ----
FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python runtime (FastAPI + static export) ----
FROM python:3.12-slim AS runtime

# uv: fast, reproducible Python installs (SPEC §3).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app/backend

# Install dependencies first (cached layer) using the frozen lockfile.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Application code, then install the project itself.
COPY backend/ ./
RUN uv sync --frozen --no-dev

# The built frontend, served by FastAPI from /app/frontend/out (resolved by
# app.main relative to the backend package).
COPY --from=frontend /build/frontend/out /app/frontend/out

# Runtime SQLite volume (db/finally.db persists across restarts, SPEC §7).
RUN mkdir -p /app/db
VOLUME ["/app/db"]

EXPOSE 8000

CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
