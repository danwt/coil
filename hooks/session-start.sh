#!/usr/bin/env bash
# Coil SessionStart hook
# Outputs project context directly from SQLite (no MCP protocol needed).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bun run "$SCRIPT_DIR/context.ts" 2>/dev/null || true
