# Coil

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-runtime-f9f1e1?logo=bun&logoColor=black)](https://bun.sh/)
[![MCP](https://img.shields.io/badge/MCP-compatible-8B5CF6)](https://modelcontextprotocol.io/)
[![SQLite](https://img.shields.io/badge/SQLite-local--first-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Structured memory for AI coding agents. Typed schemas, structured queries, utility scoring, lifecycle hooks.

## The problem

AI coding agents lose everything between sessions. You debug a tricky JWT expiry issue on Monday, and on Wednesday the agent re-debugs the same thing from scratch. You decide on Supabase RLS for auth, and next session it asks "what auth system are you using?"

The existing solutions don't work well:

**Static instruction files** (CLAUDE.md, .clinerules) require you to manually maintain them. You have to remember to remember. They don't evolve, don't capture errors, and don't know which information actually helped.

**Memory MCP servers** (rlm-claude, Mem0, OMEGA, mcp-memory-service) store flat text blobs and retrieve by semantic similarity. This has three fundamental problems:

1. **False-positive retrieval.** "Use Supabase RLS for row-level auth" and "Supabase RLS is broken for multi-tenant" are semantically similar but functionally opposite. Semantic search returns both when you only want one.
2. **No quality signal.** A memory retrieved 100 times but never useful ranks the same as one retrieved 3 times and used every time. Everything is weighted equally, so noise accumulates.
3. **Context separation fails.** Memories from project A leak into project B because the only filter is semantic distance.

## Why Coil works

Coil takes a different approach: **typed schemas + structured SQL queries + usage-based scoring**.

**Typed schemas prevent noise.** Five memory types (`decision`, `pattern`, `error`, `preference`, `context`) with no catch-all. If something doesn't fit these five, it's probably not worth storing. The type system acts as a quality gate at write time.

**Structured queries prevent false positives.** Instead of "find things semantically similar to auth," the agent asks: "give me all `error` memories tagged `supabase` with utility above 0.7 in project `grupeta`." This is a database query, not a similarity search. The filtering happens server-side in SQLite, not in the token window.

**Utility scoring surfaces what actually helps.** Each memory tracks `used_after_retrieval / retrievals` with time decay. A memory that gets retrieved and explicitly marked useful rises toward 1.0. A memory that gets retrieved without positive feedback sinks toward 0.1. Over time, proven knowledge floats up and noise sinks. No ML, no training loop — just counting.

**Project scoping eliminates cross-contamination.** Every memory is tagged with its project (auto-detected from git remote). Queries filter by project by default. Cross-project queries (`project: "*"`) are opt-in, not the default.

**Lifecycle hooks automate capture.** You don't have to remember to remember. Claude Code's `SessionStart` hook injects project context automatically. The `PreCompact` hook extracts knowledge before the context window is compacted. The agent calls `coil_feedback` during work, and utility scores update accordingly.

The result: an agent that starts every session with your past decisions loaded, avoids re-debugging known errors, and improves retrieval quality over time — without manual maintenance.

## Install

Requires [Bun](https://bun.sh/).

### Claude Code (full integration)

```bash
git clone https://github.com/danwt/coil.git
cd coil
./install.sh
```

This registers the MCP server, adds the SessionStart hook, and installs the `/coil` skill. Restart Claude Code to activate.

### As MCP server only (any agent)

If you only want the MCP tools without Claude Code hooks:

```bash
git clone https://github.com/danwt/coil.git
cd coil
bun install
```

Then add to your MCP config (`.mcp.json`, etc.):

```json
{
  "mcpServers": {
    "coil": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/absolute/path/to/coil/src/index.ts"],
      "env": {}
    }
  }
}
```

Compatible with any MCP client (Claude Code, OpenCode, Cline, Continue, Goose).

## MCP Tools

| Tool | Description |
|------|-------------|
| `coil_store` | Store a typed memory. Auto-detects project from git. |
| `coil_query` | Structured query with typed filters (kind, project, tags, utility, dates). |
| `coil_feedback` | Report whether a retrieved memory was useful. Updates utility. |
| `coil_relate` | Create bidirectional link between two memories. |
| `coil_status` | Overview: counts by kind, project breakdown, top utility. |
| `coil_context` | Compiled project context. Designed for session start injection. |
| `coil_forget` | Hard delete a memory. |
| `coil_search` | Full-text search (FTS5) with optional kind and utility filters. |
| `coil_export` | Export all memories as JSON. |
| `coil_import` | Import memories from JSON file. |

## Query examples

```json
{
  "filter": {
    "kind": ["error", "pattern"],
    "tags": { "any": ["supabase", "auth"] },
    "utility": { "gte": 0.7 },
    "project": "grupeta"
  },
  "sort": "utility_desc",
  "limit": 5
}
```

Cross-project high-utility decisions:

```json
{
  "filter": {
    "kind": ["decision"],
    "utility": { "gte": 0.6 },
    "project": "*"
  },
  "sort": "utility_desc"
}
```

## Storage

SQLite at `~/.coil/coil.db` (override with `COIL_DB_PATH` or `COIL_DB_DIR`). Single file, zero infrastructure, sub-millisecond queries. Data never leaves your machine.

## Debugging and introspection

**From Claude Code:**

- `/coil status` — memory counts by kind, per-project breakdown, top utility items
- `/coil search <query>` — full-text search across all memories
- Ask Claude to run `coil_query` with filters (e.g. all errors for a project, everything above 0.7 utility)
- Ask Claude to run `coil_export` for a full JSON dump

**From the terminal:**

```bash
# List all memories sorted by utility
sqlite3 ~/.coil/coil.db \
  "SELECT id, kind, project, substr(content,1,80), printf('%.2f',utility) FROM memories ORDER BY utility DESC"

# Count by project and kind
sqlite3 ~/.coil/coil.db \
  "SELECT project, kind, COUNT(*) FROM memories GROUP BY project, kind"

# See what SessionStart would inject for the current directory
bun run /path/to/coil/hooks/context.ts

# Check DB exists and size
ls -lh ~/.coil/coil.db
```

The DB is created on the first `coil_store` call. Utility scores start at 0.5 — memories that get retrieved and marked useful via `coil_feedback` climb toward 1.0, unused ones decay toward 0.1.

## Development

```bash
bun test          # run tests
bun run check     # typecheck
bun run dev       # start server with watch mode
```

## Architecture

See [ADR-001](docs/adr/001-architecture.md) for core decisions.

```
install.sh        # One-command Claude Code setup
src/
├── index.ts      # MCP server entry point (10 tools)
├── store.ts      # SQLite storage layer
├── schema.ts     # Memory types, Zod schemas, query types
└── project.ts    # Git-based project auto-detection
hooks/
├── context.ts        # Direct SQLite context reader (used by session-start)
└── session-start.sh
plugin/
├── .mcp.json         # MCP server config (template)
├── hooks.json        # Hook config (template)
└── skills/coil/SKILL.md
```
