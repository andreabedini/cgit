import { encodeSegments } from "./paths";

export function commitHref(name: string, oid: string): string {
  return `/${encodeURIComponent(name)}/commit/${encodeURIComponent(oid)}/`;
}

export function treeHref(name: string, oid: string): string {
  return `/${encodeURIComponent(name)}/tree/${encodeSegments(oid)}/`;
}
