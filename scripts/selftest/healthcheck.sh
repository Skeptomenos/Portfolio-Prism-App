#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

failed=0

check_url() {
  local name="$1"
  local url="$2"

  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "$name ok: $url"
  else
    echo "$name failed: $url" >&2
    failed=1
  fi
}

check_url "frontend" "$FRONTEND_URL"
check_url "engine" "$ENGINE_URL"

exit "$failed"
