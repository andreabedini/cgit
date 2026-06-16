import { Hono } from "hono";
import { appendTrailingSlash } from "hono/trailing-slash";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../config/config";
import { scanRepos, type DiscoveredRepo } from "../scan/scan";
import { openRepository, type Repository } from "../git";
import { notFound } from "../errors";
import { summaryVM, logVM } from "../data/pages";
import { SummaryPage } from "../views/default/SummaryPage";
import { LogPage } from "../views/default/LogPage";

export type RepoEnv = AppEnv & { Variables: { disc: DiscoveredRepo; repo: Repository } };

function findRepo(scanPath: string, name: string): DiscoveredRepo {
  const repo = scanRepos(scanPath).find((r) => r.name === name);
  if (!repo) throw notFound(`Repository not found: ${name}`);
  return repo;
}

// Resolve `/:repo/` to a discovered repo + an open libgit2 handle, exposed to
// downstream handlers via context. Owns the repo's lifecycle: it frees the
// handle once the handler has run, so per-page data functions never open or
// free repos themselves.
export function resolveRepo(): MiddlewareHandler<RepoEnv> {
  return async (c, next) => {
    // Bare `/:repo` is handled by appendTrailingSlash (it 404s then redirects);
    // skip opening a repo we would only throw away on the redirect.
    if (!c.req.path.endsWith("/")) return next();
    const disc = findRepo(c.env.scanPath, c.req.param("repo")!); // present: matched by /:repo/*
    const repo = openRepository(disc.path);
    c.set("disc", disc);
    c.set("repo", repo);
    try {
      await next();
    } finally {
      repo.free();
    }
  };
}

export function createRepoApp() {
  const app = new Hono<RepoEnv>();
  app.use(appendTrailingSlash());
  app.use("/:repo/*", resolveRepo());

  app.get("/:repo/", (c) =>
    c.render(<SummaryPage vm={summaryVM(c.get("repo"), c.get("disc"), c.env)} />, {
      repoNav: { name: c.get("disc").name, active: "summary" },
    }),
  );

  app.get("/:repo/log/", (c) => {
    const ref = c.req.query("h") || undefined;
    const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    const vm = logVM(c.get("repo"), c.get("disc"), c.env, ref, ofs);
    return c.render(<LogPage vm={vm} />, {
      repoNav: { name: c.get("disc").name, active: "log" },
    });
  });

  return app;
}
