export interface Signature {
  name: string;
  email: string;
  when: Date;
}

export interface Commit {
  oid: string;
  abbrevOid: string;
  author: Signature;
  committer: Signature;
  summary: string;
  message: string;
  parents: string[];
}

export type RefKind = "branch" | "tag";

export interface Reference {
  name: string;       // shorthand, e.g. "main", "v1.0"
  fullName: string;   // e.g. "refs/heads/main"
  kind: RefKind;
  targetOid: string;  // oid the ref points at directly
  commitOid: string;  // peeled commit oid (annotated tag -> its commit)
}

export interface TreeEntry {
  name: string;
  mode: number;                       // raw git filemode (octal when displayed)
  type: "blob" | "tree" | "commit";   // "commit" == submodule gitlink
  oid: string;
  size?: number;                      // present for blobs
}

export interface LogOptions {
  ref?: string;       // shorthand or full ref; defaults to HEAD
  offset?: number;
  limit: number;
}

export interface LogPage {
  commits: Commit[];
  hasMore: boolean;   // true if more commits exist past offset+limit
}

export interface Repository {
  readonly path: string;
  headRef(): string;
  references(): Reference[];
  log(opts: LogOptions): LogPage;
  /** Resolves a revision (ref or oid) to a single commit, or null if missing. */
  commit(rev: string): Commit | null;
  /** Returns null if the path (or ref) was not found in the tree. */
  readFileAtRef(ref: string, path: string): Uint8Array | null;
  /** Lists a tree at `ref`/`path`. Returns null if the path is not a tree
   *  (e.g. it is a blob) or does not exist. `path` "" means the root tree. */
  tree(ref: string, path: string): TreeEntry[] | null;
  free(): void;
}
