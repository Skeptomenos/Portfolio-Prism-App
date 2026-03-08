#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

stop_from_pid_file "frontend" "$FRONTEND_PID_FILE"
stop_from_pid_file "engine" "$ENGINE_PID_FILE"
