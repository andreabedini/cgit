import { test, expect } from "bun:test";
import { buildRepolistVM } from "../../src/routes/repolist";
import { buildSummaryVM } from "../../src/routes/summary";
import { buildLogVM } from "../../src/routes/log";
import type { Commit, Reference } from "../../src/git/facade";

const now = new Date("2026-06-05T12:00:00Z");
const when = new Date("2026-06-04T12:00:00Z");

function commit(oid: string, summary: string): Commit {
  return {
    oid, abbrevOid: oid.slice(0, 10),
    author: { name: "Ann", email: "a@x.io", when },
    committer: { name: "Ann", email: "a@x.io", when },
    summary, message: summary + "\n", parents: [],
  };
}

test("buildRepolistVM maps discovered repos + last-commit age", () => {
  const vm = buildRepolistVM(
    [{ name: "alpha", path: "/r/alpha.git", description: "d" }],
    new Map([["alpha", when]]),
    now,
  );
  expect(vm.repos[0].name).toBe("alpha");
  expect(vm.repos[0].description).toBe("d");
  expect(vm.repos[0].lastCommitAge).toBe("1 day ago");
});

test("buildSummaryVM splits branches/tags, builds rows and clone urls", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "v1.0", fullName: "refs/tags/v1.0", kind: "tag", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
  ];
  const vm = buildSummaryVM(
    { name: "alpha", description: "d" },
    refs,
    [commit("a".repeat(40), "Add a")],
    "# readme",
    ["https://h/alpha.git"],
    10, 10,
    now,
  );
  expect(vm.branches.map((b) => b.name)).toEqual(["main"]);
  expect(vm.tags.map((t) => t.name)).toEqual(["v1.0"]);
  expect(vm.recentCommits[0].subject).toBe("Add a");
  expect(vm.recentCommits[0].decorations.map((d) => d.name).sort()).toEqual(["main", "v1.0"]);
  expect(vm.about).toBe("# readme");
  expect(vm.cloneUrls).toEqual(["https://h/alpha.git"]);
});

test("buildSummaryVM caps branches/tags but decorations come from ALL refs", () => {
  const oid = "a".repeat(40);
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: oid, commitOid: oid },
    { name: "feature", fullName: "refs/heads/feature", kind: "branch", targetOid: oid, commitOid: oid },
    { name: "v1.0", fullName: "refs/tags/v1.0", kind: "tag", targetOid: oid, commitOid: oid },
    { name: "v2.0", fullName: "refs/tags/v2.0", kind: "tag", targetOid: oid, commitOid: oid },
  ];
  const vm = buildSummaryVM(
    { name: "alpha", description: "d" },
    refs,
    [commit(oid, "Add a")],
    undefined,
    [],
    1, 1,
    now,
  );
  expect(vm.branches.length).toBe(1);
  expect(vm.tags.length).toBe(1);
  // Decorations are built from ALL refs, so the capped-out branch still appears.
  expect(vm.recentCommits[0].decorations.length).toBe(4);
});

test("buildLogVM builds rows, decorations and pager", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
  ];
  const vm = buildLogVM(
    { name: "alpha" }, "main",
    { commits: [commit("a".repeat(40), "Add a"), commit("b".repeat(40), "Add b")], hasMore: true },
    refs, 50, 50, now,
  );
  expect(vm.ref).toBe("main");
  expect(vm.rows.length).toBe(2);
  expect(vm.rows[0].decorations.map((d) => d.name)).toEqual(["main"]);
  expect(vm.pager).toEqual({ offset: 50, limit: 50, hasPrev: true, hasNext: true });
});
