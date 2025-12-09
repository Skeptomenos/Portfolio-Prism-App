#!/bin/bash
# dev.sh
# Start the Tauri development server

set -e  # Exit on any error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "=== Starting Tauri Dev Server ==="
npm run tauri dev
