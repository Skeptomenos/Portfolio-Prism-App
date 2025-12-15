#!/bin/bash
# build-python.sh
# Build Python binary and copy to binaries folder

set -e  # Exit on any error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_DIR="$PROJECT_ROOT/src-tauri/python"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"

echo "=== Building Python Binary ==="
echo ""

cd "$PYTHON_DIR"
source venv-build/bin/activate

# Clean previous build artifacts
echo "[1/3] Cleaning previous build..."
rm -rf dist/ build/

# Build
echo "[2/4] Running PyInstaller for prism (Streamlit)..."
pyinstaller prism.spec --noconfirm

echo "[3/4] Running PyInstaller for prism-headless (IPC)..."
pyinstaller prism_headless.spec --noconfirm

# Copy to binaries
echo "[4/4] Copying to binaries folder..."
mkdir -p "$BINARIES_DIR"
cp dist/prism "$BINARIES_DIR/prism-aarch64-apple-darwin"
cp dist/prism-headless "$BINARIES_DIR/prism-headless-aarch64-apple-darwin"

echo ""
echo "=== Build Complete ==="
