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
    expect(tags).toContain("v2.0");
    for (const r of refs) {
      expect(r.commitOid).toMatch(/^[0-9a-f]{40}$/);
      expect(r.fullName.startsWith("refs/")).toBe(true);
    }
  } finally {
    repo.free();
  }
});

test("annotated tag has targetOid !== commitOid; lightweight tag and branch have targetOid === commitOid", () => {
  const repo = openRepository(fixture.path);
  try {
    const refs = repo.references();
    const hexRe = /^[0-9a-f]{40}$/;

    // v2.0 is annotated: targetOid is the tag object, commitOid is the peeled commit
    const v2 = refs.find((r) => r.name === "v2.0");
    expect(v2).toBeDefined();
    expect(v2!.targetOid).toMatch(hexRe);
    expect(v2!.commitOid).toMatch(hexRe);
    expect(v2!.targetOid).not.toBe(v2!.commitOid);

    // v1.0 is lightweight: targetOid and commitOid must be identical
    const v1 = refs.find((r) => r.name === "v1.0");
    expect(v1).toBeDefined();
    expect(v1!.targetOid).toBe(v1!.commitOid);

    // main branch: targetOid and commitOid must be identical
    const main = refs.find((r) => r.name === "main");
    expect(main).toBeDefined();
    expect(main!.targetOid).toBe(main!.commitOid);
  } finally {
    repo.free();
  }
});
