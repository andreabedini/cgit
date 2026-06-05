import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureRepo, type FixtureRepo } from "./fixtures/repo";
import { createApp } from "../src/server";

let fixture: FixtureRepo;
let root: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  fixture = await createFixtureRepo();
  root = mkdtempSync(join(tmpdir(), "cgit-ts-e2e-"));
  await Bun.spawn(["cp", "-r", fixture.path, join(root, "project.git")]).exited;
  app = createApp({
    scanPath: root, summaryBranches: 10, summaryTags: 10,
    summaryLog: 10, logPageSize: 2, repolistPageSize: 50,
  });
});

afterAll(() => { fixture?.cleanup(); rmSync(root, { recursive: true, force: true }); });

test("GET / lists the repo", async () => {
  const html = await (await app.request("/")).text();
  expect(html).toContain("project");
  expect(html).toContain('href="/project/"');
});

test("GET /project/ shows refs and about", async () => {
  const res = await app.request("/project/");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("main");
  expect(html).toContain("v1.0");
  expect(html).toContain("# Fixture"); // README rendered as plain text
});

test("GET /project/log/ paginates", async () => {
  const html = await (await app.request("/project/log/")).text();
  expect(html).toContain("Add b.txt");
  expect(html).toContain("older"); // hasNext pager (page size 2, 3 commits)
});

test("GET /missing/ 404s", async () => {
  const res = await app.request("/missing/");
  expect(res.status).toBe(404);
});

test("GET /project redirects to the trailing-slash form", async () => {
  const res = await app.request("/project");
  expect(res.status).toBe(301);
  expect(res.headers.get("location")).toBe("/project/");
});

test("GET /project/log redirects to the trailing-slash form", async () => {
  const res = await app.request("/project/log");
  expect(res.status).toBe(301);
  expect(res.headers.get("location")).toBe("/project/log/");
});

test("GET /cgit.css serves the stylesheet", async () => {
  const res = await app.request("/cgit.css");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/css");
});
