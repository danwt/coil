# ADR-001: Core Architecture Decisions

**Status:** Accepted
**Date:** 2026-02-18

## Context

Building a structured memory plugin for AI coding agents. Must work across Claude Code, OpenCode, Cline, and other MCP-compatible agents.

## Decisions

### 1. MCP server as core delivery mechanism

MCP is the universal extension point across all major AI coding agents. Building the core as an MCP server makes the memory tools portable. Claude Code-specific features (hooks, skills, agents) layer on top.

Alternatives considered:
- Claude Code plugin only — limits to one agent
- Standalone CLI — requires manual invocation, no agent integration

### 2. Bun runtime with bun:sqlite

Bun provides built-in SQLite (`bun:sqlite`), runs TypeScript directly, and has sub-10ms startup. No native compilation step (unlike better-sqlite3 with node-gyp).

Alternatives considered:
- Node.js + better-sqlite3 — requires native compilation, heavier
- Deno — smaller MCP ecosystem

### 3. Five typed memory kinds, no catch-all

Memory types: `decision`, `pattern`, `error`, `preference`, `context`. No "insight" or "other" type. Forcing classification acts as a quality gate — if something doesn't fit these five, it probably isn't worth storing.

### 4. Structured SQL queries over semantic search

The primary query mechanism is typed SQL filters (kind, project, tags, utility threshold), not embedding-based semantic search. Coding decisions are categorizable — "Use RLS for auth" and "Use JWT tokens" are semantically similar but completely different decisions. Typed filters avoid this false-positive problem.

FTS5 provides full-text search as a complement for free-text queries.

### 5. Simple ratio-based utility scoring

`utility = used_after_retrieval / retrievals` with age decay. New memories start at 0.5 (neutral). Not RL — just counting. Sufficient for single-user local tool. Upgradeable to more sophisticated scoring without architecture change.

### 6. SQLite single-file local storage

Zero infrastructure, data stays on machine, sub-millisecond queries, trivially backupable. Single `memories` table with JSON arrays for `tags` and `related` fields (trades query elegance for schema simplicity).

### 7. Hook automation for Claude Code

SessionStart loads context, PreCompact extracts knowledge (agent-type hook on haiku), Stop records retrievals, TaskCompleted boosts utility. Non-Claude-Code agents get MCP tools but not lifecycle automation.

## Consequences

- Portable across MCP-compatible agents
- Bun dependency (not Node.js compatible without changes to sqlite import)
- No cloud sync (local-first by design)
- No semantic embeddings in v1 (can be added behind feature flag)
