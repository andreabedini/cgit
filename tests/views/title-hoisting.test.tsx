import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { SummaryPage } from "../../src/views/default/SummaryPage";
import { LogPage } from "../../src/views/default/LogPage";
import { RepolistPage } from "../../src/views/default/RepolistPage";
import { ErrorPage } from "../../src/views/default/ErrorPage";
import { CommitPage } from "../../src/views/default/CommitPage";

const now = new Date("2026-06-05T12:00:00Z");

function headOf(html: string): string {
  return html.slice(0, html.indexOf("</head>"));
}

function appWith(node: any): Hono {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(node));
  return app;
}

async function render(node: any): Promise<string> {
  return (await appWith(node).request("/")).text();
}

test("SummaryPage title is hoisted into <head> through the renderer", async () => {
  const html = await render(
    <SummaryPage name="alpha" branches={[]} tags={[]} recentCommits={[]} now={now} />,
  );
  expect(headOf(html)).toContain("<title>alpha</title>");
});

test("LogPage title is hoisted into <head> through the renderer", async () => {
  const html = await render(
    <LogPage name="alpha" ref="main" commits={[]} decorations={new Map()} offset={0} limit={50} hasMore={false} now={now} />,
  );
  expect(headOf(html)).toContain("<title>alpha: log</title>");
});

test("RepolistPage title is hoisted into <head> through the renderer", async () => {
  const html = await render(<RepolistPage entries={[]} now={now} />);
  expect(headOf(html)).toContain("<title>Repositories</title>");
});

test("ErrorPage title is hoisted into <head> through the renderer", async () => {
  const html = await render(<ErrorPage status={404} message="Not found" />);
  expect(headOf(html)).toContain("<title>Error 404</title>");
});

test("CommitPage title is hoisted into <head> through the renderer", async () => {
  const html = await render(
    <CommitPage
      name="alpha"
      commit={{
        oid: "a".repeat(40),
        abbrevOid: "a".repeat(10),
        author: { name: "Ann", email: "a@x.io", when: now },
        committer: { name: "Ann", email: "a@x.io", when: now },
        summary: "Add a",
        message: "Add a\n",
        parents: [],
      }}
      refs={[]}
      now={now}
    />,
  );
  expect(headOf(html)).toContain("<title>alpha: commit aaaaaaaaaa</title>");
});
