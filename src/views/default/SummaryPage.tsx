import type { Commit, Reference } from "../../git/facade";
import { abbrevOid, formatAge } from "../../format";

function RefList(props: { title: string; refs: Reference[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
      <ul>
        {props.refs.map((r) => (
          <li>
            {r.name} <code>{abbrevOid(r.commitOid)}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface SummaryProps {
  name: string;
  description?: string;
  branches: Reference[];
  tags: Reference[];
  recentCommits: Commit[];
  cloneUrls: string[];
  about?: string;
  now: Date;
}

export function SummaryPage(props: SummaryProps) {
  return (
    <>
      <title>{props.name}</title>
      <h2>{props.name}</h2>
      {props.description ? <p>{props.description}</p> : null}
      <RefList title="Branches" refs={props.branches} />
      <RefList title="Tags" refs={props.tags} />
      <section>
        <h3>Recent commits</h3>
        <table class="log">
          <tbody>
            {props.recentCommits.map((commit) => (
              <tr>
                <td>{formatAge(commit.author.when, props.now)}</td>
                <td>{commit.summary}</td>
                <td>{commit.author.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {props.cloneUrls.length ? (
        <section>
          <h3>Clone</h3>
          <ul>
            {props.cloneUrls.map((u) => (
              <li>
                <code>{u}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {props.about ? (
        <section id="summary">
          <h3>About</h3>
          <pre class="about">{props.about}</pre>
        </section>
      ) : null}
    </>
  );
}
