import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createFixtureRepo, type FixtureRepo } from "./fixtures/repo";
import { scanRepos } from "../src/scan/scan";
import { loadConfig } from "../src/config/config";

let fixture: FixtureRepo;
let root: string;

beforeAll(async () => {
  fixture = await createFixtureRepo();
  // Place the bare fixture repo under a fresh scan root as "project.git".
  root = mkdtempSync(join(tmpdir(), "cgit-ts-scan-"));
  const dest = join(root, "project.git");
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.spawn(["cp", "-r", fixture.path, dest]).exited;
});

afterAll(() => { fixture?.cleanup(); rmSync(root, { recursive: true, force: true }); });

test("scanRepos discovers bare repos and strips .git from the name", () => {
  const repos = scanRepos(root);
  expect(repos.length).toBe(1);
  expect(repos[0].name).toBe("project");
  expect(repos[0].path).toBe(join(root, "project.git"));
});

test("loadConfig provides defaults and honors CGIT_SCAN_PATH", () => {
  const cfg = loadConfig({ CGIT_SCAN_PATH: "/srv/git" });
  expect(cfg.scanPath).toBe("/srv/git");
  expect(cfg.logPageSize).toBeGreaterThan(0);
  expect(cfg.summaryLog).toBeGreaterThan(0);
});
