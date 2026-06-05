import { test, expect } from "bun:test";
import { formatAge, abbrevOid } from "../src/format";

const now = new Date("2026-06-05T12:00:00Z");

test("formatAge: seconds", () => {
  expect(formatAge(new Date("2026-06-05T11:59:30Z"), now)).toBe("30 seconds ago");
});
test("formatAge: minutes", () => {
  expect(formatAge(new Date("2026-06-05T11:55:00Z"), now)).toBe("5 minutes ago");
});
test("formatAge: hours", () => {
  expect(formatAge(new Date("2026-06-05T09:00:00Z"), now)).toBe("3 hours ago");
});
test("formatAge: days", () => {
  expect(formatAge(new Date("2026-06-03T12:00:00Z"), now)).toBe("2 days ago");
});
test("formatAge: singular", () => {
  expect(formatAge(new Date("2026-06-04T12:00:00Z"), now)).toBe("1 day ago");
});
test("abbrevOid: first 10 chars", () => {
  expect(abbrevOid("0123456789abcdef")).toBe("0123456789");
});
