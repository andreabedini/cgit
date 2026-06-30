import type { Commit, CommitDiff, DiffFile, DiffLine } from "../../git/facade";
import { encodeSegments } from "./paths";

export interface DiffProps {
  name: string;
  commit: Commit;
  diff: CommitDiff;
}

function commitHref(name: string, oid: string): string {
  return `/${encodeURIComponent(name)}/commit/${encodeURIComponent(oid)}/`;
}

function treeHref(name: string, oid: string): string {
  return `/${encodeURIComponent(name)}/tree/${encodeSegments(oid)}/`;
}

function statusLabel(file: DiffFile): string {
  switch (file.status) {
    case "added":
      return "new file";
    case "deleted":
      return "deleted file";
    case "renamed":
      return "renamed file";
    case "copied":
      return "copied file";
    case "typechange":
      return "type changed";
    default:
      return "modified file";
  }
}

function displayPath(file: DiffFile): string {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} → ${file.newPath}`;
  }
  return file.newPath ?? file.oldPath ?? "";
}

function linePrefix(line: DiffLine): string {
  if (line.type === "add") return "+";
  if (line.type === "delete") return "-";
  return " ";
}

function countLines(file: DiffFile): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") add++;
      else if (line.type === "delete") del++;
    }
  }
  return { add, del };
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"></path>
      <path d="M14 2v5h5"></path>
    </svg>
  );
}

export function DiffPage(props: DiffProps) {
  return (
    <>
      <title>{`${props.name}: diff ${props.commit.abbrevOid}`}</title>
      <div class="cg-commitcard">
        <h2>{props.commit.summary}</h2>
        <div class="cg-commit-meta">
          <span>
            <a class="cg-hash" href={commitHref(props.name, props.commit.oid)}>commit</a>
          </span>
          <span>
            <a class="cg-hash" href={treeHref(props.name, props.commit.oid)}>tree</a>
          </span>
          {props.commit.parents.length > 1 ? <span>diff against first parent</span> : null}
        </div>
      </div>
      {props.diff.files.length ? (
        props.diff.files.map((file) => {
          const { add, del } = countLines(file);
          return (
            <section class="diff-file">
              <div class="cg-diffhead">
                <FileIcon />
                {displayPath(file)}
                <span class="stat">
                  <span class="add">+{add}</span> <span class="del">-{del}</span>
                </span>
              </div>
              <p class="diff-file-meta">{statusLabel(file)}</p>
              {file.binary ? (
                <p class="binary">Binary file changed.</p>
              ) : (
                file.hunks.map((hunk) => (
                  <pre class="diff-hunk">
                    <span class="diff-line hunk">{hunk.header}</span>
                    {hunk.lines.map((line) => (
                      <span class={`diff-line ${line.type}`}>
                        {linePrefix(line)}
                        {line.content}
                      </span>
                    ))}
                  </pre>
                ))
              )}
            </section>
          );
        })
      ) : (
        <p class="cg-empty">No changes.</p>
      )}
    </>
  );
}
