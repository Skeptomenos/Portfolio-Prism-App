#!/usr/bin/env bash
set -euo pipefail

SKILLS_ROOT="${SKILLS_ROOT:-$HOME/.agents/skills}"

test -f "$SKILLS_ROOT/repo-test-map/SKILL.md"
test -f "$SKILLS_ROOT/self-test-loop/SKILL.md"
test -f "$SKILLS_ROOT/frontend-qa/SKILL.md"
test -f "$SKILLS_ROOT/bug-repro/SKILL.md"

npx skills ls -g -a codex
npx skills ls -g -a opencode
