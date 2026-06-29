import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { CommitPage } from "../../src/views/default/CommitPage";
import type { Commit, Reference } from "../../src/git/facade";

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
  message: "Add a.txt\n\nBody line\n",
  parents: ["b".repeat(40)],
};

const refs: Reference[] = [
  { name: "main", kind: "branch", fullName: "refs/heads/main", targetOid: commit.oid, commitOid: commit.oid },
];

test("CommitPage hoists its title and renders metadata links", async () => {
  const html = await render(
    <CommitPage name="proj" commit={commit} refs={refs} now={new Date("2026-06-05T12:00:00Z")} />,
  );
  expect(headOf(html)).toContain("<title>proj: commit aaaaaaaaaa</title>");
  expect(html).toContain("Add a.txt");
  expect(html).toContain("ann@example.com");
  expect(html).toContain('href="/proj/commit/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/"');
  expect(html).toContain('href="/proj/tree/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/"');
  expect(html).toContain('class="ref branch"');
  expect(html).toContain("Body line");
});
