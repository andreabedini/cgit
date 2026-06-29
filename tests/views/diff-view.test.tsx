import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { DiffPage } from "../../src/views/default/DiffPage";
import type { Commit, CommitDiff } from "../../src/git/facade";

function headOf(html: string): string {
  return html.slice(0, html.indexOf("</head>"));
}

async function render(node: any): Promise<string> {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(node));
  return (await app.request("/")).text();
}

const commit: Commit = {
  oid: "a".repeat(40),
  abbrevOid: "a".repeat(10),
  author: { name: "Ann", email: "ann@example.com", when: new Date("2026-06-04T12:00:00Z") },
  committer: { name: "Ann", email: "ann@example.com", when: new Date("2026-06-04T12:00:00Z") },
  summary: "Add a.txt",
  message: "Add a.txt\n",
  parents: ["b".repeat(40)],
};

const diff: CommitDiff = {
  files: [
    {
      status: "added",
      oldPath: null,
      newPath: "a.txt",
      binary: false,
      hunks: [
        {
          header: "@@ -0,0 +1 @@",
          oldStart: 0,
          oldLines: 0,
          newStart: 1,
          newLines: 1,
          lines: [{ type: "add", oldLineNo: null, newLineNo: 1, content: "first" }],
        },
      ],
    },
  ],
};

test("DiffPage hoists its title and renders links and hunks", async () => {
  const html = await render(<DiffPage name="proj" commit={commit} diff={diff} />);
  expect(headOf(html)).toContain("<title>proj: diff aaaaaaaaaa</title>");
  expect(html).toContain('href="/proj/commit/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"');
  expect(html).toContain('href="/proj/tree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"');
  expect(html).toContain("new file");
  expect(html).toContain("@@ -0,0 +1 @@");
  expect(html).toContain("a.txt");
  expect(html).toContain("first");
  expect(html).toContain('class="diff-line add"');
});
