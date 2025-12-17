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

# Ensure dependencies are synced
echo "[0.5/3] Syncing dependencies with UV..."
uv sync

# Clean previous build artifacts
echo "[1/3] Cleaning previous build..."
rm -rf dist/ build/

# Build Loop
echo "[2/3] Running PyInstaller for all specs..."
for spec in *.spec; do
    echo "  -> Building $spec..."
    uv run pyinstaller "$spec" --noconfirm --clean
done

# Copy to binaries
echo "[3/3] Copying artifacts to binaries folder..."
mkdir -p "$BINARIES_DIR"

# Platform suffix (currently hardcoded for macOS ARM64)
SUFFIX="-aarch64-apple-darwin"

for artifact in dist/*; do
    name=$(basename "$artifact")
    target="$BINARIES_DIR/${name}${SUFFIX}"
    echo "  -> Copying $name to $target"
    cp -r "$artifact" "$target"
done

# Verify binaries can at least start
echo "[4/4] Verifying binaries..."
VERIFICATION_FAILED=0
for target in "$BINARIES_DIR"/*${SUFFIX}; do
    if [[ -x "$target" ]]; then
        name=$(basename "$target")
        echo "  -> Testing $name..."
        # Quick smoke test - binary should respond within 5 seconds
        # Send empty input and check if process starts without hanging
        if timeout 5 bash -c "echo '' | PRISM_DATA_DIR=/tmp/prism-test \"$target\" 2>&1 | head -1" >/dev/null 2>&1; then
            echo "    ✓ $name OK"
        else
            echo "    ⚠ WARNING: $name may have startup issues"
            VERIFICATION_FAILED=1
        fi
    fi
done

if [[ $VERIFICATION_FAILED -eq 1 ]]; then
    echo ""
    echo "⚠ Some binaries may have issues. Test manually before release."
fi

echo ""
echo "=== Build Complete ==="
