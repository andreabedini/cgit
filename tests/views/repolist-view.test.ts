import { test, expect } from "bun:test";
import { RepolistPage } from "../../src/views/default/RepolistPage";
import type { RepolistViewModel } from "../../src/viewmodels";

function render(node: any): string {
  return node.toString(); // hono/jsx server nodes stringify to HTML
}

test("RepolistPage renders rows and escapes descriptions", () => {
  const vm: RepolistViewModel = {
    repos: [
      { name: "alpha", description: "first <repo>", lastCommitAge: "2 days ago" },
      { name: "beta" },
    ],
  };
  const html = render(RepolistPage({ vm }));
  expect(html).toContain("alpha");
  expect(html).toContain("2 days ago");
  expect(html).toContain("first &lt;repo&gt;"); // escaped
  expect(html).not.toContain("first <repo>");
  expect(html).toContain('href="/?p=alpha&amp;page=summary"');
});
