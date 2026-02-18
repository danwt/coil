---
name: coil
description: >
  Manage persistent structured memory across sessions. Use when the user asks
  about past decisions, wants to check what patterns have been established,
  or needs to recall solutions to previously encountered errors. Also use
  when explicitly asked to remember or forget something.
argument-hint: [status|search <query>|forget <id>]
allowed-tools:
  - mcp__coil__coil_status
  - mcp__coil__coil_search
  - mcp__coil__coil_query
  - mcp__coil__coil_forget
  - mcp__coil__coil_store
---

# Coil Memory Manager

## Commands

- `/coil status` — show memory overview (counts, top utility, storage)
- `/coil search <query>` — search across all memories
- `/coil forget <id>` — delete a specific memory

## Automatic Behavior

Coil automatically:
- Loads project context at session start
- Extracts knowledge before context compaction
- Tracks which memories were useful via coil_feedback
- Scores memories by actual usage, not just retrieval

## When to Store Manually

Store memories when:
- The user makes an explicit architectural or technical decision
- You discover a project-specific pattern or convention
- You solve a non-obvious error
- The user expresses a workflow preference

Do NOT store:
- Routine operations (file reads, git status)
- Temporary debugging steps
- Information already in CLAUDE.md or project docs
