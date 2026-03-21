#!/bin/bash
# build-all.sh
# Unified build script for all components

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Use the unified orchestrator as defined in anamnesis/specs/observability.md
python3 "$PROJECT_ROOT/scripts/prism.py" build "$@"
