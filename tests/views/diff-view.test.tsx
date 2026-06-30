import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { DiffFileCard } from "../../src/views/default/DiffFileCard";
import type { DiffFile } from "../../src/git/facade";

async function render(node: any): Promise<string> {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(node));
  return (await app.request("/")).text();
}

const file: DiffFile = {
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
};

test("DiffFileCard renders the file header, hunks and lines", async () => {
  const html = await render(<DiffFileCard file={file} />);
  expect(html).toContain("new file");
  expect(html).toContain("@@ -0,0 +1 @@");
  expect(html).toContain("a.txt");
  expect(html).toContain("first");
  expect(html).toContain('class="diff-line add"');
});
