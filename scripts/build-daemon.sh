#!/bin/bash
# build-daemon.sh
# Build TR daemon binary and copy to binaries folder

set -e  # Exit on any error

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_DIR="$PROJECT_ROOT/src-tauri/python"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"

echo "=== Building TR Daemon Binary ==="
echo ""

cd "$PYTHON_DIR"

# Activate virtual environment
if [ -d "venv-build" ]; then
    source venv-build/bin/activate
else
    echo "ERROR: venv-build not found. Run from src-tauri/python with venv-build activated."
    exit 1
fi

# Clean previous daemon build artifacts (keep prism build intact)
echo "[1/3] Cleaning previous daemon build..."
rm -rf dist/tr-daemon build/tr-daemon

# Build daemon
echo "[2/3] Running PyInstaller for tr-daemon..."
pyinstaller tr_daemon.spec --noconfirm

# Determine platform suffix
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        SUFFIX="aarch64-apple-darwin"
    else
        SUFFIX="x86_64-apple-darwin"
    fi
elif [ "$OS" = "Linux" ]; then
    SUFFIX="x86_64-unknown-linux-gnu"
else
    SUFFIX="x86_64-pc-windows-msvc"
fi

# Copy to binaries directory
echo "[3/3] Copying to binaries folder..."
mkdir -p "$BINARIES_DIR"
cp dist/tr-daemon "$BINARIES_DIR/tr-daemon-$SUFFIX"

echo ""
echo "=== TR Daemon Build Complete ==="
echo "Binary: $BINARIES_DIR/tr-daemon-$SUFFIX"
ls -lh "$BINARIES_DIR/tr-daemon-$SUFFIX"
