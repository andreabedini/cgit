import { Hono } from "hono";
import type { AppEnv } from "../config/config";
import { repolistVM } from "../data/pages";
import { RepolistPage } from "../views/default/RepolistPage";

export function createRootApp() {
  const app = new Hono<AppEnv>();
  app.get("/", (c) => c.render(<RepolistPage vm={repolistVM(c.env)} />));
  return app;
}
