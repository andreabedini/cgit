import { test, expect } from "bun:test";
import { isBinary, classifyBlob } from "../src/blob";

test("isBinary detects a NUL byte", () => {
  expect(isBinary(new Uint8Array([0x68, 0x69, 0x00]))).toBe(true);
});

test("isBinary treats plain text as non-binary", () => {
  expect(isBinary(new TextEncoder().encode("hello\nworld\n"))).toBe(false);
});

test("isBinary only scans the first 8000 bytes", () => {
  const buf = new Uint8Array(9000);
  buf.fill(1); // non-zero fill so the only NUL is the one we place
  buf[8500] = 0; // NUL past the scan window
  expect(isBinary(buf)).toBe(false);
});

test("isBinary treats empty input as non-binary", () => {
  expect(isBinary(new Uint8Array([]))).toBe(false);
});

const utf8 = (s: string) => new TextEncoder().encode(s);

test("classifyBlob: image mime -> image, no text decoded", () => {
  const r = classifyBlob(utf8("whatever"), "image/png");
  expect(r.kind).toBe("image");
  expect(r.text).toBeUndefined();
});

test("classifyBlob: non-text mime -> binary", () => {
  expect(classifyBlob(utf8("%PDF"), "application/pdf").kind).toBe("binary");
});

test("classifyBlob: text/* mime -> text with decoded content", () => {
  const r = classifyBlob(utf8("hello"), "text/plain");
  expect(r.kind).toBe("text");
  expect(r.text).toBe("hello");
});

test("classifyBlob: unknown mime + NUL bytes -> binary", () => {
  expect(classifyBlob(new Uint8Array([1, 0, 2]), undefined).kind).toBe("binary");
});

test("classifyBlob: unknown mime + plain text -> text", () => {
  const r = classifyBlob(utf8("plain"), undefined);
  expect(r.kind).toBe("text");
  expect(r.text).toBe("plain");
});
