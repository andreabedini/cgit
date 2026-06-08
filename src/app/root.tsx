import { Hono } from "hono";
import type { SiteConfig } from "../config/config";
import { repolistVM } from "../data/pages";
import { RepolistPage } from "../views/default/RepolistPage";

export function createRootApp(cfg: SiteConfig) {
  const app = new Hono();
  app.get("/", (c) => c.render(<RepolistPage vm={repolistVM(cfg)} />));
  return app;
}
