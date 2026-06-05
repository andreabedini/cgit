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
