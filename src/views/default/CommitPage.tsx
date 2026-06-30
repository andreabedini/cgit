import type { Commit, Reference } from "../../git/facade";
import { formatAge, initials } from "../../format";
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
  const diffHref = `/${encodeURIComponent(props.name)}/diff/${encodeURIComponent(props.commit.oid)}/`;
  const { commit } = props;
  return (
    <>
      <title>{`${props.name}: commit ${commit.abbrevOid}`}</title>
      <div class="cg-commitcard">
        <h2>{commit.summary}</h2>
        <div class="cg-commit-author">
          <span class="cg-avatar">{initials(commit.author.name)}</span>
          <span class="nm">{commit.author.name}</span>
          <span class="email">&lt;{commit.author.email}&gt;</span>
          <span class="when">authored {formatAge(commit.author.when, props.now)}</span>
          {props.refs.map((ref) => (
            <span class={`ref ${ref.kind}`}>{ref.name}</span>
          ))}
        </div>
        <div class="cg-commit-meta">
          <span>
            commit <span class="cg-hash">{commit.abbrevOid}</span>
          </span>
          {commit.parents.length ? (
            <span>
              parent{" "}
              {commit.parents.map((parent, i) => (
                <>
                  {i ? " " : null}
                  <a class="cg-hash" href={commitHref(props.name, parent)}>
                    {parent.slice(0, 10)}
                  </a>
                </>
              ))}
            </span>
          ) : null}
          <span>
            tree <a class="cg-hash" href={treeHref}>browse files</a>
          </span>
          <span style="margin-left:auto">
            <a class="cg-hash" href={diffHref}>view diff &rarr;</a>
          </span>
        </div>
      </div>
      <pre class="cg-commit-msg">{commit.message}</pre>
    </>
  );
}
