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

Call `coil_store` with kind, content, and tags (2-4 tags per memory).

Kinds:
- `decision` — architectural/technical choices. Always include rationale.
- `pattern` — code conventions, API usage, project structure
- `error` — non-obvious errors. Include error message, cause, and fix.
- `preference` — user workflow preferences. Be specific.
- `context` — project background knowledge

Memories must be self-contained — a future agent should understand them without the original conversation. See [references/usage.md](references/usage.md) for content quality examples.

Do NOT store routine operations, temporary debugging, or information already in CLAUDE.md.

## Querying and Searching

- `coil_query` — structured filters (kind, project, tags, utility, dates). Use when you know what you're looking for.
- `coil_search` — full-text search (FTS5 with porter stemming). Use for exploratory search.

See [references/usage.md](references/usage.md) for filter syntax, sort options, and examples.

## Feedback and Linking

- Call `coil_feedback(id, useful=true)` after using a retrieved memory. Memories without positive feedback decay toward 0.1.
- Call `coil_relate(id, related_id)` to link related memories (e.g. an error and the decision that fixed it).

## Debugging

- `coil_status` — counts, projects, top utility
- `coil_query` with `project: "*"` — cross-project view
- `coil_export` — full JSON dump of all memories
- DB location: `~/.coil/coil.db`
