import type { Commit, Reference } from "../../git/facade";
import { formatAge } from "../../format";
import { encodeSegments } from "./paths";

export interface CommitProps {
  name: string;
  commit: Commit;
  refs: Reference[];
  now: Date;
}

function commitHref(name: string, oid: string): string {
  return `/${encodeURIComponent(name)}/commit/${encodeURIComponent(oid)}/`;
}

export function CommitPage(props: CommitProps) {
  const treeHref = `/${encodeURIComponent(props.name)}/tree/${encodeSegments(props.commit.oid)}/`;
  return (
    <>
      <title>{`${props.name}: commit ${props.commit.abbrevOid}`}</title>
      <h2>{props.commit.summary}</h2>
      <table class="commit-meta">
        <tbody>
          <tr>
            <th>commit</th>
            <td>
              <code>{props.commit.oid}</code>
            </td>
          </tr>
          {props.refs.length ? (
            <tr>
              <th>refs</th>
              <td>
                {props.refs.map((ref) => (
                  <span class={`ref ${ref.kind}`}>{ref.name}</span>
                ))}
              </td>
            </tr>
          ) : null}
          <tr>
            <th>author</th>
            <td>
              {props.commit.author.name} &lt;{props.commit.author.email}&gt; ({formatAge(props.commit.author.when, props.now)})
            </td>
          </tr>
          <tr>
            <th>committer</th>
            <td>
              {props.commit.committer.name} &lt;{props.commit.committer.email}&gt; ({formatAge(props.commit.committer.when, props.now)})
            </td>
          </tr>
          {props.commit.parents.length ? (
            <tr>
              <th>parents</th>
              <td>
                {props.commit.parents.map((parent, i) => (
                  <>
                    {i ? " " : null}
                    <a href={commitHref(props.name, parent)}>
                      <code>{parent.slice(0, 10)}</code>
                    </a>
                  </>
                ))}
              </td>
            </tr>
          ) : null}
          <tr>
            <th>tree</th>
            <td>
              <a href={treeHref}>browse files</a>
            </td>
          </tr>
        </tbody>
      </table>
      <pre class="about">{props.commit.message}</pre>
    </>
  );
}
