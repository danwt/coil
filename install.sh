#!/usr/bin/env bash
# Install Coil for Claude Code: registers MCP server, hooks, and skill.
# Run from the coil repo root: ./install.sh

set -euo pipefail

COIL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_JSON="$HOME/.claude.json"
CLAUDE_DIR="$HOME/.claude"
SETTINGS="$CLAUDE_DIR/settings.json"

echo "Installing Coil from $COIL_ROOT"

# Check bun is available
if ! command -v bun &>/dev/null; then
  echo "Error: bun is required. Install from https://bun.sh/" >&2
  exit 1
fi

# Install dependencies if needed
if [ ! -d "$COIL_ROOT/node_modules" ]; then
  echo "Running bun install..."
  bun install --cwd "$COIL_ROOT"
fi

# 1. Register MCP server in ~/.claude.json
echo "Registering MCP server..."
python3 -c "
import json, os, sys

path = '$CLAUDE_JSON'
if os.path.exists(path):
    with open(path) as f:
        config = json.load(f)
else:
    config = {}

config.setdefault('mcpServers', {})
config['mcpServers']['coil'] = {
    'type': 'stdio',
    'command': 'bun',
    'args': ['run', '$COIL_ROOT/src/index.ts'],
    'env': {}
}

with open(path, 'w') as f:
    json.dump(config, f, indent=2)
print('  Added coil to $CLAUDE_JSON')
"

# 2. Add hooks to settings.json
echo "Adding hooks..."
python3 -c "
import json, os, sys

path = '$SETTINGS'
if not os.path.exists(path):
    print('  Error: $SETTINGS not found', file=sys.stderr)
    sys.exit(1)

with open(path) as f:
    settings = json.load(f)

hooks = settings.setdefault('hooks', {})

# SessionStart hook
session_hook = {
    'matcher': '',
    'hooks': [{
        'type': 'command',
        'command': '$COIL_ROOT/hooks/session-start.sh'
    }]
}
existing = hooks.get('SessionStart', [])
# Replace if coil hook already present, else append
filtered = [h for h in existing if 'coil' not in h.get('hooks', [{}])[0].get('command', '')]
filtered.append(session_hook)
hooks['SessionStart'] = filtered

# PreCompact hook
compact_hook = {
    'matcher': '',
    'hooks': [{
        'type': 'agent',
        'prompt': 'Analyze the conversation transcript. Extract and store: (1) any architectural or technical decisions made — include the rationale, (2) recurring code patterns discovered, (3) errors encountered and their verified solutions, (4) user preferences learned. Use coil_store for each. Be selective — only store genuinely useful knowledge, not routine operations. Check existing memories with coil_query first to avoid duplicates.'
    }]
}
existing = hooks.get('PreCompact', [])
filtered = [h for h in existing if h.get('hooks', [{}])[0].get('type') != 'agent' or 'coil_store' not in h.get('hooks', [{}])[0].get('prompt', '')]
filtered.append(compact_hook)
hooks['PreCompact'] = filtered

with open(path, 'w') as f:
    json.dump(settings, f, indent=2)
print('  Added SessionStart and PreCompact hooks')
"

# 3. Install skill
echo "Installing skill..."
mkdir -p "$CLAUDE_DIR/skills/coil"
cp "$COIL_ROOT/plugin/skills/coil/SKILL.md" "$CLAUDE_DIR/skills/coil/SKILL.md"
echo "  Copied SKILL.md to $CLAUDE_DIR/skills/coil/"

echo ""
echo "Done. Restart Claude Code to activate."
echo "Storage: ~/.coil/coil.db"
echo "Skill: /coil status"
