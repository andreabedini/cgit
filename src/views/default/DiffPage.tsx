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

export function DiffPage(props: DiffProps) {
  return (
    <>
      <title>{`${props.name}: diff ${props.commit.abbrevOid}`}</title>
      <h2>{props.commit.summary}</h2>
      <p>
        <a href={commitHref(props.name, props.commit.oid)}>commit</a>
        {" \u00b7 "}
        <a href={treeHref(props.name, props.commit.oid)}>tree</a>
        {props.commit.parents.length > 1 ? " \u00b7 diff against first parent" : null}
      </p>
      {props.diff.files.length ? (
        props.diff.files.map((file) => (
          <section class="diff-file">
            <h3>
              <code>{displayPath(file)}</code>
            </h3>
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
        ))
      ) : (
        <p>No changes.</p>
      )}
    </>
  );
}
