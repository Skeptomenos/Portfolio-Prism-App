#!/bin/bash
# Ralph Wiggum for OpenCode - Long-running AI agent loop
# Usage: ./ralph.sh [max_iterations]
# Adapted from https://github.com/snarktank/ralph for use with OpenCode

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd-phase3.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"

# Check dependencies
if ! command -v opencode &> /dev/null; then
  echo "Error: opencode CLI not found. Install from https://opencode.ai"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq not found. Install with: brew install jq"
  exit 1
fi

if [ ! -f "$PRD_FILE" ]; then
  echo "Error: prd.json not found at $PRD_FILE"
  echo "Create a PRD first using: opencode run 'Load the prd skill and create a PRD for [your feature]'"
  exit 1
fi

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: prompt.md not found at $PROMPT_FILE"
  exit 1
fi

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")
  
  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    # Archive the previous run
    DATE=$(date +%Y-%m-%d)
    # Strip "ralph/" prefix from branch name for folder
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"
    
    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"
    
    # Reset progress file for new run
    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  if [ -n "$CURRENT_BRANCH" ]; then
    echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
  fi
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

AGENT="${RALPH_AGENT:-Sisyphus}"

echo "Starting Ralph (OpenCode) - Max iterations: $MAX_ITERATIONS"
echo "Agent: $AGENT"
echo "PRD: $PRD_FILE"
echo "Prompt: $PROMPT_FILE"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Ralph Iteration $i of $MAX_ITERATIONS (Agent: $AGENT)"
  echo "═══════════════════════════════════════════════════════"
  
  # Verify agent identity on first iteration
  if [ "$i" -eq 1 ]; then
    echo "Verifying agent identity..."
    VERIFY=$(cd "$SCRIPT_DIR" && opencode run --agent "$AGENT" -- 'If your system prompt contains "Sisyphus", reply ONLY with: SISYPHUS_ACTIVE. Otherwise reply ONLY with: OTHER_AGENT' 2>&1) || true
    if echo "$VERIFY" | grep -q "SISYPHUS_ACTIVE"; then
      echo "✓ Sisyphus agent confirmed"
    else
      echo "⚠ Warning: Expected Sisyphus but got different agent"
      echo "  Set RALPH_AGENT=Sisyphus or check oh-my-opencode installation"
    fi
  fi
  
  # Run opencode with the configured agent
  # -f attaches prompt.md, -- separates file args from message
  # Each run is a fresh session (no --continue flag)
  # PRD filename is injected into the prompt to avoid hardcoding issues
  PRD_BASENAME=$(basename "$PRD_FILE")
  OUTPUT=$(cd "$SCRIPT_DIR" && opencode run --agent "$AGENT" -f "$PROMPT_FILE" -- "Execute the Ralph agent instructions from the attached prompt.md file. IMPORTANT: The PRD file is '$PRD_BASENAME' (not prd.json). The progress.txt file is in the current directory." 2>&1 | tee /dev/stderr) || true
  
  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  Ralph completed all tasks!"
    echo "  Completed at iteration $i of $MAX_ITERATIONS"
    echo "═══════════════════════════════════════════════════════"
    exit 0
  fi
  
  echo ""
  echo "Iteration $i complete. Continuing to next story..."
  sleep 2
done

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Ralph reached max iterations ($MAX_ITERATIONS)"
echo "  without completing all tasks."
echo "  Check $PROGRESS_FILE for status."
echo "═══════════════════════════════════════════════════════"
exit 1
