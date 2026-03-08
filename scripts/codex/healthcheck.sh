#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
echo "[deprecated] use scripts/selftest/healthcheck.sh" >&2
exec "$ROOT_DIR/scripts/selftest/healthcheck.sh" "$@"
