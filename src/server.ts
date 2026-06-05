import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

export default app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`cgit-ts listening on :${port}`);
}
