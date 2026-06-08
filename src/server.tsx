import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, type SiteConfig } from "./config/config";
import { renderer } from "./views/default/renderer";
import { createRootApp } from "./app/root";
import { createRepoApp } from "./app/repo";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  app.use(renderer);

  // Infra routes are registered before the repo sub-app so requests like
  // `/healthz` or `/cgit.css` never match the `/:repo` redirect.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/terminal.min.css", serveStatic({ path: "./src/public/terminal.min.css" }));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.route("/", createRootApp(cfg));
  app.route("/", createRepoApp(cfg));

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
