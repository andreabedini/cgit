import { Hono } from "hono";
import { appendTrailingSlash } from 'hono/trailing-slash'
import type { SiteConfig } from "../config/config";
import { summaryVM, logVM } from "../data/pages";
import { SummaryPage } from "../views/default/SummaryPage";
import { LogPage } from "../views/default/LogPage";

export function createRepoApp(cfg: SiteConfig) {
  const app = new Hono();
  app.use(appendTrailingSlash());

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

  return app;
}
