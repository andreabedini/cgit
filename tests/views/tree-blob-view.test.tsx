import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { TreePage } from "../../src/views/default/TreePage";
import { BlobPage } from "../../src/views/default/BlobPage";
import type { TreeEntry } from "../../src/git/facade";

function headOf(html: string): string {
  return html.slice(0, html.indexOf("</head>"));
}

async function render(node: any): Promise<string> {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(node));
  return (await app.request("/")).text();
}

const entries: TreeEntry[] = [
  { name: "a.txt", mode: 0o100644, type: "blob", oid: "f".repeat(40), size: 6 },
  { name: "src", mode: 0o040000, type: "tree", oid: "e".repeat(40) },
];

test("TreePage hoists its title and lists directories before files", async () => {
  const html = await render(<TreePage name="proj" ref="main" path="" entries={entries} />);
  expect(headOf(html)).toContain("<title>proj: main</title>");
  // directory sorts before the file
  expect(html.indexOf("src/")).toBeLessThan(html.indexOf("a.txt"));
  expect(html).toContain('href="/proj/tree/main/src"');
  expect(html).toContain('href="/proj/tree/main/a.txt"');
  expect(html).toContain("100644");
});

test("BlobPage hoists its title, renders text lines and a raw link", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="a.txt" binary={false} text={"foo\nbar"} size={7} />,
  );
  expect(headOf(html)).toContain("<title>proj: a.txt</title>");
  expect(html).toContain('href="/proj/raw/main/a.txt"');
  expect(html).toContain("foo");
  expect(html).toContain("bar");
  expect(html).toContain("7 bytes");
});

test("BlobPage shows a notice for binary files", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="logo.bin" binary={true} size={8} />,
  );
  expect(html).toContain("Binary file not shown.");
  expect(html).toContain('href="/proj/raw/main/logo.bin"');
});
