import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("references() returns branches and tags with oids", () => {
  const repo = openRepository(fixture.path);
  try {
    const refs = repo.references();
    const branches = refs.filter((r) => r.kind === "branch").map((r) => r.name);
    const tags = refs.filter((r) => r.kind === "tag").map((r) => r.name);
    expect(branches).toContain("main");
    expect(tags).toContain("v1.0");
    for (const r of refs) {
      expect(r.commitOid).toMatch(/^[0-9a-f]{40}$/);
      expect(r.fullName.startsWith("refs/")).toBe(true);
    }
  } finally {
    repo.free();
  }
});
