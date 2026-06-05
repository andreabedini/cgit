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
  readFileAtRef(ref: string, path: string): Uint8Array | null;
  free(): void;
}
