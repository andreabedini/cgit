import type { Commit, TreeEntry } from "../../git/facade";
import { Breadcrumb } from "./Breadcrumb";
import { encodeSegments } from "./paths";
import { formatAge, initials } from "../../format";

export interface TreeProps {
  name: string;
  ref: string;
  path: string;
  entries: TreeEntry[];
  headCommit?: Commit;
  now?: Date;
}

function formatMode(mode: number): string {
  return mode.toString(8).padStart(6, "0");
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#dfa84d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#6e6a86" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path>
      <path d="M14 2v5h5"></path>
    </svg>
  );
}

export function TreePage(props: TreeProps) {
  const base = `/${encodeURIComponent(props.name)}/tree/${encodeSegments(props.ref)}`;
  const dir = props.path ? props.path + "/" : "";
  // Directories first, then everything else, each group sorted by name.
  const sorted = [...props.entries].sort(
    (a, b) =>
      (a.type === "tree" ? 0 : 1) - (b.type === "tree" ? 0 : 1) || a.name.localeCompare(b.name),
  );
  const head = props.headCommit;
  return (
    <>
      <title>{`${props.name}: ${props.path || props.ref}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <div class="cg-treecard">
        {head ? (
          <div class="cg-treehead">
            <span class="cg-avatar">{initials(head.author.name)}</span>
            <span class="who">{head.author.name}</span>
            <span class="subject">{head.summary}</span>
            <span style="flex:1"></span>
            <a class="cg-hash" href={`/${encodeURIComponent(props.name)}/commit/${encodeURIComponent(head.oid)}/`}>
              {head.abbrevOid}
            </a>
            {props.now ? <span class="age">{formatAge(head.author.when, props.now)}</span> : null}
          </div>
        ) : null}
        {sorted.map((e) => {
          const isDir = e.type === "tree";
          return (
            <a class={`cg-treerow${isDir ? " dir" : ""}`} href={`${base}/${encodeSegments(dir + e.name)}`}>
              <span class="nm">
                {isDir ? <FolderIcon /> : <FileIcon />}
                <span class="txt">{isDir ? e.name + "/" : e.name}</span>
              </span>
              <span class="mode">{formatMode(e.mode)}</span>
              <span class="size">{e.type === "blob" ? String(e.size ?? "") : "—"}</span>
            </a>
          );
        })}
      </div>
    </>
  );
}
