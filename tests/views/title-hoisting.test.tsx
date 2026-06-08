import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { SummaryPage } from "../../src/views/default/SummaryPage";
import { LogPage } from "../../src/views/default/LogPage";
import type { SummaryViewModel, LogViewModel } from "../../src/viewmodels";

function headOf(html: string): string {
  return html.slice(0, html.indexOf("</head>"));
}

const summaryVM: SummaryViewModel = {
  repo: { name: "alpha" },
  branches: [],
  tags: [],
  recentCommits: [],
  cloneUrls: [],
};

const logVM: LogViewModel = {
  repo: { name: "alpha" },
  ref: "main",
  rows: [],
  pager: { offset: 0, limit: 50, hasPrev: false, hasNext: false },
};

test("SummaryPage title is hoisted into <head> through the renderer", async () => {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(<SummaryPage vm={summaryVM} />));
  const html = await (await app.request("/")).text();
  expect(headOf(html)).toContain("<title>alpha</title>");
});

test("LogPage title is hoisted into <head> through the renderer", async () => {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(<LogPage vm={logVM} />));
  const html = await (await app.request("/")).text();
  expect(headOf(html)).toContain("<title>alpha: log</title>");
});
