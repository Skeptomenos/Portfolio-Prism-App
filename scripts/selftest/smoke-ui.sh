#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

OUTPUT_DIR="${OUTPUT_DIR:-$OUTPUT_SMOKE_DIR}"
SESSION_NAME="${SESSION_NAME:-portfolio-prism-smoke}"
BASE_URL="${BASE_URL:-$FRONTEND_URL}"

mkdir -p "$OUTPUT_DIR"

"$ROOT_DIR/scripts/selftest/dev-up.sh" >/dev/null

agent-browser --session "$SESSION_NAME" open "$BASE_URL"
agent-browser --session "$SESSION_NAME" wait --load networkidle
agent-browser --session "$SESSION_NAME" screenshot --annotate "$OUTPUT_DIR/home.png"
agent-browser --session "$SESSION_NAME" console >"$OUTPUT_DIR/console-home.log" || true
agent-browser --session "$SESSION_NAME" errors >"$OUTPUT_DIR/errors-home.log" || true

agent-browser --session "$SESSION_NAME" find role button click --name Health
agent-browser --session "$SESSION_NAME" wait 1000
agent-browser --session "$SESSION_NAME" screenshot --annotate "$OUTPUT_DIR/health.png"
agent-browser --session "$SESSION_NAME" console >"$OUTPUT_DIR/console-health.log" || true
agent-browser --session "$SESSION_NAME" errors >"$OUTPUT_DIR/errors-health.log" || true
agent-browser --session "$SESSION_NAME" close

echo "artifacts=$OUTPUT_DIR"
