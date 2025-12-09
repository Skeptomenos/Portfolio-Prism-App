#!/bin/bash
# rebuild-and-run.sh
# Rebuild Python binary and start the app

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/build-python.sh"
"$SCRIPT_DIR/dev.sh"
