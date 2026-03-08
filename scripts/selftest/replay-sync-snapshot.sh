#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/selftest/replay-sync-snapshot.sh --snapshot-dir <private-dir> [--target-data-dir <temp-dir>] [--force]

Copies a previously recorded snapshot into an isolated PRISM_DATA_DIR target for replay.

Options:
  --snapshot-dir <dir>    Required snapshot directory to replay.
  --target-data-dir <dir> Optional replay target directory. Defaults to a temp dir under .tmp/selftest.
  --force                 Replace a non-empty explicit target directory.
  --help                  Show this help text.
EOF
}

SNAPSHOT_DIR=""
TARGET_DATA_DIR=""
FORCE=0

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

if [[ ! -d "$SNAPSHOT_DIR" ]]; then
  echo "Snapshot directory does not exist: $SNAPSHOT_DIR" >&2
  exit 1
fi

if [[ ! -f "$SNAPSHOT_DIR/prism.db" ]]; then
  echo "Snapshot directory does not contain prism.db: $SNAPSHOT_DIR" >&2
  exit 1
fi

if [[ -z "$TARGET_DATA_DIR" ]]; then
  mkdir -p "$RUNTIME_DIR"
  TARGET_DATA_DIR="$(mktemp -d "$RUNTIME_DIR/replay-data.XXXXXX")"
else
  ensure_empty_dir "$TARGET_DATA_DIR" "$FORCE"
fi

cp -R "$SNAPSHOT_DIR"/. "$TARGET_DATA_DIR"/

SNAPSHOT_DIR="$SNAPSHOT_DIR" TARGET_DATA_DIR="$TARGET_DATA_DIR" python3 - <<'PY' >"$TARGET_DATA_DIR/replay-metadata.json"
import json
import os
from datetime import datetime, timezone

print(json.dumps({
    "replayedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "snapshotDir": os.environ["SNAPSHOT_DIR"],
    "targetDataDir": os.environ["TARGET_DATA_DIR"],
}, indent=2))
PY

echo "replay_data_dir=$TARGET_DATA_DIR"
echo "snapshot_dir=$SNAPSHOT_DIR"
