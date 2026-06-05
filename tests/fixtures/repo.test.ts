import { test, expect, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import { createFixtureRepo, type FixtureRepo } from "./repo";

let fixture: FixtureRepo;

test("createFixtureRepo builds a repo with known structure", async () => {
  fixture = await createFixtureRepo();
  expect(existsSync(`${fixture.path}/HEAD`)).toBe(true); // bare repo
  expect(fixture.commitSubjects.length).toBeGreaterThanOrEqual(3);
  expect(fixture.branches).toContain("main");
  expect(fixture.tags).toContain("v1.0");
});

afterAll(() => fixture?.cleanup());
