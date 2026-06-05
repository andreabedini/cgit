import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("log() returns newest-first commits with fields", () => {
  const repo = openRepository(fixture.path);
  try {
    const page = repo.log({ limit: 10 });
    expect(page.commits.map((c) => c.summary)).toEqual(fixture.commitSubjects);
    expect(page.hasMore).toBe(false);
    const head = page.commits[0];
    expect(head.oid).toMatch(/^[0-9a-f]{40}$/);
    expect(head.abbrevOid).toBe(head.oid.slice(0, 10));
    expect(head.author.name).toBe("Test Author");
    expect(head.author.email).toBe("author@example.com");
    expect(head.author.when instanceof Date).toBe(true);
  } finally {
    repo.free();
  }
});

test("log() paginates with offset/limit and reports hasMore", () => {
  const repo = openRepository(fixture.path);
  try {
    const page = repo.log({ limit: 2, offset: 0 });
    expect(page.commits.length).toBe(2);
    expect(page.hasMore).toBe(true);
    const page2 = repo.log({ limit: 2, offset: 2 });
    expect(page2.commits.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  } finally {
    repo.free();
  }
});
