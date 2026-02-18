# ADR-002: Meta-Analytics for Coil Usefulness Evaluation

**Status:** Accepted
**Date:** 2026-02-18
**Issue:** https://github.com/danwt/coil/issues/2

## Context

After shipping v1, all memories sat at the default 0.5 utility score. Coil was effectively write-only — memories were stored but there was no signal indicating whether the tool was being used or helping. The question "should we keep using coil?" had no data-driven answer.

## Decision

Add lightweight event logging to the SQLite DB and a `coil_weekly_report` tool that produces a signal (HEALTHY / MARGINAL / NO_DATA) answerable on a weekly cadence.

### Event table

A single `events` table records: `session` (SessionStart), `store`, `retrieve`, `feedback_useful`, `feedback_not_useful`. No session IDs or session boundaries — aggregate counts over a time window are sufficient for the evaluation question.

### Two key metrics

1. **Retrievals per session** — if agents never query coil, it cannot help. Target: ≥2/session.
2. **Yield rate** — `feedback_useful / total_feedback`. Measures quality of what is stored. Target: ≥20%.

### Signal thresholds

| Signal | Condition |
|---|---|
| NO_DATA | sessions=0 OR retrievals=0 |
| MARGINAL | rate<2 OR yield<20% OR no feedback at all |
| HEALTHY | rate≥2 AND yield≥20% |

### Session logging

The `SessionStart` hook (`hooks/context.ts`) logs a `session` event each time it runs. This is the natural proxy for "a session started in a coil-aware project".

## Alternatives Considered

**Session IDs tying events together** — would allow per-session breakdowns but requires passing session context through every tool call. Overkill for the evaluation question.

**Separate analytics DB** — unnecessary, same SQLite file is simpler and keeps data co-located.

**Embedding-based quality signals** — too complex for v1. Simple counts are sufficient.

## Consequences

- `events` table grows unboundedly (acceptable — event rows are tiny, ~100 bytes each; a year of heavy use ≈ a few MB)
- Session count only tracks projects with SessionStart hooks. Other MCP clients get retrieval/feedback events but not session events.
- Yield rate is only meaningful if agents consistently call `coil_feedback`. Documented as a behavioral requirement in the skill prompt.
