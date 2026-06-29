import type { Commit, Reference } from "../../git/facade";
import { formatAge } from "../../format";

function Pager(props: {
  name: string;
  ref: string;
  offset: number;
  limit: number;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const base = `/${props.name}/log/?h=${props.ref}`;
  const prevOfs = Math.max(0, props.offset - props.limit);
  const nextOfs = props.offset + props.limit;
  return (
    <nav class="pager btn-group">
      {props.hasPrev ? (
        <a class="btn btn-default" href={`${base}&ofs=${prevOfs}`}>
          &laquo; newer
        </a>
      ) : null}
      {props.hasNext ? (
        <a class="btn btn-default" href={`${base}&ofs=${nextOfs}`}>
          older &raquo;
        </a>
      ) : null}
    </nav>
  );
}

export interface LogProps {
  name: string;
  ref: string;
  commits: Commit[];
  decorations: Map<string, Reference[]>;
  offset: number;
  limit: number;
  hasMore: boolean;
  now: Date;
}

export function LogPage(props: LogProps) {
  return (
    <>
      <title>{`${props.name}: log`}</title>
      <h2>
        {props.name}: log ({props.ref})
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
          {props.commits.map((commit) => (
            <tr>
              <td>{formatAge(commit.author.when, props.now)}</td>
              <td>
                <a href={`/${encodeURIComponent(props.name)}/commit/${encodeURIComponent(commit.oid)}/`}>
                  <code>{commit.abbrevOid}</code> {commit.summary}
                </a>
              </td>
              <td>{commit.author.name}</td>
              <td>
                {(props.decorations.get(commit.oid) ?? []).map((d) => (
                  <span class={`ref ${d.kind}`}>{d.name}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager
        name={props.name}
        ref={props.ref}
        offset={props.offset}
        limit={props.limit}
        hasPrev={props.offset > 0}
        hasNext={props.hasMore}
      />
    </>
  );
}
