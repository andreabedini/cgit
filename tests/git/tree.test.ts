import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("tree() lists root entries with types and blob sizes", () => {
  const repo = openRepository(fixture.path);
  try {
    const entries = repo.tree("main", "");
    expect(entries).not.toBeNull();
    const byName = Object.fromEntries(entries!.map((e) => [e.name, e]));
    expect(byName["README.md"].type).toBe("blob");
    expect(byName["README.md"].size).toBeGreaterThan(0);
    expect(byName["README.md"].oid).toMatch(/^[0-9a-f]{40}$/);
    expect(byName["README.md"].mode).toBe(0o100644);
    expect(byName["src"].mode).toBe(0o040000);
    expect(byName["src"].type).toBe("tree");
    expect(byName["logo.bin"].type).toBe("blob");
  } finally {
    repo.free();
  }
});

test("tree() lists a subdirectory", () => {
  const repo = openRepository(fixture.path);
  try {
    const entries = repo.tree("main", "src");
    expect(entries).not.toBeNull();
    expect(entries!.map((e) => e.name)).toContain("hello.txt");
  } finally {
    repo.free();
  }
});

test("tree() returns null for a blob path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.tree("main", "README.md")).toBeNull();
  } finally {
    repo.free();
  }
});

test("tree() returns null for a missing path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.tree("main", "nope/missing")).toBeNull();
  } finally {
    repo.free();
  }
});
