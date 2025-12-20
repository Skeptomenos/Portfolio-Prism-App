#!/bin/bash

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_DIR="$PROJECT_ROOT/src-tauri/python"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"
HASH_FILE="$PYTHON_DIR/.last_build_hash"

FORCE_BUILD=0
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -f|--force) FORCE_BUILD=1 ;;
        *) echo "Unknown parameter passed: $1"; exit 1 ;;
    esac
    shift
done

echo "=== Building Python Binary ==="
echo ""

cd "$PYTHON_DIR"

calculate_source_hash() {
    find . -maxdepth 3 \( -name "*.py" -o -name "*.spec" -o -name "*.sql" -o -name "pyproject.toml" -o -name "uv.lock" \) -type f -not -path "*/.*" | sort | xargs shasum -a 256 | shasum -a 256 | cut -d ' ' -f 1
}

CURRENT_HASH=$(calculate_source_hash)

if [[ -f "$HASH_FILE" ]]; then
    LAST_HASH=$(cat "$HASH_FILE")
else
    LAST_HASH=""
fi

if [[ "$FORCE_BUILD" -eq 0 && "$CURRENT_HASH" == "$LAST_HASH" ]]; then
    echo "✓ Python source unchanged. Skipping build."
    echo "  (Use --force or -f to override)"
    echo ""
    exit 0
fi

echo "[0.5/3] Syncing dependencies with UV..."
uv sync

if [[ "$FORCE_BUILD" -eq 1 ]]; then
    echo "[1/3] Cleaning previous build (Forced)..."
    rm -rf dist/ build/
    PYINSTALLER_CLEAN="--clean"
else
    echo "[1/3] Incremental build (Keeping cache)..."
    PYINSTALLER_CLEAN=""
fi

echo "[2/3] Running PyInstaller for all specs in parallel..."
BUILD_PIDS=()
for spec in *.spec; do
    echo "  -> Starting build for $spec..."
    uv run pyinstaller "$spec" --noconfirm $PYINSTALLER_CLEAN > "build_${spec}.log" 2>&1 &
    BUILD_PIDS+=($!)
done

FAILED=0
for i in "${!BUILD_PIDS[@]}"; do
    pid=${BUILD_PIDS[$i]}
    wait $pid || FAILED=1
done

for spec in *.spec; do
    if [[ $FAILED -eq 1 ]]; then
        echo "  ⚠ Build failed for $spec. Check build_${spec}.log"
    else
        rm "build_${spec}.log"
    fi
done

if [[ $FAILED -eq 1 ]]; then
    echo "Build failed. Aborting."
    exit 1
fi

echo "[3/3] Copying artifacts to binaries folder..."
mkdir -p "$BINARIES_DIR"

# macOS ARM64 platform suffix required by Tauri sidecar pattern
SUFFIX="-aarch64-apple-darwin"

for artifact in dist/*; do
    name=$(basename "$artifact")
    target="$BINARIES_DIR/${name}${SUFFIX}"
    echo "  -> Copying $name to $target"
    cp -r "$artifact" "$target"
done

echo "[4/4] Verifying binaries..."
VERIFICATION_FAILED=0
for target in "$BINARIES_DIR"/*${SUFFIX}; do
    if [[ -x "$target" ]]; then
        name=$(basename "$target")
        echo "  -> Testing $name..."
        # Smoke test: Binary must respond with a ready signal within 5s
        if timeout 5 bash -c "PRISM_DATA_DIR=/tmp/prism-test \"$target\" <<< '' 2>&1 | grep -q '\"status\": \"ready\"'"; then
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
    exit 1
fi

echo "$CURRENT_HASH" > "$HASH_FILE"

echo ""
echo "=== Build Complete ==="
