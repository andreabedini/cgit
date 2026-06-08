import { RepoContext, useRepo } from "./RepoContext";
import type { LogViewModel, PagerVM } from "../../viewmodels";

function Pager(props: { pager: PagerVM }) {
  const { name, ref } = useRepo();
  const base = `/${name}/log/?h=${ref}`;
  const prevOfs = Math.max(0, props.pager.offset - props.pager.limit);
  const nextOfs = props.pager.offset + props.pager.limit;
  return (
    <nav class="pager btn-group">
      {props.pager.hasPrev ? (
        <a class="btn btn-default" href={`${base}&ofs=${prevOfs}`}>
          &laquo; newer
        </a>
      ) : null}
      {props.pager.hasNext ? (
        <a class="btn btn-default" href={`${base}&ofs=${nextOfs}`}>
          older &raquo;
        </a>
      ) : null}
    </nav>
  );
}

export function LogPage(props: { vm: LogViewModel }) {
  const { vm } = props;
  return (
    <>
      <title>{`${vm.repo.name}: log`}</title>
      <RepoContext.Provider value={{ name: vm.repo.name, ref: vm.ref }}>
        <h2>
          {vm.repo.name}: log ({vm.ref})
        </h2>
        <table class="log">
          <thead>
            <tr>
              <th>Age</th>
              <th>Commit</th>
              <th>Author</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {vm.rows.map((row) => (
              <tr>
                <td>{row.ageLabel}</td>
                <td>
                  <code>{row.abbrevOid}</code> {row.subject}
                </td>
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
        <Pager pager={vm.pager} />
      </RepoContext.Provider>
    </>
  );
}
