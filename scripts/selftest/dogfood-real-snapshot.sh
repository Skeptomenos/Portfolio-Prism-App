#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/selftest/dogfood-real-snapshot.sh --snapshot-dir <private-dir> [--target-data-dir <temp-dir>] [--artifact-dir <dir>] [--force]

Replays a recorded snapshot, boots the app against that replay data, runs the Playwright smoke gate,
and fails on targeted backpressure errors.

Options:
  --snapshot-dir <dir>    Required snapshot directory to replay.
  --target-data-dir <dir> Optional replay target directory. Defaults to a temp dir under .tmp/selftest.
  --artifact-dir <dir>    Optional artifact directory. Defaults to output/playwright/dogfood.
  --force                 Replace a non-empty explicit target directory.
  --help                  Show this help text.
EOF
}

SNAPSHOT_DIR=""
TARGET_DATA_DIR=""
ARTIFACT_DIR="${ARTIFACT_DIR:-$OUTPUT_DOGFOOD_DIR}"
FORCE=0
DEV_UP_CMD="${SELFTEST_DEV_UP_CMD:-$ROOT_DIR/scripts/selftest/dev-up.sh}"
PLAYWRIGHT_CMD="${SELFTEST_PLAYWRIGHT_CMD:-pnpm exec playwright test tests/e2e/selftest-smoke.spec.ts --reporter=line}"
BACKPRESSURE_PATTERN="${BACKPRESSURE_PATTERN:-IPCValidationError|IPC validation failed|contract drift}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot-dir)
      SNAPSHOT_DIR="${2:-}"
      shift 2
      ;;
    --target-data-dir)
      TARGET_DATA_DIR="${2:-}"
      shift 2
      ;;
    --artifact-dir)
      ARTIFACT_DIR="${2:-}"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SNAPSHOT_DIR" ]]; then
  echo "--snapshot-dir is required" >&2
  usage >&2
  exit 1
fi

mkdir -p "$ARTIFACT_DIR"

replay_args=(--snapshot-dir "$SNAPSHOT_DIR")
if [[ -n "$TARGET_DATA_DIR" ]]; then
  replay_args+=(--target-data-dir "$TARGET_DATA_DIR")
fi
if (( FORCE == 1 )); then
  replay_args+=(--force)
fi

replay_output="$($ROOT_DIR/scripts/selftest/replay-sync-snapshot.sh "${replay_args[@]}")"
printf '%s\n' "$replay_output" >"$ARTIFACT_DIR/replay.log"

if [[ -z "$TARGET_DATA_DIR" ]]; then
  TARGET_DATA_DIR="$(printf '%s\n' "$replay_output" | grep '^replay_data_dir=' | cut -d= -f2-)"
fi

if [[ -z "$TARGET_DATA_DIR" ]]; then
  echo "Failed to determine replay data dir" >&2
  exit 1
fi

env \
  PRISM_DATA_DIR="$TARGET_DATA_DIR" \
  RUNTIME_DIR="$RUNTIME_DIR" \
  ENGINE_LOG="$ENGINE_LOG" \
  FRONTEND_LOG="$FRONTEND_LOG" \
  UV_CACHE_DIR="$UV_CACHE_DIR" \
  "$DEV_UP_CMD"

env PRISM_DATA_DIR="$TARGET_DATA_DIR" bash -c "$PLAYWRIGHT_CMD" >"$ARTIFACT_DIR/playwright.log" 2>&1

if [[ -f "$FRONTEND_LOG" ]]; then
  cp "$FRONTEND_LOG" "$ARTIFACT_DIR/frontend.log"
fi

if [[ -f "$ENGINE_LOG" ]]; then
  cp "$ENGINE_LOG" "$ARTIFACT_DIR/engine.log"
fi

match_file="$ARTIFACT_DIR/backpressure-matches.log"
: >"$match_file"

for candidate in "$ARTIFACT_DIR/playwright.log" "$FRONTEND_LOG" "$ENGINE_LOG"; do
  if [[ -f "$candidate" ]]; then
    grep -nE "$BACKPRESSURE_PATTERN" "$candidate" >>"$match_file" || true
  fi
done

if [[ -s "$match_file" ]]; then
  echo "Targeted backpressure failures detected. See $match_file" >&2
  exit 1
fi

echo "artifact_dir=$ARTIFACT_DIR"
echo "replay_data_dir=$TARGET_DATA_DIR"
