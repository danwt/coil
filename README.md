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

```bash
git clone https://github.com/danwt/coil.git
cd coil
bun install
```

### As MCP server (any agent)

Add to your MCP config (`.mcp.json`, Claude Code settings, etc.):

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

### Full Claude Code integration

Beyond the MCP server, Coil provides lifecycle hooks, a `/coil` skill, and a knowledge extraction agent. Install these to get automatic context injection and knowledge capture.

**1. MCP server** — add to `~/.claude.json` under `mcpServers` (as above).

**2. Hooks** — add to `~/.claude/settings.json` under `hooks`:

```json
{
  "SessionStart": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "/absolute/path/to/coil/hooks/session-start.sh"
        }
      ]
    }
  ],
  "PreCompact": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "agent",
          "command": "Analyze the conversation transcript. Extract and store: (1) any architectural or technical decisions made — include the rationale, (2) recurring code patterns discovered, (3) errors encountered and their verified solutions, (4) user preferences learned. Use coil_store for each. Be selective — only store genuinely useful knowledge, not routine operations. Check existing memories with coil_query first to avoid duplicates."
        }
      ]
    }
  ]
}
```

**3. Skill** — copy `plugin/skills/coil/SKILL.md` to `~/.claude/skills/coil/SKILL.md`.

**4. Agent** — copy `plugin/agents/memory-extractor.md` to `~/.claude/agents/memory-extractor.md`.

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

## Development

```bash
bun test          # run tests
bun run check     # typecheck
bun run dev       # start server with watch mode
```

## Architecture

See [ADR-001](docs/adr/001-architecture.md) for core decisions.

```
src/
├── index.ts      # MCP server entry point (10 tools)
├── store.ts      # SQLite storage layer
├── schema.ts     # Memory types, Zod schemas, query types
└── project.ts    # Git-based project auto-detection
hooks/
├── context.ts        # Direct SQLite context reader (used by session-start)
├── session-start.sh
├── session-stop.sh
└── task-completed.sh
plugin/
├── .mcp.json
├── hooks.json
├── skills/coil/SKILL.md
└── agents/memory-extractor.md
```
