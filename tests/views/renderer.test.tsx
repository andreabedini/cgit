import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";

function appWith(body: Parameters<Hono["get"]>[1]) {
  const app = new Hono();
  app.use(renderer);
  app.get("/", body);
  return app;
}

test("renderer wraps content in a full HTML document with CSS links", async () => {
  const app = appWith((c) => c.render(<p>hello</p>));
  const html = await (await app.request("/")).text();
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain('href="/terminal.min.css"');
  expect(html).toContain('href="/cgit.css"');
  expect(html).toContain("<p>hello</p>");
});

test("renderer hoists a page <title> into <head>", async () => {
  const app = appWith((c) =>
    c.render(
      <>
        <title>My Title</title>
        <p>x</p>
      </>,
    ),
  );
  const html = await (await app.request("/")).text();
  const head = html.slice(0, html.indexOf("</head>"));
  expect(head).toContain("<title>My Title</title>");
});

test("renderer shows the repo nav menu with the active tab", async () => {
  const app = appWith((c) =>
    c.render(<p>x</p>, { repoNav: { name: "alpha", active: "log" } }),
  );
  const html = await (await app.request("/")).text();
  expect(html).toContain('href="/alpha/"');
  expect(html).toContain('href="/alpha/log/"');
  expect(html).toContain('class="menu-item active"');
});

test("renderer omits the repo nav when no repoNav is given", async () => {
  const app = appWith((c) => c.render(<p>x</p>));
  const html = await (await app.request("/")).text();
  expect(html).not.toContain("terminal-menu");
});
