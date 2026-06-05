import { test, expect } from "bun:test";
import { HttpError, statusForError } from "../src/errors";

test("HttpError carries a status", () => {
  const e = new HttpError(404, "Repository not found");
  expect(e.status).toBe(404);
  expect(e.message).toBe("Repository not found");
});

test("statusForError defaults unknown errors to 500", () => {
  expect(statusForError(new HttpError(400, "bad"))).toBe(400);
  expect(statusForError(new Error("boom"))).toBe(500);
});
