import { Hono } from "hono";
import { loadConfig, type SiteConfig } from "./config/config";
import { repolistVM, summaryVM, logVM } from "./routes/render";
import { RepolistPage } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";
import { LogPage } from "./views/default/LogPage";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.get("/cgit.css", async (c) => {
    const css = await Bun.file(new URL("./public/cgit.css", import.meta.url)).text();
    return c.body(css, 200, { "content-type": "text/css; charset=utf-8" });
  });

  app.get("/", (c) => {
    try {
      const p = c.req.query("p");
      if (!p) return c.html(RepolistPage({ vm: repolistVM(cfg) }));
      const page = c.req.query("page") ?? "summary";
      if (page === "log") {
        const ref = c.req.query("h") || undefined;
        const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
        return c.html(LogPage({ vm: logVM(cfg, p, ref, ofs) }));
      }
      return c.html(SummaryPage({ vm: summaryVM(cfg, p) }));
    } catch (err) {
      const status = statusForError(err);
      const message = err instanceof Error ? err.message : "Internal error";
      if (status === 500) console.error(err);
      return c.html(ErrorPage({ status, message }), status as 400 | 404 | 500);
    }
  });

  return app;
}

const app = createApp(loadConfig());
export default app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`cgit-ts listening on :${port}`);
}
