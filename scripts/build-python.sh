#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Use the unified orchestrator as defined in anamnesis/specs/observability.md
# This ensures consistent logging, progress bars, and build logic.
python3 "$PROJECT_ROOT/scripts/prism.py" build "$@"
