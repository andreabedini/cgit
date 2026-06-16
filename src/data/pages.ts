import type { SiteConfig } from "../config/config";
import { scanRepos } from "../scan/scan";
import { openRepository, type Repository } from "../git";
import type { DiscoveredRepo } from "../scan/scan";
import { buildRepolistVM } from "../routes/repolist";
import { buildSummaryVM } from "../routes/summary";
import { buildLogVM } from "../routes/log";
import type { RepoMeta } from "../viewmodels";

export function repolistVM(cfg: SiteConfig) {
  // Numbered pagination UI is a later milestone; cap to the first page for now.
  const repos = scanRepos(cfg.scanPath).slice(0, cfg.repolistPageSize);
  const lastCommit = new Map<string, Date>();
  for (const r of repos) {
    const repo = openRepository(r.path);
    try {
      const page = repo.log({ limit: 1 });
      if (page.commits[0]) lastCommit.set(r.name, page.commits[0].author.when);
    } finally { repo.free(); }
  }
  return buildRepolistVM(repos, lastCommit);
}

export function summaryVM(repo: Repository, disc: DiscoveredRepo, cfg: SiteConfig) {
  const refs = repo.references();
  const head = repo.headRef();
  const recent = repo.log({ ref: head, limit: cfg.summaryLog }).commits;
  const readme = repo.readFileAtRef(head, "README.md");
  const about = readme ? new TextDecoder().decode(readme) : undefined;
  const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
  const cloneUrls = cfg.cloneUrlBase ? [`${cfg.cloneUrlBase.replace(/\/$/, "")}/${disc.name}.git`] : [];
  return buildSummaryVM(meta, refs, recent, about, cloneUrls, cfg.summaryBranches, cfg.summaryTags);
}

export function logVM(repo: Repository, disc: DiscoveredRepo, cfg: SiteConfig, ref: string | undefined, offset: number) {
  const head = ref ?? repo.headRef();
  const refs = repo.references();
  const limit = cfg.logPageSize;
  const page = repo.log({ ref: head, offset, limit });
  const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
  return buildLogVM(meta, head, page, refs, offset, limit);
}
