import { test, expect } from "bun:test";
import { langForPath, langForBlob, highlightBlob } from "../src/highlight";

test("langForPath maps known extensions", () => {
  expect(langForPath("src/a.ts")).toBe("ts");
  expect(langForPath("main.c")).toBe("c");
  expect(langForPath("app.py")).toBe("python");
});

test("langForPath maps filename specials", () => {
  expect(langForPath("path/to/Makefile")).toBe("make");
});

test("langForPath returns text for unknown or extensionless paths", () => {
  expect(langForPath("notes.xyz")).toBe("text");
  expect(langForPath("README")).toBe("text");
});

test("langForBlob falls back to text above the size cap", () => {
  expect(langForBlob("a.ts", 10)).toBe("ts");
  expect(langForBlob("a.ts", 600 * 1024)).toBe("text");
});

test("highlightBlob returns Shiki markup with per-line token spans", async () => {
  const html = await highlightBlob("const x = 1;\n", "a.ts", 12);
  expect(html).toContain('class="shiki');
  expect(html).toContain('class="line"');
  expect(html).toContain("<span"); // tokenized
});

test("highlightBlob returns Shiki markup for an unknown language", async () => {
  const html = await highlightBlob("hello world\n", "a.unknownext", 12);
  expect(html).toContain('class="shiki');
});
