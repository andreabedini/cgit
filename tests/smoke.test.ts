import { test, expect } from "bun:test";
import app from "../src/server";

test("server responds 200 on /healthz", async () => {
  const res = await app.request("/healthz");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
});
