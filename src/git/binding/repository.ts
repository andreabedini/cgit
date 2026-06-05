import type { Repository, Reference, Commit, Signature, LogOptions, LogPage } from "../facade";
import {
  lib, ensureInit, ptrSlot, oidSlot, readPtr, cstr, check, toPtr,
  ptr, read, toArrayBuffer, CString,
} from "./libgit2";
// (oidSlot/cstr/read/toArrayBuffer/CString/Commit/Signature are used by methods
//  added in Tasks 5-7; importing them now keeps repository.ts stable across tasks.)

const GIT_OBJECT_COMMIT = 1;
const GIT_SORT_TIME = 2;
const GIT_SORT_TOPOLOGICAL = 1;

class Repo implements Repository {
  constructor(readonly path: string, private handle: number) {}

  headRef(): string {
    const slot = ptrSlot();
    check(lib.git_repository_head(toPtr(ptr(slot)), toPtr(this.handle)));
    const refPtr = readPtr(slot);
    try {
      // bun:ffi may return a CString (boxed String) for `returns: cstring`;
      // normalize to a primitive JS string.
      return String(lib.git_reference_shorthand(toPtr(refPtr)));
    } finally {
      lib.git_reference_free(toPtr(refPtr));
    }
  }

  references(): Reference[] {
    const iterSlot = ptrSlot();
    check(lib.git_reference_iterator_new(toPtr(ptr(iterSlot)), toPtr(this.handle)));
    const iter = readPtr(iterSlot);
    const refs: Reference[] = [];
    try {
      const refSlot = ptrSlot();
      while (true) {
        const rc = lib.git_reference_next(toPtr(ptr(refSlot)), toPtr(iter));
        if (rc === -31 /* GIT_ITEROVER */) break;
        check(rc);
        const refPtr = readPtr(refSlot);
        try {
          const fullName = String(lib.git_reference_name(toPtr(refPtr)));
          const isBranch = lib.git_reference_is_branch(toPtr(refPtr)) === 1;
          const isTag = lib.git_reference_is_tag(toPtr(refPtr)) === 1;
          if (!isBranch && !isTag) continue; // skip HEAD, notes, etc.
          const name = fullName.replace(/^refs\/(heads|tags)\//, "");
          const commitOid = this.peelToCommitOid(refPtr);
          const targetOid = this.directTargetOid(refPtr) ?? commitOid;
          refs.push({
            name,
            fullName,
            kind: isBranch ? "branch" : "tag",
            targetOid,
            commitOid,
          });
        } finally {
          lib.git_reference_free(toPtr(refPtr));
        }
      }
    } finally {
      lib.git_reference_iterator_free(toPtr(iter));
    }
    return refs;
  }

  private peelToCommitOid(refPtr: number): string {
    const objSlot = ptrSlot();
    check(lib.git_reference_peel(toPtr(ptr(objSlot)), toPtr(refPtr), GIT_OBJECT_COMMIT));
    const obj = readPtr(objSlot);
    try {
      const oidPtr = Number(lib.git_object_id(toPtr(obj)));
      return String(lib.git_oid_tostr_s(toPtr(oidPtr)));
    } finally {
      lib.git_object_free(toPtr(obj));
    }
  }

  private directTargetOid(refPtr: number): string | null {
    const oidPtr = Number(lib.git_reference_target(toPtr(refPtr)));
    return oidPtr ? String(lib.git_oid_tostr_s(toPtr(oidPtr))) : null;
  }

  log(opts: LogOptions): LogPage {
    const offset = opts.offset ?? 0;
    const limit = opts.limit;
    const walkSlot = ptrSlot();
    check(lib.git_revwalk_new(toPtr(ptr(walkSlot)), toPtr(this.handle)));
    const walk = readPtr(walkSlot);
    try {
      lib.git_revwalk_sorting(toPtr(walk), GIT_SORT_TOPOLOGICAL | GIT_SORT_TIME);
      if (opts.ref) {
        const full = opts.ref.startsWith("refs/") ? opts.ref : `refs/heads/${opts.ref}`;
        check(lib.git_revwalk_push_ref(toPtr(walk), cstr(full)));
      } else {
        check(lib.git_revwalk_push_head(toPtr(walk)));
      }
      const commits: Commit[] = [];
      const oid = oidSlot();
      let index = 0;
      let hasMore = false;
      while (true) {
        const rc = lib.git_revwalk_next(toPtr(ptr(oid)), toPtr(walk));
        if (rc === -31 /* GIT_ITEROVER */) break;
        check(rc);
        if (index < offset) { index++; continue; }
        if (commits.length >= limit) { hasMore = true; break; }
        commits.push(this.readCommit(oid));
        index++;
      }
      return { commits, hasMore };
    } finally {
      lib.git_revwalk_free(toPtr(walk));
    }
  }

  private readCommit(oidBytes: Uint8Array): Commit {
    const slot = ptrSlot();
    check(lib.git_commit_lookup(toPtr(ptr(slot)), toPtr(this.handle), toPtr(ptr(oidBytes))));
    const commit = readPtr(slot);
    try {
      const oid = Buffer.from(oidBytes).toString("hex");
      const summary = String(lib.git_commit_summary(toPtr(commit)));
      const message = String(lib.git_commit_message(toPtr(commit)));
      const author = this.readSignature(Number(lib.git_commit_author(toPtr(commit))));
      const committer = this.readSignature(Number(lib.git_commit_committer(toPtr(commit))));
      const parents: string[] = [];
      const pc = lib.git_commit_parentcount(toPtr(commit));
      for (let i = 0; i < pc; i++) {
        const pid = Number(lib.git_commit_parent_id(toPtr(commit), i));
        parents.push(String(lib.git_oid_tostr_s(toPtr(pid))));
      }
      return { oid, abbrevOid: oid.slice(0, 10), author, committer, summary, message, parents };
    } finally {
      lib.git_commit_free(toPtr(commit));
    }
  }

  // git_commit_author/committer return a `const git_signature *` with layout
  // { char *name; char *email; git_time { git_time_t time(i64); int offset; char sign; } }.
  // Read name at offset 0, email at offset 8, time (seconds since epoch) at offset 16.
  private readSignature(sigPtr: number): Signature {
    const namePtr = Number(read.ptr(toPtr(sigPtr), 0));
    const emailPtr = Number(read.ptr(toPtr(sigPtr), 8));
    const timeSecs = read.i64(toPtr(sigPtr), 16);
    return {
      name: namePtr ? new CString(toPtr(namePtr)).toString() : "",
      email: emailPtr ? new CString(toPtr(emailPtr)).toString() : "",
      when: new Date(Number(timeSecs) * 1000),
    };
  }

  readFileAtRef(_ref: string, _path: string): Uint8Array | null {
    throw new Error("not implemented yet");
  }

  free(): void {
    if (this.handle) { // 0 = already freed (libgit2 uses 0 as the null-pointer sentinel)
      lib.git_repository_free(toPtr(this.handle));
      this.handle = 0;
    }
  }
}

export function openRepository(path: string): Repository {
  ensureInit();
  const slot = ptrSlot();
  check(lib.git_repository_open(toPtr(ptr(slot)), cstr(path)));
  return new Repo(path, readPtr(slot));
}
