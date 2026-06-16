import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("readFileAtRef returns blob bytes", () => {
  const repo = openRepository(fixture.path);
  try {
    const bytes = repo.readFileAtRef("main", "README.md");
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toContain("# Fixture");
  } finally {
    repo.free();
  }
});

test("readFileAtRef returns null for a missing path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.readFileAtRef("main", "nope.txt")).toBeNull();
  } finally {
    repo.free();
  }
});

test("readFileAtRef returns null for a directory path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.readFileAtRef("main", "src")).toBeNull();
  } finally {
    repo.free();
  }
});
