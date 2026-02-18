---
name: coil
description: >
  Persistent structured memory for AI coding agents. Use when the user says
  "remember this", "what did we decide about X", "forget that", asks about
  past decisions or errors, wants to check stored patterns, or explicitly
  asks to store or recall something. Also triggers on "/coil status",
  "/coil search", "/coil forget". Do NOT use for ephemeral conversation
  context that won't matter next session.
argument-hint: [status|search <query>|forget <id>]
user-invocable: true
allowed-tools: mcp__coil__coil_status, mcp__coil__coil_search, mcp__coil__coil_query, mcp__coil__coil_forget, mcp__coil__coil_store, mcp__coil__coil_feedback, mcp__coil__coil_relate, mcp__coil__coil_export
---

# Coil Memory Manager

## Slash Commands

- `/coil status` — memory overview: counts by kind, projects, top utility items
- `/coil search <query>` — full-text search across all memories
- `/coil forget <id>` — hard delete a memory by ID

## Storing Memories

Call `coil_store` with kind, content, and tags. Kinds:
- `decision` — architectural/technical choices with rationale
- `pattern` — code conventions, API usage, project structure
- `error` — non-obvious errors and their verified solutions
- `preference` — user workflow preferences
- `context` — project background knowledge

Do NOT store routine operations, temporary debugging, or information already in CLAUDE.md.

## Querying

Call `coil_query` with structured filters (kind, project, tags, utility threshold, dates).
Call `coil_search` for full-text search when filters are insufficient.

## Feedback

After retrieving and using a memory, call `coil_feedback(id, useful=true)` to boost its utility score. Memories that are retrieved but never marked useful decay toward 0.1.

## Debugging

- `coil_status` — counts, projects, top utility
- `coil_query` with `project: "*"` — cross-project view
- `coil_export` — full JSON dump of all memories
- DB location: `~/.coil/coil.db`
