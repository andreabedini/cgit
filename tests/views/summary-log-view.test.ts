import { test, expect } from "bun:test";
import { SummaryPage } from "../../src/views/default/SummaryPage";
import { LogPage } from "../../src/views/default/LogPage";
import type { SummaryViewModel, LogViewModel } from "../../src/viewmodels";

test("SummaryPage renders branches, tags, recent log and escaped about", () => {
  const vm: SummaryViewModel = {
    repo: { name: "alpha", description: "the alpha repo" },
    branches: [{ name: "main", kind: "branch", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    tags: [{ name: "v1.0", kind: "tag", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    recentCommits: [{ abbrevOid: "aaaaaaaaaa", subject: "Add <x>", authorName: "Ann", ageLabel: "1 day ago", decorations: [] }],
    cloneUrls: ["https://example.com/alpha.git"],
    about: "# Title & stuff",
  };
  const html = SummaryPage({ vm }).toString();
  expect(html).toContain("main");
  expect(html).toContain("v1.0");
  expect(html).toContain("Add &lt;x&gt;");
  expect(html).toContain("# Title &amp; stuff"); // about escaped as plain text
  expect(html).toContain("https://example.com/alpha.git");
});

test("LogPage renders rows, decorations and pager links", () => {
  const vm: LogViewModel = {
    repo: { name: "alpha" },
    ref: "main",
    rows: [{
      abbrevOid: "aaaaaaaaaa", subject: "Add a", authorName: "Ann", ageLabel: "1 day ago",
      decorations: [{ name: "main", kind: "branch", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    }],
    pager: { offset: 50, limit: 50, hasPrev: true, hasNext: true },
  };
  const html = LogPage({ vm }).toString();
  expect(html).toContain("Add a");
  expect(html).toContain("main");
  expect(html).toContain("/alpha/log/");
  expect(html).toContain("ofs=0");
  expect(html).toContain("ofs=100");
});
