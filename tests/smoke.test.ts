import { test, expect } from "bun:test";
import { createApp } from "../src/server";
import { loadConfig } from "../src/config/config";

test("server responds 200 on /healthz", async () => {
  const app = createApp(loadConfig());
  const res = await app.request("/healthz");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
});
