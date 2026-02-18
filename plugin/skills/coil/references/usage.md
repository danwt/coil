# Coil Usage Reference

## Content Quality

Good memories are self-contained — a future agent should understand them without the original conversation.

### Decisions

Include the choice AND the rationale:
- Good: `Use Supabase Edge Functions for FIT file processing because Cloudflare Workers have a 10-30ms CPU limit that's too short for parsing large ride files`
- Bad: `Use Supabase Edge Functions`

### Errors

Include the error, cause, and fix:
- Good: `bun:sqlite "unknown column" when using .all(...params) — must spread the array: .all(...params) not .all(params)`
- Bad: `SQLite column error fixed`

### Patterns

Include the convention and where it applies:
- Good: `In this project, all API routes return {data, error} shape — never throw from route handlers`
- Bad: `API routes return data`

### Preferences

Be specific about the preference:
- Good: `User prefers conventional commits with scope: feat(auth): add JWT refresh`
- Bad: `Use conventional commits`

## Tagging Strategy

Use 2-4 tags per memory. Tag by:
- Technology: `supabase`, `sqlite`, `expo`, `bun`
- Feature area: `auth`, `payments`, `routing`, `deployment`
- Language/framework: `typescript`, `react`, `sql`

## Query Filters

`coil_query` accepts a structured filter object:

```json
{
  "filter": {
    "kind": ["error", "pattern"],
    "project": "my-project",
    "tags": { "any": ["supabase", "auth"] },
    "utility": { "gte": 0.7 },
    "created": { "after": "2025-01-01T00:00:00Z" },
    "has_related": true
  },
  "sort": "utility_desc",
  "limit": 10
}
```

All filter fields are optional.

### Tag filters (pick one)
- `{ "any": ["a", "b"] }` — has tag a OR b
- `{ "all": ["a", "b"] }` — has tag a AND b
- `{ "none": ["a", "b"] }` — has neither tag a nor b

### Numeric filters (for utility)
- `{ "gte": 0.7 }` — greater than or equal
- `{ "lte": 0.3 }` — less than or equal
- `{ "between": [0.3, 0.8] }` — range

### Date filters (for created, last_accessed)
- `{ "after": "2025-01-01T00:00:00Z" }`
- `{ "before": "2025-06-01T00:00:00Z" }`
- `{ "between": ["2025-01-01T00:00:00Z", "2025-06-01T00:00:00Z"] }`

### Sort options
- `utility_desc` (default) — most useful first
- `utility_asc` — least useful first
- `recent` — most recently accessed
- `oldest` — oldest created
- `most_retrieved` — most frequently retrieved
- `least_retrieved` — least frequently retrieved

### Project scoping
- Omit `project` — uses auto-detected project from git remote
- `project: "my-project"` — specific project
- `project: "*"` — cross-project (opt-in)

## Using coil_relate

Link memories that reference each other:
- An error and the decision that fixed it
- A pattern and the decision that established it
- Related errors with different root causes

Links are bidirectional. Query with `has_related: true` to find connected memories.

## coil_search vs coil_query

- Use `coil_query` when you know what you're looking for (specific kind, project, tags)
- Use `coil_search` for exploratory text search (FTS5 with porter stemming)
- `coil_search` accepts optional `kind` and `min_utility` filters
