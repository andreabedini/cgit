import { test, expect } from "bun:test";
import { SummaryPage } from "../../src/views/default/SummaryPage";
import { LogPage } from "../../src/views/default/LogPage";
import type { Commit, Reference } from "../../src/git/facade";

const now = new Date("2026-06-05T12:00:00Z");
const when = new Date("2026-06-04T12:00:00Z"); // 1 day before `now`

function ref(name: string, kind: "branch" | "tag", oid: string): Reference {
  return { name, kind, fullName: `refs/${kind === "branch" ? "heads" : "tags"}/${name}`, targetOid: oid, commitOid: oid };
}

function commit(oid: string, summary: string): Commit {
  return {
    oid, abbrevOid: oid.slice(0, 10),
    author: { name: "Ann", email: "a@x.io", when },
    committer: { name: "Ann", email: "a@x.io", when },
    summary, message: summary + "\n", parents: [],
  };
}

test("SummaryPage renders branches, tags, recent log and escaped about", () => {
  const html = SummaryPage({
    name: "alpha",
    description: "the alpha repo",
    branches: [ref("main", "branch", "a".repeat(40))],
    tags: [ref("v1.0", "tag", "a".repeat(40))],
    recentCommits: [commit("a".repeat(40), "Add <x>")],
    cloneUrls: ["https://example.com/alpha.git"],
    about: "# Title & stuff",
    now,
  }).toString();
  expect(html).toContain("main");
  expect(html).toContain("v1.0");
  expect(html).toContain("Add &lt;x&gt;");
  expect(html).toContain("# Title &amp; stuff"); // about escaped as plain text
  expect(html).toContain("https://example.com/alpha.git");
  expect(html).toContain("1 day ago");
});

test("LogPage renders rows, decorations and pager links", () => {
  const oid = "a".repeat(40);
  const html = LogPage({
    name: "alpha",
    ref: "main",
    commits: [commit(oid, "Add a")],
    decorations: new Map([[oid, [ref("main", "branch", oid)]]]),
    offset: 50,
    limit: 50,
    hasMore: true,
    now,
  }).toString();
  expect(html).toContain("Add a");
  expect(html).toContain("main");
  expect(html).toContain("/alpha/log/");
  expect(html).toContain("ofs=0");
  expect(html).toContain("ofs=100");
});
