import type { Repository, Reference, Commit, Signature, LogOptions, LogPage } from "../facade";
import {
  lib, ensureInit, ptrSlot, oidSlot, readPtr, cstr, check, toPtr,
  ptr, read, toArrayBuffer, CString,
} from "./libgit2";
// (oidSlot/cstr/read/toArrayBuffer/CString/Commit/Signature are used by methods
//  added in Tasks 5-7; importing them now keeps repository.ts stable across tasks.)

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

  references(): Reference[] { throw new Error("not implemented yet"); }
  log(_opts: LogOptions): LogPage { throw new Error("not implemented yet"); }
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
