import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MemoryStore } from "./store.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let store: MemoryStore;
let dbPath: string;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "coil-test-"));
  dbPath = join(tmpDir, "test.db");
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true });
});

describe("store", () => {
  it("stores and retrieves a memory", () => {
    const m = store.store("decision", "testproj", "Use RLS for auth", [
      "auth",
      "supabase",
    ]);
    expect(m.id).toBeTruthy();
    expect(m.kind).toBe("decision");
    expect(m.project).toBe("testproj");
    expect(m.content).toBe("Use RLS for auth");
    expect(m.tags).toEqual(["auth", "supabase"]);
    expect(m.utility).toBe(0.5);

    const got = store.get(m.id);
    expect(got).not.toBeNull();
    expect(got!.content).toBe("Use RLS for auth");
  });

  it("returns null for nonexistent memory", () => {
    expect(store.get("nonexistent")).toBeNull();
  });
});

describe("query", () => {
  it("filters by kind", () => {
    store.store("decision", "proj", "Decision 1", []);
    store.store("error", "proj", "Error 1", []);
    store.store("pattern", "proj", "Pattern 1", []);

    const decisions = store.query({ kind: ["decision"] });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].kind).toBe("decision");
  });

  it("filters by project", () => {
    store.store("decision", "proj-a", "Decision A", []);
    store.store("decision", "proj-b", "Decision B", []);

    const results = store.query({ project: "proj-a" });
    expect(results).toHaveLength(1);
    expect(results[0].project).toBe("proj-a");
  });

  it("filters by utility threshold", () => {
    const m1 = store.store("decision", "proj", "Good decision", []);
    const m2 = store.store("error", "proj", "Bad error", []);

    // Simulate feedback to raise m1 utility
    store.query(); // retrieve both (incrementing retrievals)
    store.feedback(m1.id, true);

    const high = store.query({ utility: { gte: 0.6 } });
    expect(high.length).toBeGreaterThanOrEqual(1);
    expect(high.every((m) => m.utility >= 0.6)).toBe(true);
  });

  it("filters by tags (any)", () => {
    store.store("decision", "proj", "Use RLS", ["auth", "supabase"]);
    store.store("error", "proj", "JWT bug", ["jwt", "auth"]);
    store.store("pattern", "proj", "Tailwind v4", ["css"]);

    const results = store.query({ tags: { any: ["auth"] } });
    expect(results).toHaveLength(2);
  });

  it("filters by tags (all)", () => {
    store.store("decision", "proj", "Use RLS", ["auth", "supabase"]);
    store.store("error", "proj", "JWT bug", ["jwt", "auth"]);

    const results = store.query({ tags: { all: ["auth", "supabase"] } });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("Use RLS");
  });

  it("returns cross-project with wildcard", () => {
    store.store("decision", "proj-a", "A", []);
    store.store("decision", "proj-b", "B", []);

    const results = store.query({ project: "*" });
    expect(results).toHaveLength(2);
  });

  it("sorts by utility desc by default", () => {
    const m1 = store.store("decision", "proj", "Low", []);
    const m2 = store.store("decision", "proj", "High", []);

    // Retrieve and boost m2
    store.query();
    store.feedback(m2.id, true);

    const results = store.query(undefined, "utility_desc");
    expect(results[0].id).toBe(m2.id);
  });

  it("respects limit", () => {
    for (let i = 0; i < 20; i++) {
      store.store("pattern", "proj", `Pattern ${i}`, []);
    }
    const results = store.query(undefined, "utility_desc", 5);
    expect(results).toHaveLength(5);
  });
});

describe("search", () => {
  it("finds by full-text search", () => {
    store.store("error", "proj", "JWT tokens expire silently", ["jwt"]);
    store.store("decision", "proj", "Use PostgreSQL for storage", [
      "postgres",
    ]);

    const results = store.search("JWT");
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain("JWT");
  });

  it("filters search by kind", () => {
    store.store("error", "proj", "Auth failure on refresh", ["auth"]);
    store.store("decision", "proj", "Auth via Supabase", ["auth"]);

    const results = store.search("auth", "error");
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("error");
  });
});

describe("feedback and utility", () => {
  it("increases utility when marked useful", () => {
    const m = store.store("error", "proj", "A bug fix", []);
    expect(m.utility).toBe(0.5);

    // Retrieve once (incrementing retrievals)
    store.query({ kind: ["error"] });
    const updated = store.feedback(m.id, true);
    expect(updated!.utility).toBeGreaterThan(0.5);
  });

  it("decreases utility when not marked useful after retrieval", () => {
    const m = store.store("error", "proj", "Noise", []);

    // Retrieve to increment retrievals
    store.query({ kind: ["error"] });
    const updated = store.feedback(m.id, false);
    // With 1 retrieval and 0 used_after_retrieval, base = 0/1 = 0
    // utility should be at floor (0.1)
    expect(updated!.utility).toBeLessThanOrEqual(0.1);
  });

  it("returns null for nonexistent memory feedback", () => {
    expect(store.feedback("nonexistent", true)).toBeNull();
  });
});

describe("relate", () => {
  it("creates bidirectional links", () => {
    const m1 = store.store("decision", "proj", "Decision 1", []);
    const m2 = store.store("error", "proj", "Error 1", []);

    store.relate(m1.id, m2.id);

    const got1 = store.get(m1.id)!;
    const got2 = store.get(m2.id)!;
    expect(got1.related).toContain(m2.id);
    expect(got2.related).toContain(m1.id);
  });

  it("does not duplicate links", () => {
    const m1 = store.store("decision", "proj", "D1", []);
    const m2 = store.store("decision", "proj", "D2", []);

    store.relate(m1.id, m2.id);
    store.relate(m1.id, m2.id);

    const got1 = store.get(m1.id)!;
    expect(got1.related.filter((r) => r === m2.id)).toHaveLength(1);
  });
});

describe("forget", () => {
  it("deletes a memory", () => {
    const m = store.store("decision", "proj", "To forget", []);
    expect(store.forget(m.id)).toBe(true);
    expect(store.get(m.id)).toBeNull();
  });

  it("returns false for nonexistent", () => {
    expect(store.forget("nonexistent")).toBe(false);
  });
});

describe("context", () => {
  it("returns grouped memories for a project", () => {
    store.store("decision", "myproj", "Use Supabase RLS", ["auth"]);
    store.store("error", "myproj", "JWT expires silently", ["jwt"]);
    store.store("pattern", "myproj", "Auth context pattern", ["auth"]);
    store.store("preference", "myproj", "Use bun", ["tooling"]);
    store.store("decision", "otherproj", "Other decision", []);

    const ctx = store.context("myproj");
    expect(ctx.project).toBe("myproj");
    expect(ctx.total).toBe(4);
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.errors).toHaveLength(1);
    expect(ctx.patterns).toHaveLength(1);
    expect(ctx.preferences).toHaveLength(1);
  });

  it("returns empty for unknown project", () => {
    const ctx = store.context("nonexistent");
    expect(ctx.total).toBe(0);
  });
});

describe("status", () => {
  it("returns aggregate statistics", () => {
    store.store("decision", "proj-a", "D1", []);
    store.store("error", "proj-a", "E1", []);
    store.store("pattern", "proj-b", "P1", []);

    const s = store.status();
    expect(s.total).toBe(3);
    expect(s.byKind["decision"]).toBe(1);
    expect(s.byKind["error"]).toBe(1);
    expect(s.byKind["pattern"]).toBe(1);
    expect(Object.keys(s.byProject)).toHaveLength(2);
    expect(s.topUtility.length).toBeLessThanOrEqual(5);
  });
});

describe("export/import", () => {
  it("roundtrips all memories", () => {
    store.store("decision", "proj", "D1", ["tag1"]);
    store.store("error", "proj", "E1", ["tag2"]);

    const exported = store.exportAll();
    expect(exported).toHaveLength(2);

    // Import into fresh store
    const newDbPath = join(tmpDir, "import-test.db");
    const newStore = new MemoryStore(newDbPath);
    const count = newStore.importAll(exported);
    expect(count).toBe(2);

    const reimported = newStore.exportAll();
    expect(reimported).toHaveLength(2);
    expect(reimported[0].content).toBe(exported[0].content);

    newStore.close();
  });
});

describe("events and weekly report", () => {
  it("logs session events", () => {
    store.logSession("myproj");
    const report = store.weeklyReport();
    expect(report.sessions).toBe(1);
  });

  it("logs store events", () => {
    store.store("decision", "proj", "Use RLS", []);
    const report = store.weeklyReport();
    expect(report.stores).toBe(1);
  });

  it("logs retrieve events on query", () => {
    store.store("decision", "proj", "D1", []);
    store.store("decision", "proj", "D2", []);
    store.query();
    const report = store.weeklyReport();
    expect(report.retrievals).toBe(1);
  });

  it("logs feedback events", () => {
    const m = store.store("error", "proj", "Bug", []);
    store.query();
    store.feedback(m.id, true);
    store.feedback(m.id, false);
    const report = store.weeklyReport();
    expect(report.feedbackUseful).toBe(1);
    expect(report.feedbackNotUseful).toBe(1);
  });

  it("returns NO_DATA with no sessions", () => {
    const report = store.weeklyReport();
    expect(report.signal).toBe("NO_DATA");
  });

  it("returns HEALTHY with good metrics", () => {
    store.logSession("proj");
    store.logSession("proj");
    const m1 = store.store("decision", "proj", "D1", []);
    const m2 = store.store("error", "proj", "E1", []);
    store.query();
    store.query();
    store.query();
    store.query();
    store.query();
    store.feedback(m1.id, true);
    store.feedback(m2.id, true);
    const report = store.weeklyReport();
    expect(report.signal).toBe("HEALTHY");
  });

  it("computes correct yield rate", () => {
    store.logSession("proj");
    const m = store.store("decision", "proj", "D1", []);
    store.query();
    store.query();
    store.query();
    store.feedback(m.id, true);
    store.feedback(m.id, false);
    const report = store.weeklyReport();
    expect(report.yieldRate).toBe(0.5);
  });
});
