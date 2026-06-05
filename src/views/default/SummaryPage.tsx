import { Layout } from "./Layout";
import type { SummaryViewModel, RefVM, LogRow } from "../../viewmodels";

function RefList(props: { title: string; refs: RefVM[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
      <ul>{props.refs.map((r) => <li>{r.name} <code>{r.abbrevOid}</code></li>)}</ul>
    </section>
  );
}

function LogRows(props: { rows: LogRow[] }) {
  return (
    <table class="log">
      <tbody>
        {props.rows.map((row) => (
          <tr>
            <td>{row.ageLabel}</td>
            <td>{row.subject}</td>
            <td>{row.authorName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SummaryPage(props: { vm: SummaryViewModel }) {
  const { vm } = props;
  return (
    <Layout title={vm.repo.name} repoNav={{ name: vm.repo.name }}>
      <h2>{vm.repo.name}</h2>
      {vm.repo.description ? <p>{vm.repo.description}</p> : null}
      <RefList title="Branches" refs={vm.branches} />
      <RefList title="Tags" refs={vm.tags} />
      <section>
        <h3>Recent commits</h3>
        <LogRows rows={vm.recentCommits} />
      </section>
      {vm.cloneUrls.length ? (
        <section>
          <h3>Clone</h3>
          <ul>{vm.cloneUrls.map((u) => <li><code>{u}</code></li>)}</ul>
        </section>
      ) : null}
      {vm.about ? (
        <section id="summary">
          <h3>About</h3>
          <pre class="about">{vm.about}</pre>
        </section>
      ) : null}
    </Layout>
  );
}
