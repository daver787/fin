#!/usr/bin/env bash
# Stop and remove the FinAlly container (macOS/Linux). The DB volume is kept so
# data persists; remove it with `docker volume rm finally-db` to start fresh.
set -euo pipefail

NAME="finally"

if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  echo "==> Stopping and removing container '$NAME'..."
  docker rm -f "$NAME" >/dev/null
  echo "Stopped. (Data volume 'finally-db' preserved.)"
else
  echo "No '$NAME' container is running."
fi
