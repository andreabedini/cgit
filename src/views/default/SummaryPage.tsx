import type { Commit, Reference } from "../../git/facade";
import { abbrevOid, formatAge } from "../../format";

function RefList(props: { name: string; title: string; refs: Reference[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
      <ul>
        {props.refs.map((r) => (
          <li>
            {r.name}{" "}
            <a href={`/${encodeURIComponent(props.name)}/commit/${encodeURIComponent(r.commitOid)}/`}>
              <code>{abbrevOid(r.commitOid)}</code>
            </a>
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
      <RefList name={props.name} title="Branches" refs={props.branches} />
      <RefList name={props.name} title="Tags" refs={props.tags} />
      <section>
        <h3>Recent commits</h3>
        <table class="log">
          <tbody>
            {props.recentCommits.map((commit) => (
              <tr>
                <td>{formatAge(commit.author.when, props.now)}</td>
                <td>
                  <a href={`/${encodeURIComponent(props.name)}/commit/${encodeURIComponent(commit.oid)}/`}>
                    {commit.summary}
                  </a>
                </td>
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
