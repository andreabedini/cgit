import type { Commit, Reference } from "../git/facade";
import {
  buildDecorationMap,
  refToVM,
  commitToLogRow,
  type SummaryViewModel,
  type RepoMeta,
} from "../viewmodels";

export function buildSummaryVM(
  repo: RepoMeta,
  refs: Reference[],
  recentCommits: Commit[],
  about: string | undefined,
  cloneUrls: string[],
  maxBranches: number,
  maxTags: number,
  now: Date = new Date(),
): SummaryViewModel {
  const decorations = buildDecorationMap(refs);
  return {
    repo,
    branches: refs.filter((r) => r.kind === "branch").slice(0, maxBranches).map(refToVM),
    tags: refs.filter((r) => r.kind === "tag").slice(0, maxTags).map(refToVM),
    recentCommits: recentCommits.map((c) => commitToLogRow(c, decorations, now)),
    cloneUrls,
    about,
  };
}
