import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { homedir } from "os";
import { mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { MemoryStore } from "./store.js";
import {
  MemoryKind,
  QueryFilter,
  SortOption,
  type Memory,
} from "./schema.js";
import { detectProject } from "./project.js";

const DB_DIR = process.env.COIL_DB_DIR ?? join(homedir(), ".coil");
const DB_PATH = process.env.COIL_DB_PATH ?? join(DB_DIR, "coil.db");

mkdirSync(DB_DIR, { recursive: true });

const store = new MemoryStore(DB_PATH);
const defaultProject = detectProject();

function formatMemory(m: Memory): string {
  return `[${m.kind}, ${m.project}, utility: ${m.utility.toFixed(2)}] ${m.content}`;
}

const server = new McpServer({
  name: "coil",
  version: "0.1.0",
});

// 1. coil_store
server.registerTool("coil_store", {
  description:
    "Store a typed memory item. Auto-detects project from git remote.",
  inputSchema: {
    kind: MemoryKind,
    content: z.string().describe("The knowledge to remember"),
    tags: z.array(z.string()).optional().default([]).describe("Freeform tags for filtering"),
    project: z.string().optional().describe("Project name (auto-detected if omitted)"),
  },
}, (args) => {
  const project = args.project ?? defaultProject;
  const memory = store.store(args.kind, project, args.content, args.tags);
  return {
    content: [
      {
        type: "text" as const,
        text: `Stored memory ${memory.id}\n${formatMemory(memory)}`,
      },
    ],
  };
});

// 2. coil_query
server.registerTool("coil_query", {
  description:
    "Structured query with typed filters. Returns memories matching filter criteria.",
  inputSchema: {
    filter: QueryFilter,
    sort: SortOption.optional().default("utility_desc"),
    limit: z.number().int().min(1).max(100).optional().default(10),
  },
}, (args) => {
  const memories = store.query(args.filter, args.sort, args.limit);
  if (memories.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No memories match the query." }],
    };
  }
  const text = memories.map(formatMemory).join("\n\n");
  return {
    content: [
      { type: "text" as const, text: `Found ${memories.length} memories:\n\n${text}` },
    ],
  };
});

// 3. coil_feedback
server.registerTool("coil_feedback", {
  description:
    "Report whether a retrieved memory was actually useful. Updates utility score.",
  inputSchema: {
    id: z.string().describe("Memory ID"),
    useful: z.boolean().describe("Whether the memory was useful"),
  },
}, (args) => {
  const memory = store.feedback(args.id, args.useful);
  if (!memory) {
    return {
      content: [{ type: "text" as const, text: `Memory ${args.id} not found.` }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `Updated utility for ${args.id}: ${memory.utility.toFixed(2)}`,
      },
    ],
  };
});

// 4. coil_relate
server.registerTool("coil_relate", {
  description:
    "Create a bidirectional link between two memories.",
  inputSchema: {
    id: z.string().describe("First memory ID"),
    related_id: z.string().describe("Second memory ID"),
  },
}, (args) => {
  store.relate(args.id, args.related_id);
  return {
    content: [
      {
        type: "text" as const,
        text: `Linked ${args.id} <-> ${args.related_id}`,
      },
    ],
  };
});

// 5. coil_status
server.registerTool("coil_status", {
  description:
    "Overview: memory counts by kind, top utility items, project breakdown.",
}, () => {
  const s = store.status();
  const kindLines = Object.entries(s.byKind)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  const projLines = Object.entries(s.byProject)
    .map(
      ([k, v]) =>
        `  ${k}: ${v.count} memories (avg utility: ${v.avgUtility.toFixed(2)})`,
    )
    .join("\n");
  const topLines = s.topUtility.map(formatMemory).join("\n  ");

  return {
    content: [
      {
        type: "text" as const,
        text: `Coil Memory Store\n${"─".repeat(18)}\nTotal: ${s.total}\n\nBy kind:\n${kindLines}\n\nBy project:\n${projLines}\n\nTop utility:\n  ${topLines}`,
      },
    ],
  };
});

// 6. coil_context
server.registerTool("coil_context", {
  description:
    "Compiled project context summary: top decisions, patterns, errors, preferences. Designed for SessionStart injection.",
  inputSchema: {
    project: z.string().optional().describe("Project name (auto-detected if omitted)"),
  },
}, (args) => {
  const project = args.project ?? defaultProject;
  const ctx = store.context(project);

  if (ctx.total === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No memories for project "${project}".`,
        },
      ],
    };
  }

  const sections: string[] = [
    `Project: ${ctx.project} (${ctx.total} memories, avg utility: ${ctx.avgUtility.toFixed(2)})`,
  ];

  if (ctx.decisions.length > 0) {
    sections.push(
      "\nDecisions:\n" +
        ctx.decisions.map((m) => `- ${m.content} [utility: ${m.utility.toFixed(2)}]`).join("\n"),
    );
  }
  if (ctx.errors.length > 0) {
    sections.push(
      "\nKnown errors:\n" +
        ctx.errors.map((m) => `- ${m.content} [utility: ${m.utility.toFixed(2)}]`).join("\n"),
    );
  }
  if (ctx.patterns.length > 0) {
    sections.push(
      "\nPatterns:\n" +
        ctx.patterns.map((m) => `- ${m.content} [utility: ${m.utility.toFixed(2)}]`).join("\n"),
    );
  }
  if (ctx.preferences.length > 0) {
    sections.push(
      "\nPreferences:\n" +
        ctx.preferences.map((m) => `- ${m.content} [utility: ${m.utility.toFixed(2)}]`).join("\n"),
    );
  }

  return {
    content: [{ type: "text" as const, text: sections.join("\n") }],
  };
});

// 7. coil_forget
server.registerTool("coil_forget", {
  description: "Delete a memory by ID. Hard delete from SQLite.",
  inputSchema: {
    id: z.string().describe("Memory ID to delete"),
  },
}, (args) => {
  const deleted = store.forget(args.id);
  return {
    content: [
      {
        type: "text" as const,
        text: deleted
          ? `Deleted memory ${args.id}.`
          : `Memory ${args.id} not found.`,
      },
    ],
    ...(deleted ? {} : { isError: true }),
  };
});

// 8. coil_search
server.registerTool("coil_search", {
  description:
    "Full-text search with optional kind and utility filters.",
  inputSchema: {
    text: z.string().describe("Search text"),
    kind: MemoryKind.optional().describe("Filter by memory kind"),
    min_utility: z.number().optional().describe("Minimum utility threshold"),
  },
}, (args) => {
  const memories = store.search(args.text, args.kind, args.min_utility);
  if (memories.length === 0) {
    return {
      content: [{ type: "text" as const, text: "No memories match the search." }],
    };
  }
  const text = memories.map(formatMemory).join("\n\n");
  return {
    content: [
      { type: "text" as const, text: `Found ${memories.length} memories:\n\n${text}` },
    ],
  };
});

// 9. coil_export
server.registerTool("coil_export", {
  description: "Export all memories as JSON for backup or migration.",
}, () => {
  const memories = store.exportAll();
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(memories, null, 2),
      },
    ],
  };
});

// 10. coil_import
server.registerTool("coil_import", {
  description: "Import memories from a JSON file. For restore or sharing.",
  inputSchema: {
    path: z.string().describe("Path to JSON file containing memories array"),
  },
}, (args) => {
  if (!existsSync(args.path)) {
    return {
      content: [{ type: "text" as const, text: `File not found: ${args.path}` }],
      isError: true,
    };
  }
  const data = JSON.parse(readFileSync(args.path, "utf-8")) as Memory[];
  const count = store.importAll(data);
  return {
    content: [
      { type: "text" as const, text: `Imported ${count} memories from ${args.path}.` },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("coil server error:", err);
  process.exit(1);
});
