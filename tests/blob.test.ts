import { test, expect } from "bun:test";
import { isBinary } from "../src/blob";

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
