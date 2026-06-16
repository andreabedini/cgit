import type { DiscoveredRepo } from "../../git/scan";
import { formatAge } from "../../format";

export interface RepoListEntry {
  repo: DiscoveredRepo;
  lastCommit?: Date;
}

export function RepolistPage(props: { entries: RepoListEntry[]; now: Date }) {
  return (
    <>
      <title>Repositories</title>
      <table class="repolist">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Owner</th>
            <th>Idle</th>
          </tr>
        </thead>
        <tbody>
          {props.entries.map(({ repo, lastCommit }) => (
            <tr>
              <td>
                <a href={`/${repo.name}/`}>{repo.name}</a>
              </td>
              <td>{repo.description ?? ""}</td>
              <td>{repo.owner ?? ""}</td>
              <td>{lastCommit ? formatAge(lastCommit, props.now) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
