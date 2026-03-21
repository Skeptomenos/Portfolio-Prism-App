#!/usr/bin/env bash
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_common.sh"

cd "$ROOT_DIR"

declare -a changed_files=()
if [[ "$#" -gt 0 ]]; then
  changed_files=("$@")
else
  while IFS= read -r line; do
    [[ -n "$line" ]] && changed_files+=("$line")
  done < <(git status --short | awk '{print $2}')
fi

if [[ "${#changed_files[@]}" -eq 0 ]]; then
  echo "No changed files detected. Running frontend unit/integration baseline."
  pnpm test:run
  exit 0
fi

need_frontend=0
need_integration=0
need_python=0
need_e2e=0

for path in "${changed_files[@]}"; do
  case "$path" in
    src-tauri/python/*)
      need_python=1
      ;;
    tests/e2e/*|playwright.config.ts)
      need_e2e=1
      ;;
    tests/integration/*)
      need_integration=1
      ;;
    src/*)
      need_frontend=1
      ;;
    vitest.config.ts|package.json)
      need_frontend=1
      need_integration=1
      ;;
  esac
done

if (( need_frontend == 0 && need_integration == 0 && need_python == 0 && need_e2e == 0 )); then
  echo "Changes do not map cleanly to a narrower test bucket. Running frontend unit/integration baseline."
  need_frontend=1
fi

if (( need_frontend == 1 )); then
  echo "Running frontend unit tests"
  pnpm test:unit
fi

if (( need_integration == 1 )); then
  echo "Running frontend integration tests"
  pnpm test:integration
fi

if (( need_python == 1 )); then
  echo "Running Python tests"
  (
    cd src-tauri/python
    UV_CACHE_DIR="$UV_CACHE_DIR" uv run pytest
  )
fi

if (( need_e2e == 1 )); then
  echo "Running Playwright E2E tests"
  pnpm exec playwright test --reporter=line
fi
