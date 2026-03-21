#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="${SOURCE_ROOT:-$HOME/.agents/skills}"
TARGET_ROOT="${TARGET_ROOT:-$HOME/.agents/skills}"

mkdir -p "$TARGET_ROOT"

for skill_dir in "$SOURCE_ROOT"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  rm -rf "$TARGET_ROOT/$skill_name"
  if [[ "$skill_dir" == "$TARGET_ROOT/$skill_name" ]]; then
    echo "skipping $skill_name (source and target are identical)"
    continue
  fi
  cp -R "$skill_dir" "$TARGET_ROOT/$skill_name"
  echo "installed $skill_name -> $TARGET_ROOT/$skill_name"
done
