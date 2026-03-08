#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

require_prereqs
load_env

if curl -fsS "$ENGINE_URL" >/dev/null 2>&1; then
  echo "Engine already healthy: $ENGINE_URL"
else
  start_process "engine" "$ENGINE_PID_FILE" "$ENGINE_LOG" env UV_CACHE_DIR="$UV_CACHE_DIR" pnpm dev:engine
fi

if curl -fsS "$FRONTEND_URL" >/dev/null 2>&1; then
  echo "Frontend already healthy: $FRONTEND_URL"
else
  start_process "frontend" "$FRONTEND_PID_FILE" "$FRONTEND_LOG" env TAURI_DEV_HOST=127.0.0.1 pnpm dev
fi

if ! wait_for_url "Engine" "$ENGINE_URL" "$STARTUP_TIMEOUT"; then
  tail -n 40 "$ENGINE_LOG" >&2 || true
  exit 1
fi

if ! wait_for_url "Frontend" "$FRONTEND_URL" "$STARTUP_TIMEOUT"; then
  tail -n 40 "$FRONTEND_LOG" >&2 || true
  exit 1
fi

echo "frontend_log=$FRONTEND_LOG"
echo "engine_log=$ENGINE_LOG"
