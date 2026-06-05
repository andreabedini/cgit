import type { SiteConfig } from "../config/config";
import { scanRepos } from "../scan/scan";
import { openRepository } from "../git/binding/repository";
import { notFound } from "../errors";
import { buildRepolistVM } from "./repolist";
import { buildSummaryVM } from "./summary";
import { buildLogVM } from "./log";
import type { RepoMeta } from "../viewmodels";

function findRepo(cfg: SiteConfig, name: string) {
  const repo = scanRepos(cfg.scanPath).find((r) => r.name === name);
  if (!repo) throw notFound(`Repository not found: ${name}`);
  return repo;
}

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

export function summaryVM(cfg: SiteConfig, name: string) {
  const disc = findRepo(cfg, name);
  const repo = openRepository(disc.path);
  try {
    const refs = repo.references();
    const head = repo.headRef();
    const recent = repo.log({ ref: head, limit: cfg.summaryLog }).commits;
    const readme = repo.readFileAtRef(head, "README.md");
    const about = readme ? new TextDecoder().decode(readme) : undefined;
    const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
    const cloneUrls = cfg.cloneUrlBase ? [`${cfg.cloneUrlBase.replace(/\/$/, "")}/${disc.name}.git`] : [];
    return buildSummaryVM(meta, refs, recent, about, cloneUrls, cfg.summaryBranches, cfg.summaryTags);
  } finally { repo.free(); }
}

export function logVM(cfg: SiteConfig, name: string, ref: string | undefined, offset: number) {
  const disc = findRepo(cfg, name);
  const repo = openRepository(disc.path);
  try {
    const head = ref ?? repo.headRef();
    const refs = repo.references();
    const limit = cfg.logPageSize;
    const page = repo.log({ ref: head, offset, limit });
    const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
    return buildLogVM(meta, head, page, refs, offset, limit);
  } finally { repo.free(); }
}
