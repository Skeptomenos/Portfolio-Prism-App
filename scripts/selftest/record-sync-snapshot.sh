#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

usage() {
  cat <<'EOF'
Usage: ./scripts/selftest/record-sync-snapshot.sh --snapshot-dir <private-dir> [--source-data-dir <data-dir>] [--force]

Copies the current Portfolio Prism data directory into a private snapshot directory for deterministic replay.

Options:
  --snapshot-dir <dir>    Required target snapshot directory.
  --source-data-dir <dir> Optional source data directory. Defaults to PRISM_DATA_DIR or the standard app data dir.
  --force                 Replace a non-empty target directory.
  --help                  Show this help text.
EOF
}

SNAPSHOT_DIR=""
SOURCE_DATA_DIR=""
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --snapshot-dir)
      SNAPSHOT_DIR="${2:-}"
      shift 2
      ;;
    --source-data-dir)
      SOURCE_DATA_DIR="${2:-}"
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

if [[ -z "$SOURCE_DATA_DIR" ]]; then
  SOURCE_DATA_DIR="$(default_prism_data_dir)"
fi

if [[ ! -d "$SOURCE_DATA_DIR" ]]; then
  echo "Source data directory does not exist: $SOURCE_DATA_DIR" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_DATA_DIR/prism.db" ]]; then
  echo "Source data directory does not contain prism.db: $SOURCE_DATA_DIR" >&2
  exit 1
fi

ensure_empty_dir "$SNAPSHOT_DIR" "$FORCE"
cp -R "$SOURCE_DATA_DIR"/. "$SNAPSHOT_DIR"/

SOURCE_DATA_DIR="$SOURCE_DATA_DIR" SNAPSHOT_DIR="$SNAPSHOT_DIR" python3 - <<'PY' >"$SNAPSHOT_DIR/snapshot-metadata.json"
import json
import os
from datetime import datetime, timezone

print(json.dumps({
    "recordedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "sourceDataDir": os.environ["SOURCE_DATA_DIR"],
    "snapshotDir": os.environ["SNAPSHOT_DIR"],
    "containsPrismDb": True,
}, indent=2))
PY

echo "snapshot_dir=$SNAPSHOT_DIR"
echo "source_data_dir=$SOURCE_DATA_DIR"
