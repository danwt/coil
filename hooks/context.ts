#!/usr/bin/env bun
/**
 * Direct context output for SessionStart hook.
 * Bypasses MCP protocol — reads SQLite directly and prints to stdout.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync } from "fs";
import { MemoryStore } from "../src/store.js";
import { detectProject } from "../src/project.js";

const DB_DIR = process.env.COIL_DB_DIR ?? join(homedir(), ".coil");
const DB_PATH = process.env.COIL_DB_PATH ?? join(DB_DIR, "coil.db");

if (!existsSync(DB_PATH)) {
  process.exit(0);
}

const store = new MemoryStore(DB_PATH);
const project = detectProject();
store.logSession(project);
const ctx = store.context(project);
store.close();

if (ctx.total === 0) {
  process.exit(0);
}

const lines: string[] = [
  `Coil context for ${ctx.project} (${ctx.total} memories, avg utility: ${ctx.avgUtility.toFixed(2)})`,
];

for (const [heading, items] of [
  ["Decisions", ctx.decisions],
  ["Known errors", ctx.errors],
  ["Patterns", ctx.patterns],
  ["Preferences", ctx.preferences],
] as const) {
  if (items.length > 0) {
    lines.push(
      `\n${heading}:`,
      ...items.map((m) => `- ${m.content} [utility: ${m.utility.toFixed(2)}]`),
    );
  }
}

console.log(lines.join("\n"));
