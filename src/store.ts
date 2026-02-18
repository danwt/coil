import { Database, type SQLQueryBindings } from "bun:sqlite";
import { randomUUID } from "crypto";
import type {
  Memory,
  MemoryKind,
  MemoryRow,
  SortOption,
} from "./schema.js";
import { rowToMemory } from "./schema.js";
import type { z } from "zod";
import type { QueryFilter, TagFilter, NumericFilter, DateFilter } from "./schema.js";

type Param = SQLQueryBindings;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  project TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  utility REAL NOT NULL DEFAULT 0.5,
  retrievals INTEGER NOT NULL DEFAULT 0,
  used_after_retrieval INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL,
  last_accessed TEXT NOT NULL,
  related TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_project ON memories(project);
CREATE INDEX IF NOT EXISTS idx_utility ON memories(utility DESC);
CREATE INDEX IF NOT EXISTS idx_created ON memories(created);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  id UNINDEXED,
  content,
  tags,
  tokenize='porter'
);
`;

const SORT_MAP: Record<SortOption, string> = {
  utility_desc: "utility DESC",
  utility_asc: "utility ASC",
  recent: "last_accessed DESC",
  oldest: "created ASC",
  most_retrieved: "retrievals DESC",
  least_retrieved: "retrievals ASC",
};

export class MemoryStore {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  store(
    kind: MemoryKind,
    project: string,
    content: string,
    tags: string[],
  ): Memory {
    const now = new Date().toISOString();
    const id = randomUUID();
    const tagsJson = JSON.stringify(tags);

    this.db
      .prepare(
        `INSERT INTO memories (id, kind, project, content, tags, utility, retrievals, used_after_retrieval, created, last_accessed, related)
       VALUES (?, ?, ?, ?, ?, 0.5, 0, 0, ?, ?, '[]')`,
      )
      .run(id, kind, project, content, tagsJson, now, now);

    this.db
      .prepare(`INSERT INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`)
      .run(id, content, tagsJson);

    return {
      id,
      kind,
      project,
      content,
      tags,
      utility: 0.5,
      retrievals: 0,
      used_after_retrieval: 0,
      created: now,
      last_accessed: now,
      related: [],
    };
  }

  get(id: string): Memory | null {
    const row = this.db
      .prepare(`SELECT * FROM memories WHERE id = ?`)
      .get(id) as MemoryRow | null;
    return row ? rowToMemory(row) : null;
  }

  query(
    filter?: z.infer<typeof QueryFilter>,
    sort: SortOption = "utility_desc",
    limit: number = 10,
  ): Memory[] {
    const conditions: string[] = [];
    const params: Param[] = [];

    if (filter) {
      if (filter.kind && filter.kind.length > 0) {
        conditions.push(
          `kind IN (${filter.kind.map(() => "?").join(", ")})`,
        );
        params.push(...filter.kind);
      }

      if (filter.project && filter.project !== "*") {
        conditions.push("project = ?");
        params.push(filter.project);
      }

      if (filter.tags) {
        this.applyTagFilter(filter.tags, conditions, params);
      }

      if (filter.utility) {
        this.applyNumericFilter("utility", filter.utility, conditions, params);
      }

      if (filter.created) {
        this.applyDateFilter("created", filter.created, conditions, params);
      }

      if (filter.last_accessed) {
        this.applyDateFilter(
          "last_accessed",
          filter.last_accessed,
          conditions,
          params,
        );
      }

      if (filter.has_related === true) {
        conditions.push("related != '[]'");
      } else if (filter.has_related === false) {
        conditions.push("related = '[]'");
      }
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderBy = SORT_MAP[sort];

    const sql = `SELECT * FROM memories ${where} ORDER BY ${orderBy} LIMIT ?`;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];

    const now = new Date().toISOString();
    for (const row of rows) {
      this.db
        .prepare(
          `UPDATE memories SET retrievals = retrievals + 1, last_accessed = ? WHERE id = ?`,
        )
        .run(now, row.id);
    }

    return rows.map(rowToMemory);
  }

  search(
    text: string,
    kind?: MemoryKind,
    minUtility?: number,
  ): Memory[] {
    let sql: string;
    const params: Param[] = [text];

    if (kind && minUtility !== undefined) {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts f ON m.id = f.id
             WHERE memories_fts MATCH ? AND m.kind = ? AND m.utility >= ?
             ORDER BY rank`;
      params.push(kind, minUtility);
    } else if (kind) {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts f ON m.id = f.id
             WHERE memories_fts MATCH ? AND m.kind = ?
             ORDER BY rank`;
      params.push(kind);
    } else if (minUtility !== undefined) {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts f ON m.id = f.id
             WHERE memories_fts MATCH ? AND m.utility >= ?
             ORDER BY rank`;
      params.push(minUtility);
    } else {
      sql = `SELECT m.* FROM memories m
             JOIN memories_fts f ON m.id = f.id
             WHERE memories_fts MATCH ?
             ORDER BY rank`;
    }

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];
    return rows.map(rowToMemory);
  }

  feedback(id: string, useful: boolean): Memory | null {
    if (useful) {
      this.db
        .prepare(
          `UPDATE memories SET used_after_retrieval = used_after_retrieval + 1 WHERE id = ?`,
        )
        .run(id);
    }
    this.recalculateUtility(id);
    return this.get(id);
  }

  relate(id: string, relatedId: string): void {
    for (const [a, b] of [
      [id, relatedId],
      [relatedId, id],
    ]) {
      const row = this.db
        .prepare(`SELECT related FROM memories WHERE id = ?`)
        .get(a) as { related: string } | null;
      if (!row) continue;
      const related: string[] = JSON.parse(row.related);
      if (!related.includes(b)) {
        related.push(b);
        this.db
          .prepare(`UPDATE memories SET related = ? WHERE id = ?`)
          .run(JSON.stringify(related), a);
      }
    }
  }

  forget(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM memories WHERE id = ?`)
      .run(id);
    this.db.prepare(`DELETE FROM memories_fts WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  context(project?: string): {
    project: string;
    total: number;
    avgUtility: number;
    decisions: Memory[];
    patterns: Memory[];
    errors: Memory[];
    preferences: Memory[];
  } {
    const proj = project ?? "unknown";
    const base = `SELECT * FROM memories WHERE project = ? AND utility >= 0.5`;

    const decisions = (
      this.db
        .prepare(`${base} AND kind = 'decision' ORDER BY utility DESC LIMIT 5`)
        .all(proj) as MemoryRow[]
    ).map(rowToMemory);

    const patterns = (
      this.db
        .prepare(`${base} AND kind = 'pattern' ORDER BY utility DESC LIMIT 5`)
        .all(proj) as MemoryRow[]
    ).map(rowToMemory);

    const errors = (
      this.db
        .prepare(`${base} AND kind = 'error' ORDER BY utility DESC LIMIT 5`)
        .all(proj) as MemoryRow[]
    ).map(rowToMemory);

    const preferences = (
      this.db
        .prepare(
          `${base} AND kind = 'preference' ORDER BY utility DESC LIMIT 5`,
        )
        .all(proj) as MemoryRow[]
    ).map(rowToMemory);

    const stats = this.db
      .prepare(
        `SELECT COUNT(*) as total, AVG(utility) as avg FROM memories WHERE project = ?`,
      )
      .get(proj) as { total: number; avg: number | null };

    return {
      project: proj,
      total: stats.total,
      avgUtility: stats.avg ?? 0,
      decisions,
      patterns,
      errors,
      preferences,
    };
  }

  status(): {
    total: number;
    byKind: Record<string, number>;
    byProject: Record<string, { count: number; avgUtility: number }>;
    topUtility: Memory[];
  } {
    const total = (
      this.db.prepare(`SELECT COUNT(*) as c FROM memories`).get() as {
        c: number;
      }
    ).c;

    const kindRows = this.db
      .prepare(`SELECT kind, COUNT(*) as c FROM memories GROUP BY kind`)
      .all() as { kind: string; c: number }[];
    const byKind: Record<string, number> = {};
    for (const r of kindRows) byKind[r.kind] = r.c;

    const projRows = this.db
      .prepare(
        `SELECT project, COUNT(*) as c, AVG(utility) as avg FROM memories GROUP BY project`,
      )
      .all() as { project: string; c: number; avg: number }[];
    const byProject: Record<string, { count: number; avgUtility: number }> = {};
    for (const r of projRows)
      byProject[r.project] = { count: r.c, avgUtility: r.avg };

    const topUtility = (
      this.db
        .prepare(`SELECT * FROM memories ORDER BY utility DESC LIMIT 5`)
        .all() as MemoryRow[]
    ).map(rowToMemory);

    return { total, byKind, byProject, topUtility };
  }

  exportAll(): Memory[] {
    const rows = this.db
      .prepare(`SELECT * FROM memories ORDER BY created ASC`)
      .all() as MemoryRow[];
    return rows.map(rowToMemory);
  }

  importAll(memories: Memory[]): number {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO memories (id, kind, project, content, tags, utility, retrievals, used_after_retrieval, created, last_accessed, related)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const ftsStmt = this.db.prepare(
      `INSERT OR REPLACE INTO memories_fts (id, content, tags) VALUES (?, ?, ?)`,
    );

    let count = 0;
    const tx = this.db.transaction(() => {
      for (const m of memories) {
        const tagsJson = JSON.stringify(m.tags);
        stmt.run(
          m.id,
          m.kind,
          m.project,
          m.content,
          tagsJson,
          m.utility,
          m.retrievals,
          m.used_after_retrieval,
          m.created,
          m.last_accessed,
          JSON.stringify(m.related),
        );
        ftsStmt.run(m.id, m.content, tagsJson);
        count++;
      }
    });
    tx();
    return count;
  }

  close(): void {
    this.db.close();
  }

  private recalculateUtility(id: string): void {
    const row = this.db
      .prepare(
        `SELECT retrievals, used_after_retrieval, last_accessed FROM memories WHERE id = ?`,
      )
      .get(id) as {
      retrievals: number;
      used_after_retrieval: number;
      last_accessed: string;
    } | null;
    if (!row) return;

    let base: number;
    if (row.retrievals === 0) {
      base = 0.5;
    } else {
      base = row.used_after_retrieval / row.retrievals;
    }

    const lastAccess = new Date(row.last_accessed).getTime();
    const now = Date.now();
    const monthsSinceAccess =
      (now - lastAccess) / (1000 * 60 * 60 * 24 * 30);
    const ageFactor = 1.0 - 0.01 * monthsSinceAccess;
    const utility = Math.max(0.1, base * Math.max(ageFactor, 0.5));

    this.db.prepare(`UPDATE memories SET utility = ? WHERE id = ?`).run(utility, id);
  }

  private applyTagFilter(
    filter: z.infer<typeof TagFilter>,
    conditions: string[],
    params: Param[],
  ): void {
    if ("any" in filter) {
      const clauses = filter.any.map(() => "tags LIKE ?");
      conditions.push(`(${clauses.join(" OR ")})`);
      params.push(...filter.any.map((t) => `%"${t}"%`));
    } else if ("all" in filter) {
      for (const t of filter.all) {
        conditions.push("tags LIKE ?");
        params.push(`%"${t}"%`);
      }
    } else if ("none" in filter) {
      for (const t of filter.none) {
        conditions.push("tags NOT LIKE ?");
        params.push(`%"${t}"%`);
      }
    }
  }

  private applyNumericFilter(
    column: string,
    filter: z.infer<typeof NumericFilter>,
    conditions: string[],
    params: Param[],
  ): void {
    if ("gte" in filter) {
      conditions.push(`${column} >= ?`);
      params.push(filter.gte);
    } else if ("lte" in filter) {
      conditions.push(`${column} <= ?`);
      params.push(filter.lte);
    } else if ("between" in filter) {
      conditions.push(`${column} BETWEEN ? AND ?`);
      params.push(filter.between[0], filter.between[1]);
    }
  }

  private applyDateFilter(
    column: string,
    filter: z.infer<typeof DateFilter>,
    conditions: string[],
    params: Param[],
  ): void {
    if ("after" in filter) {
      conditions.push(`${column} > ?`);
      params.push(filter.after);
    } else if ("before" in filter) {
      conditions.push(`${column} < ?`);
      params.push(filter.before);
    } else if ("between" in filter) {
      conditions.push(`${column} BETWEEN ? AND ?`);
      params.push(filter.between[0], filter.between[1]);
    }
  }
}
