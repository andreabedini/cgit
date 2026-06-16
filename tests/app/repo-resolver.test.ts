import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono, type Handler } from "hono";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { resolveRepo, type RepoEnv } from "../../src/app/repo";
import type { SiteConfig } from "../../src/config/config";

let fixture: FixtureRepo;
let root: string;
let cfg: SiteConfig;

beforeAll(async () => {
  fixture = await createFixtureRepo();
  root = mkdtempSync(join(tmpdir(), "cgit-ts-resolver-"));
  await Bun.spawn(["cp", "-r", fixture.path, join(root, "project.git")]).exited;
  cfg = {
    scanPath: root, summaryBranches: 10, summaryTags: 10,
    summaryLog: 10, logPageSize: 2, repolistPageSize: 50,
  };
});

afterAll(() => { fixture?.cleanup(); rmSync(root, { recursive: true, force: true }); });

function appWith(handler: Handler<RepoEnv>) {
  const app = new Hono<RepoEnv>();
  app.use("/:repo/*", resolveRepo());
  app.get("/:repo/", handler);
  app.get("/:repo", handler);
  app.onError((err, c) => c.text(err.message, 404));
  return app;
}

test("populates disc and an open repo in context for a matching repo path", async () => {
  const app = appWith((c) =>
    c.json({ name: c.get("disc").name, head: c.get("repo").headRef() }),
  );
  const res = await app.request("/project/", undefined, cfg);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: "project", head: expect.any(String) });
});

test("resolves repos using scanPath from c.env", async () => {
  const app = appWith((c) => c.text(c.get("disc").path));
  const res = await app.request("/project/", undefined, cfg);
  expect(await res.text()).toBe(join(root, "project.git"));
});

test("throws notFound for a missing repo", async () => {
  const app = appWith((c) => c.text(c.get("disc").name));
  const res = await app.request("/missing/", undefined, cfg);
  expect(res.status).toBe(404);
});

test("frees the repository after the handler completes", async () => {
  let freed = 0;
  const app = appWith((c) => {
    const repo = c.get("repo");
    const realFree = repo.free.bind(repo);
    repo.free = () => { freed++; realFree(); };
    return c.text("ok");
  });
  await app.request("/project/", undefined, cfg);
  expect(freed).toBe(1);
});

test("does not open a repo for the bare (non-trailing-slash) form", async () => {
  const app = appWith((c) => c.text(c.get("disc") ? "has" : "none"));
  const res = await app.request("/project", undefined, cfg);
  expect(await res.text()).toBe("none");
});
