import { test, expect } from "bun:test";
import { RepolistPage } from "../../src/views/default/RepolistPage";

const now = new Date("2026-06-05T12:00:00Z");

test("RepolistPage renders rows and escapes descriptions", () => {
  const html = RepolistPage({
    entries: [
      { repo: { name: "alpha", path: "/x/alpha.git", description: "first <repo>" }, lastCommit: new Date("2026-06-03T12:00:00Z") },
      { repo: { name: "beta", path: "/x/beta.git" } },
    ],
    now,
  }).toString();
  expect(html).toContain("alpha");
  expect(html).toContain("2 days ago");
  expect(html).toContain("first &lt;repo&gt;"); // escaped
  expect(html).not.toContain("first <repo>");
  expect(html).toContain('href="/alpha/"');
});
