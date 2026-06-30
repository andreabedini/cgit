import type { Commit, Reference } from "../../git/facade";
import { formatAge, initials } from "../../format";

function Pager(props: { name: string; ref: string; offset: number; limit: number; hasPrev: boolean; hasNext: boolean }) {
  const base = `/${props.name}/log/?h=${props.ref}`;
  const prevOfs = Math.max(0, props.offset - props.limit);
  const nextOfs = props.offset + props.limit;
  return (
    <nav class="cg-pager">
      {props.hasPrev ? (
        <a class="cg-btn" href={`${base}&ofs=${prevOfs}`}>
          &laquo; newer
        </a>
      ) : null}
      {props.hasNext ? (
        <a class="cg-btn" href={`${base}&ofs=${nextOfs}`}>
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
      <div class="cg-logcard">
        <div class="cg-loghead">
          <span>commit</span>
          <span>subject</span>
          <span>author</span>
        </div>
        {props.commits.map((commit) => (
          <a class="cg-logrow" href={`/${encodeURIComponent(props.name)}/commit/${encodeURIComponent(commit.oid)}/`}>
            <span class="cg-hash">{commit.abbrevOid}</span>
            <span class="subjcell">
              <span class="subject">{commit.summary}</span>
              {(props.decorations.get(commit.oid) ?? []).map((d) => (
                <span class={`ref ${d.kind}`}>{d.name}</span>
              ))}
            </span>
            <span class="cg-author">
              <span class="cg-avatar">{initials(commit.author.name)}</span>
              <span class="who">
                <span class="nm">{commit.author.name}</span>
                <span class="ts">{formatAge(commit.author.when, props.now)}</span>
              </span>
            </span>
          </a>
        ))}
      </div>
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
