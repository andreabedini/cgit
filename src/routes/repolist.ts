import type { DiscoveredRepo } from "../scan/scan";
import { formatAge } from "../format";
import type { RepolistViewModel } from "../viewmodels";

export function buildRepolistVM(
  repos: DiscoveredRepo[],
  lastCommitByName: Map<string, Date>,
  now: Date = new Date(),
): RepolistViewModel {
  return {
    repos: repos.map((r) => {
      const when = lastCommitByName.get(r.name);
      return {
        name: r.name,
        description: r.description,
        owner: r.owner,
        lastCommitAge: when ? formatAge(when, now) : undefined,
      };
    }),
  };
}
