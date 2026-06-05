import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, type SiteConfig } from "./config/config";
import { repolistVM, summaryVM, logVM } from "./routes/render";
import { RepolistPage } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";
import { LogPage } from "./views/default/LogPage";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  // Static / infrastructure routes are registered before the `/:repo` param
  // routes so a request like `/healthz` matches here and never falls through.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.get("/", (c) => c.html(RepolistPage({ vm: repolistVM(cfg) })));

  // Canonical pages use trailing slashes; redirect the bare forms to them.
  app.get("/:repo", (c) => c.redirect(`/${c.req.param("repo")}/`, 301));
  app.get("/:repo/log", (c) => c.redirect(`/${c.req.param("repo")}/log/`, 301));

  app.get("/:repo/", (c) =>
    c.html(SummaryPage({ vm: summaryVM(cfg, c.req.param("repo")) })),
  );

  app.get("/:repo/log/", (c) => {
    const repo = c.req.param("repo");
    const ref = c.req.query("h") || undefined;
    const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    return c.html(LogPage({ vm: logVM(cfg, repo, ref, ofs) }));
  });

  app.notFound((c) => c.html(ErrorPage({ status: 404, message: "Not found" }), 404));

  app.onError((err, c) => {
    const status = statusForError(err);
    const message = err instanceof Error ? err.message : "Internal error";
    if (status === 500) console.error(err);
    return c.html(ErrorPage({ status, message }), status as 400 | 404 | 500);
  });

  return app;
}

const app = createApp(loadConfig());

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
