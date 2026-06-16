import type { TreeEntry } from "../../git/facade";
import { Breadcrumb } from "./Breadcrumb";

export interface TreeProps {
  name: string;
  ref: string;
  path: string;
  entries: TreeEntry[];
}

function formatMode(mode: number): string {
  return mode.toString(8).padStart(6, "0");
}

export function TreePage(props: TreeProps) {
  const base = `/${props.name}/tree/${props.ref}`;
  const dir = props.path ? props.path + "/" : "";
  // Directories first, then everything else, each group sorted by name.
  const sorted = [...props.entries].sort(
    (a, b) =>
      (a.type === "tree" ? 0 : 1) - (b.type === "tree" ? 0 : 1) ||
      a.name.localeCompare(b.name),
  );
  return (
    <>
      <title>{`${props.name}: ${props.path || props.ref}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <table class="tree">
        <thead>
          <tr>
            <th>Mode</th>
            <th>Name</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr>
              <td>
                <code>{formatMode(e.mode)}</code>
              </td>
              <td>
                <a href={`${base}/${dir}${e.name}`}>
                  {e.type === "tree" ? e.name + "/" : e.name}
                </a>
              </td>
              <td>{e.type === "blob" ? String(e.size ?? "") : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
