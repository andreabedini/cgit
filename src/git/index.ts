import { notFound } from "../errors";
import { DiscoveredRepo, scanRepos } from "./scan";

export * from "./facade";
export { openRepository } from "./binding/repository";

export function findRepo(scanPath: string, name: string): DiscoveredRepo {
  const repo = scanRepos(scanPath).find((r) => r.name === name);
  if (!repo) throw notFound(`Repository not found: ${name}`);
  return repo;
}
  