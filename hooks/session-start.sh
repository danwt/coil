#!/usr/bin/env bash
# Coil SessionStart hook
# Calls coil_context for the current project and outputs as additionalContext.
# The MCP server must be running for this to work.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"

# Detect project from git remote or directory name
PROJECT=""
if git rev-parse --is-inside-work-tree &>/dev/null; then
  REMOTE=$(git remote get-url origin 2>/dev/null || true)
  if [[ -n "$REMOTE" ]]; then
    PROJECT=$(echo "$REMOTE" | sed 's/.*\///' | sed 's/\.git$//')
  else
    PROJECT=$(basename "$(git rev-parse --show-toplevel 2>/dev/null)")
  fi
fi
if [[ -z "$PROJECT" ]]; then
  PROJECT=$(basename "$PWD")
fi

# Build JSON-RPC request to coil_context via MCP
REQUEST=$(cat <<JSONEOF
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "coil_context",
    "arguments": {
      "project": "$PROJECT"
    }
  }
}
JSONEOF
)

# Call the MCP server and extract the text content
RESPONSE=$(echo "$REQUEST" | bun run "$SERVER_DIR/src/index.ts" 2>/dev/null || true)

if [[ -n "$RESPONSE" ]]; then
  # Extract text from MCP response
  TEXT=$(echo "$RESPONSE" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read().strip().split('\n')[-1])
    for c in data.get('result', {}).get('content', []):
        if c.get('type') == 'text':
            print(c['text'])
except:
    pass
" 2>/dev/null || true)

  if [[ -n "$TEXT" && "$TEXT" != *"No memories"* ]]; then
    echo "$TEXT"
  fi
fi
