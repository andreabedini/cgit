import { test, expect } from "bun:test";
import { buildDecorationMap } from "../src/middlewares";
import type { Reference } from "../src/git/facade";

test("buildDecorationMap groups refs by commit oid", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "v1.0", fullName: "refs/tags/v1.0", kind: "tag", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "dev", fullName: "refs/heads/dev", kind: "branch", targetOid: "b".repeat(40), commitOid: "b".repeat(40) },
  ];
  const map = buildDecorationMap(refs);
  expect(map.get("a".repeat(40))!.map((r) => r.name).sort()).toEqual(["main", "v1.0"]);
  expect(map.get("b".repeat(40))!.length).toBe(1);
  expect(map.has("c".repeat(40))).toBe(false);
});
