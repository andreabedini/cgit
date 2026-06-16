import { test, expect } from "bun:test";
import { mimeForPath } from "../src/mime";

const m = { gif: "image/gif", pdf: "application/pdf" };

test("matches a known extension", () => {
  expect(mimeForPath("a/b/logo.gif", m)).toBe("image/gif");
});

test("is case-insensitive on the extension", () => {
  expect(mimeForPath("LOGO.GIF", m)).toBe("image/gif");
});

test("returns undefined for an unknown extension", () => {
  expect(mimeForPath("notes.txt", m)).toBeUndefined();
});

test("returns undefined when there is no extension", () => {
  expect(mimeForPath("path/to/Makefile", m)).toBeUndefined();
});

test("returns undefined for a dotfile with no extension", () => {
  expect(mimeForPath(".gitignore", m)).toBeUndefined();
});
