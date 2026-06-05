import { Layout } from "./Layout";
import type { LogViewModel } from "../../viewmodels";

export function LogPage(props: { vm: LogViewModel }) {
  const { vm } = props;
  const base = `/${vm.repo.name}/log/?h=${vm.ref}`;
  const prevOfs = Math.max(0, vm.pager.offset - vm.pager.limit);
  const nextOfs = vm.pager.offset + vm.pager.limit;
  return (
    <Layout title={`${vm.repo.name}: log`} repoNav={{ name: vm.repo.name, active: "log" }}>
      <h2>{vm.repo.name}: log ({vm.ref})</h2>
      <table class="log">
        <thead><tr><th>Age</th><th>Commit</th><th>Author</th><th></th></tr></thead>
        <tbody>
          {vm.rows.map((row) => (
            <tr>
              <td>{row.ageLabel}</td>
              <td><code>{row.abbrevOid}</code> {row.subject}</td>
              <td>{row.authorName}</td>
              <td>
                {row.decorations.map((d) => (
                  <span class={`ref ${d.kind}`}>{d.name}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav class="pager btn-group">
        {vm.pager.hasPrev ? <a class="btn btn-default" href={`${base}&ofs=${prevOfs}`}>&laquo; newer</a> : null}
        {vm.pager.hasNext ? <a class="btn btn-default" href={`${base}&ofs=${nextOfs}`}>older &raquo;</a> : null}
      </nav>
    </Layout>
  );
}
