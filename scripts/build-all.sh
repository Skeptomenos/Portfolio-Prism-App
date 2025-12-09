#!/bin/bash
# build-all.sh
# Build both Python binaries (prism + tr-daemon)

set -e  # Exit on any error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Building All Python Binaries ==="
echo ""

# Build main app
echo "Step 1/2: Building prism..."
"$SCRIPT_DIR/build-python.sh"
echo ""

# Build daemon
echo "Step 2/2: Building tr-daemon..."
"$SCRIPT_DIR/build-daemon.sh"
echo ""

echo "=== All Builds Complete ==="
echo ""
echo "Binaries:"
ls -lh "$SCRIPT_DIR/../src-tauri/binaries/"
