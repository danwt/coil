# Coil

Structured memory for AI coding agents. Typed schemas, structured queries, utility scoring, lifecycle hooks.

## What it does

Coil is an MCP server that gives AI coding agents persistent memory across sessions. Instead of storing flat text blobs retrieved by semantic similarity, Coil stores typed, schema-validated memory items queried via structured SQL filters.

**Five memory types** — no catch-all:
- `decision` — architectural/technical decisions with rationale
- `pattern` — recurring code patterns discovered across sessions
- `error` — errors encountered and their verified solutions
- `preference` — user workflow and tool preferences
- `context` — project structure, relationships, conventions

**Utility scoring** — memories that lead to success rank higher. Simple ratio: `used_after_retrieval / retrievals` with age decay. New memories start at 0.5 (neutral).

**Structured queries** — filter by kind, project, tags, utility threshold, date range. The MCP server does the filtering server-side in SQLite.

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
      "command": "bun",
      "args": ["run", "/path/to/coil/src/index.ts"]
    }
  }
}
```

### As Claude Code plugin (full integration)

Copy the plugin files into your Claude Code configuration to get lifecycle hooks (auto-context on session start, knowledge extraction on compaction) and the `/coil` skill.

See `plugin/` directory for:
- `hooks.json` — lifecycle automation config
- `skills/coil/SKILL.md` — `/coil` slash command
- `agents/memory-extractor.md` — PreCompact knowledge extractor
- `.mcp.json` — MCP server registration

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

SQLite at `~/.coil/coil.db` (override with `COIL_DB_PATH` or `COIL_DB_DIR`). Single file, zero infrastructure, sub-millisecond queries.

## Development

```bash
bun test          # 23 tests
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
├── session-start.sh
├── session-stop.sh
└── task-completed.sh
plugin/
├── .mcp.json
├── hooks.json
├── skills/coil/SKILL.md
└── agents/memory-extractor.md
```
