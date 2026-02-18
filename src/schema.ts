import { z } from "zod";

export const MEMORY_KINDS = [
  "decision",
  "pattern",
  "error",
  "preference",
  "context",
] as const;

export const MemoryKind = z.enum(MEMORY_KINDS);
export type MemoryKind = z.infer<typeof MemoryKind>;

export interface Memory {
  id: string;
  kind: MemoryKind;
  project: string;
  content: string;
  tags: string[];
  utility: number;
  retrievals: number;
  used_after_retrieval: number;
  created: string;
  last_accessed: string;
  related: string[];
}

export interface MemoryRow {
  id: string;
  kind: string;
  project: string;
  content: string;
  tags: string;
  utility: number;
  retrievals: number;
  used_after_retrieval: number;
  created: string;
  last_accessed: string;
  related: string;
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    ...row,
    kind: row.kind as MemoryKind,
    tags: JSON.parse(row.tags),
    related: JSON.parse(row.related),
  };
}

export const TagFilter = z.union([
  z.object({ any: z.array(z.string()) }),
  z.object({ all: z.array(z.string()) }),
  z.object({ none: z.array(z.string()) }),
]);

export const NumericFilter = z.union([
  z.object({ gte: z.number() }),
  z.object({ lte: z.number() }),
  z.object({ between: z.tuple([z.number(), z.number()]) }),
]);

export const DateFilter = z.union([
  z.object({ after: z.string() }),
  z.object({ before: z.string() }),
  z.object({ between: z.tuple([z.string(), z.string()]) }),
]);

export const QueryFilter = z
  .object({
    kind: z.array(MemoryKind).optional(),
    tags: TagFilter.optional(),
    utility: NumericFilter.optional(),
    project: z.string().optional(),
    created: DateFilter.optional(),
    last_accessed: DateFilter.optional(),
    has_related: z.boolean().optional(),
  })
  .optional();

export const SortOption = z.enum([
  "utility_desc",
  "utility_asc",
  "recent",
  "oldest",
  "most_retrieved",
  "least_retrieved",
]);
export type SortOption = z.infer<typeof SortOption>;

export const QueryInput = z.object({
  filter: QueryFilter,
  sort: SortOption.optional().default("utility_desc"),
  limit: z.number().int().min(1).max(100).optional().default(10),
});
