import { Layout } from "./Layout";
import type { RepolistViewModel } from "../../viewmodels";

export function RepolistPage(props: { vm: RepolistViewModel }) {
  return (
    <Layout title="Repositories">
      <table class="repolist">
        <thead>
          <tr><th>Name</th><th>Description</th><th>Owner</th><th>Idle</th></tr>
        </thead>
        <tbody>
          {props.vm.repos.map((r) => (
            <tr>
              <td><a href={`/?p=${r.name}&page=summary`}>{r.name}</a></td>
              <td>{r.description ?? ""}</td>
              <td>{r.owner ?? ""}</td>
              <td>{r.lastCommitAge ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}
