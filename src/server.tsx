import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, type SiteConfig } from "./config/config";
import { renderer } from "./views/default/renderer";
import { repolistVM, summaryVM, logVM } from "./routes/render";
import { RepolistPage } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";
import { LogPage } from "./views/default/LogPage";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  // Layout middleware first so c.render is available to every handler below
  // (including notFound/onError).
  app.use(renderer);

  // Infra routes are registered before the `/:repo` routes so requests like
  // `/healthz` or `/cgit.css` match here and never look like a repo name.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/terminal.min.css", serveStatic({ path: "./src/public/terminal.min.css" }));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.get("/", (c) => c.render(<RepolistPage vm={repolistVM(cfg)} />));

  // Canonical pages use trailing slashes; redirect the bare forms to them.
  app.get("/:repo", (c) => c.redirect(`/${c.req.param("repo")}/`, 301));
  app.get("/:repo/log", (c) => c.redirect(`/${c.req.param("repo")}/log/`, 301));

  app.get("/:repo/", (c) => {
    const vm = summaryVM(cfg, c.req.param("repo"));
    return c.render(<SummaryPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "summary" },
    });
  });

  app.get("/:repo/log/", (c) => {
    const repo = c.req.param("repo");
    const ref = c.req.query("h") || undefined;
    const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    const vm = logVM(cfg, repo, ref, ofs);
    return c.render(<LogPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "log" },
    });
  });

  app.notFound((c) => {
    c.status(404);
    return c.render(<ErrorPage status={404} message="Not found" />);
  });

  app.onError((err, c) => {
    const status = statusForError(err);
    const message = err instanceof Error ? err.message : "Internal error";
    if (status === 500) console.error(err);
    c.status(status as 400 | 404 | 500);
    return c.render(<ErrorPage status={status} message={message} />);
  });

  return app;
}

const app = createApp(loadConfig());

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
