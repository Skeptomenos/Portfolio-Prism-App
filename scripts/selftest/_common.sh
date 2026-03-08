#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.tmp/selftest"
UV_CACHE_DIR="$ROOT_DIR/.tmp/uv-cache"
ENV_FILE="$ROOT_DIR/.env"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:1420}"
ENGINE_URL="${ENGINE_URL:-http://127.0.0.1:5001/health}"
OUTPUT_SMOKE_DIR="${OUTPUT_SMOKE_DIR:-$ROOT_DIR/output/playwright/smoke}"
OUTPUT_DOGFOOD_DIR="${OUTPUT_DOGFOOD_DIR:-$ROOT_DIR/output/playwright/dogfood}"
FRONTEND_PID_FILE="$RUNTIME_DIR/frontend.pid"
ENGINE_PID_FILE="$RUNTIME_DIR/engine.pid"
FRONTEND_LOG="$RUNTIME_DIR/frontend.log"
ENGINE_LOG="$RUNTIME_DIR/engine.log"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-120}"

mkdir -p "$RUNTIME_DIR"
mkdir -p "$UV_CACHE_DIR"

is_pid_running() {
  local pid_file="$1"
  if [[ ! -f "$pid_file" ]]; then
    return 1
  fi

  local pid
  pid="$(cat "$pid_file")"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local timeout="$3"
  local started_at
  started_at="$(date +%s)"

  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$name ready: $url"
      return 0
    fi

    if (( "$(date +%s)" - started_at >= timeout )); then
      echo "$name failed to become ready within ${timeout}s: $url" >&2
      return 1
    fi

    sleep 1
  done
}

start_process() {
  local name="$1"
  local pid_file="$2"
  local log_file="$3"
  shift 3

  if is_pid_running "$pid_file"; then
    echo "$name already running (pid $(cat "$pid_file"))"
    return 0
  fi

  echo "Starting $name..."
  (
    cd "$ROOT_DIR"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
}

stop_from_pid_file() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name pid file not found"
    return 0
  fi

  local pid
  pid="$(cat "$pid_file")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $name (pid $pid)"
    kill "$pid"
  else
    echo "$name not running"
  fi

  rm -f "$pid_file"
}

require_prereqs() {
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    echo "Missing node_modules in $ROOT_DIR. Run 'pnpm install' first." >&2
    exit 1
  fi

  if [[ ! -d "$ROOT_DIR/src-tauri/python/.venv" ]]; then
    echo "Missing Python virtualenv in $ROOT_DIR/src-tauri/python/.venv. Run 'cd src-tauri/python && uv sync' first." >&2
    exit 1
  fi

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Missing $ENV_FILE. Copy .env.example to .env and set VITE_ECHO_BRIDGE_TOKEN and PRISM_ECHO_TOKEN." >&2
    exit 1
  fi
}

load_env() {
  set -a
  source "$ENV_FILE"
  set +a

  if [[ -z "${VITE_ECHO_BRIDGE_TOKEN:-}" || -z "${PRISM_ECHO_TOKEN:-}" ]]; then
    echo "VITE_ECHO_BRIDGE_TOKEN and PRISM_ECHO_TOKEN must both be set in $ENV_FILE." >&2
    exit 1
  fi
}

default_prism_data_dir() {
  printf '%s\n' "${PRISM_DATA_DIR:-$HOME/Library/Application Support/PortfolioPrism}"
}

ensure_empty_dir() {
  local dir="$1"
  local force="${2:-0}"

  if [[ -e "$dir" && ! -d "$dir" ]]; then
    echo "Target exists and is not a directory: $dir" >&2
    exit 1
  fi

  if [[ -d "$dir" ]] && [[ -n "$(ls -A "$dir" 2>/dev/null)" ]]; then
    if [[ "$force" == "1" ]]; then
      rm -rf "$dir"
    else
      echo "Target directory is not empty: $dir (pass --force to replace it)" >&2
      exit 1
    fi
  fi

  mkdir -p "$dir"
}
