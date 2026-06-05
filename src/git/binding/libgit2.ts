import { dlopen, FFIType, CString, ptr, read, toArrayBuffer } from "bun:ffi";
import type { FFIFunction, Pointer } from "bun:ffi";

// At runtime bun:ffi pointers are plain JS numbers (see conventions below), but
// the `Pointer` type is branded. `toPtr` casts a number to `Pointer` at the FFI
// boundary so call sites can pass the numbers `readPtr`/`git_error_last` return.
export function toPtr(n: number): Pointer { return n as unknown as Pointer; }

// Symbol map — keep every symbol and signature exactly as defined here.
// `as const satisfies` preserves the literal FFIType values (needed for dlopen's
// conditional return-type inference) while validating the shape at compile time.
const SYMBOLS = {
  git_libgit2_init: { args: [], returns: FFIType.i32 },
  git_repository_open: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },
  git_repository_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_repository_head: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_reference_shorthand: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_reference_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_error_last: { args: [], returns: FFIType.ptr },
} as const satisfies Record<string, FFIFunction>;

// Build the ordered candidate list: env override first, then unversioned name,
// then the known versioned fallback (Linux only — darwin has a single dylib).
function candidateLibs(): string[] {
  const candidates: string[] = [];
  if (process.env.LIBGIT2_PATH) candidates.push(process.env.LIBGIT2_PATH);
  if (process.platform === "darwin") {
    candidates.push("libgit2.dylib");
  } else {
    candidates.push("libgit2.so", "libgit2.so.1.9");
  }
  return candidates;
}

function loadLib(symbols: typeof SYMBOLS): ReturnType<typeof dlopen<typeof SYMBOLS>>["symbols"] {
  const candidates = candidateLibs();
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return dlopen(candidate, symbols).symbols;
    } catch (e) {
      lastError = e;
    }
  }
  const tried = candidates.map(c => JSON.stringify(c)).join(", ");
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to load libgit2. Tried: ${tried}. Last error: ${detail}`);
}

export const lib = loadLib(SYMBOLS);

// --- FFI conventions used throughout repository.ts ---
// * Symbols returning `const char *` are declared `returns: FFIType.cstring`,
//   so Bun coerces them to a JS string automatically — use the result directly
//   (do NOT wrap in `new CString(...)`).
// * `Type **out` parameters: pass `ptr(ptrSlot())`, then read the written
//   pointer (a plain JS number) with `readPtr(slot)`. Pass that number directly
//   to any later `FFIType.ptr` argument.
// * Pass JS strings to `cstring` args via `cstr()` (NUL-terminated bytes).

export function ptrSlot(): Uint8Array { return new Uint8Array(8); }
export function oidSlot(): Uint8Array { return new Uint8Array(20); }
export function readPtr(slot: Uint8Array): number { return Number(read.ptr(toPtr(ptr(slot)), 0)); }
export function cstr(s: string): Uint8Array { return new TextEncoder().encode(s + "\0"); }

let inited = false;
export function ensureInit(): void {
  if (inited) return;
  const rc = lib.git_libgit2_init();
  if (rc < 0) throw new Error("git_libgit2_init failed");
  inited = true;
}

export function lastErrorMessage(): string {
  const errPtr = lib.git_error_last();
  if (!errPtr) return "unknown libgit2 error";
  const msgPtr = read.ptr(toPtr(Number(errPtr)), 0);
  return msgPtr ? new CString(toPtr(Number(msgPtr))).toString() : "unknown libgit2 error";
}

export class GitError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
    this.name = "GitError";
  }
}

export function check(rc: number): void {
  if (rc < 0) throw new GitError(lastErrorMessage(), rc);
}

export { CString, ptr, read, toArrayBuffer };
