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

test("decorations() groups refs by the commit they point at", () => {
  const repo = openRepository(fixture.path);
  try {
    const map = repo.decorations();
    const refs = repo.references();

    // Every ref appears under its commitOid bucket.
    for (const r of refs) {
      expect(map.get(r.commitOid)!.map((d) => d.name)).toContain(r.name);
    }

    // main and the annotated tag v2.0 both peel to the head commit, so they
    // share a bucket; the lightweight tag v1.0 points at an earlier commit.
    const main = refs.find((r) => r.name === "main")!;
    expect(map.get(main.commitOid)!.map((d) => d.name).sort()).toEqual(["main", "v2.0"]);

    const v1 = refs.find((r) => r.name === "v1.0")!;
    expect(map.get(v1.commitOid)!.map((d) => d.name)).toEqual(["v1.0"]);

    expect(map.has("c".repeat(40))).toBe(false);
  } finally {
    repo.free();
  }
});
