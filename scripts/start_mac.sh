#!/usr/bin/env bash
# Build and launch FinAlly in a single Docker container (macOS/Linux).
# Usage: ./scripts/start_mac.sh
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="finally:latest"
NAME="finally"
PORT="8000"

echo "==> Building $IMAGE (first run may take a few minutes)..."
docker build -t "$IMAGE" .

# Replace any previous container so the script is re-runnable.
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "==> Removing existing container..."
  docker rm -f "$NAME" >/dev/null
fi

ENV_ARGS=()
if [[ -f .env ]]; then
  echo "==> Loading environment from .env"
  ENV_ARGS=(--env-file .env)
fi

echo "==> Starting container on http://localhost:$PORT ..."
docker run -d \
  --name "$NAME" \
  -p "$PORT:8000" \
  -v finally-db:/app/db \
  "${ENV_ARGS[@]}" \
  "$IMAGE" >/dev/null

# Wait for the health endpoint before opening the browser.
echo -n "==> Waiting for the API to come up"
for _ in $(seq 1 30); do
  if curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
    echo " — ready."
    open "http://localhost:$PORT" 2>/dev/null || true
    echo "FinAlly is running at http://localhost:$PORT"
    echo "Stop it with ./scripts/stop_mac.sh"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo
echo "API did not become healthy in time. Recent logs:" >&2
docker logs --tail 40 "$NAME" >&2
exit 1
