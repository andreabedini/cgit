import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";
import { GitError } from "../../src/git/binding/libgit2";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("openRepository + headRef", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.path).toBe(fixture.path);
    expect(repo.headRef()).toBe("main");
  } finally {
    repo.free();
  }
});

test("openRepository throws NotFound for a non-repo path", () => {
  expect(() => openRepository("/definitely/not/a/repo")).toThrow(GitError);
});

test("repeated open/use/free does not crash or error", () => {
  for (let i = 0; i < 200; i++) {
    const repo = openRepository(fixture.path);
    try {
      repo.references();
      repo.log({ limit: 5 });
      repo.readFileAtRef("main", "README.md");
    } finally {
      repo.free();
    }
  }
  expect(true).toBe(true);
});
