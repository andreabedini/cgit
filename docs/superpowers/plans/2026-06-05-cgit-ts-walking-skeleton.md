# cgit-ts Walking Skeleton (M1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript/Bun walking skeleton of a cgit successor that discovers Git repositories and serves three pages — repolist, summary, and log — end-to-end.

**Architecture:** Strict downward layering. Hono handlers parse a request, call a typed libgit2 **facade** (the only caller of the binding), assemble a plain **ViewModel**, and pass it to a pure **TSX view** (`ViewModel → HTML`). No raw libgit2 pointers escape `git/`; no HTML strings exist outside `views/`. No caching and no plugin system in M1, but the `handler → ViewModel → view` seam is designed so both drop in additively later.

**Tech Stack:** Bun 1.3.14, Hono (HTTP + JSX SSR), TypeScript, libgit2 1.9.3 (behind a facade; binding chosen by a spike), Bun's built-in test runner.

**Reference spec:** `docs/superpowers/specs/2026-06-05-cgit-ts-walking-skeleton-design.md`

---

## File Structure

All new code lives under `ts/`. The existing C cgit and `git/` submodule are untouched.

| File | Responsibility |
|---|---|
| `ts/package.json`, `ts/tsconfig.json` | Bun project + TS/JSX config |
| `ts/src/format.ts` | Pure helpers: `formatAge`, `abbrevOid` |
| `ts/src/config/config.ts` | `SiteConfig` type + `loadConfig(env)` |
| `ts/src/scan/scan.ts` | `DiscoveredRepo` + `scanRepos(root)` |
| `ts/src/git/facade.ts` | Interfaces: `Git`, `Repository`, `Reference`, `Commit`, `Signature`, `LogPage`, `LogOptions` |
| `ts/src/git/binding/libgit2.ts` | Raw `bun:ffi` symbol declarations for libgit2 |
| `ts/src/git/binding/repository.ts` | `Repository`/`Git` implementation over the raw binding |
| `ts/src/viewmodels.ts` | All ViewModel types + decoration helper |
| `ts/src/views/default/Layout.tsx` | Page chrome (header/nav/footer) + CSS link |
| `ts/src/views/default/RepolistPage.tsx` | Repolist view |
| `ts/src/views/default/SummaryPage.tsx` | Summary view |
| `ts/src/views/default/LogPage.tsx` | Log view |
| `ts/src/views/default/ErrorPage.tsx` | 400/404/500 view |
| `ts/src/routes/repolist.ts` | `buildRepolistVM` + `handleRepolist` |
| `ts/src/routes/summary.ts` | `buildSummaryVM` + `handleSummary` |
| `ts/src/routes/log.ts` | `buildLogVM` + `handleLog` |
| `ts/src/errors.ts` | Typed error kinds + HTTP mapping |
| `ts/src/server.ts` | Hono app, dispatch, static CSS, `Bun.serve` |
| `ts/src/public/cgit.css` | Static stylesheet |
| `ts/tests/fixtures/repo.ts` | `createFixtureRepo()` test helper |
| `ts/tests/*.test.ts` | Per-module tests |

---

## Task 1: Project scaffold

**Files:**
- Create: `ts/package.json`
- Create: `ts/tsconfig.json`
- Create: `ts/src/server.ts`
- Test: `ts/tests/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/smoke.test.ts`:
```ts
import { test, expect } from "bun:test";
import app from "../src/server";

test("server responds 200 on /healthz", async () => {
  const res = await app.request("/healthz");
  expect(res.status).toBe(200);
  expect(await res.text()).toBe("ok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/smoke.test.ts`
Expected: FAIL — cannot resolve `../src/server`.

- [ ] **Step 3: Create project files**

`ts/package.json`:
```json
{
  "name": "cgit-ts",
  "module": "src/server.ts",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "bun run src/server.ts",
    "test": "bun test"
  },
  "dependencies": {
    "hono": "^4.6.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

`ts/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["bun-types"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  }
}
```

`ts/src/server.ts`:
```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (c) => c.text("ok"));

export default app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`cgit-ts listening on :${port}`);
}
```

- [ ] **Step 4: Install deps and run test to verify it passes**

Run: `cd ts && bun install && bun test tests/smoke.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/package.json ts/tsconfig.json ts/src/server.ts ts/tests/smoke.test.ts ts/bun.lock
git commit -m "feat(ts): project scaffold with Hono healthz"
```

---

## Task 2: Format helpers

**Files:**
- Create: `ts/src/format.ts`
- Test: `ts/tests/format.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/format.test.ts`:
```ts
import { test, expect } from "bun:test";
import { formatAge, abbrevOid } from "../src/format";

const now = new Date("2026-06-05T12:00:00Z");

test("formatAge: seconds", () => {
  expect(formatAge(new Date("2026-06-05T11:59:30Z"), now)).toBe("30 seconds ago");
});
test("formatAge: minutes", () => {
  expect(formatAge(new Date("2026-06-05T11:55:00Z"), now)).toBe("5 minutes ago");
});
test("formatAge: hours", () => {
  expect(formatAge(new Date("2026-06-05T09:00:00Z"), now)).toBe("3 hours ago");
});
test("formatAge: days", () => {
  expect(formatAge(new Date("2026-06-03T12:00:00Z"), now)).toBe("2 days ago");
});
test("formatAge: singular", () => {
  expect(formatAge(new Date("2026-06-04T12:00:00Z"), now)).toBe("1 day ago");
});
test("abbrevOid: first 10 chars", () => {
  expect(abbrevOid("0123456789abcdef")).toBe("0123456789");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/format.test.ts`
Expected: FAIL — cannot resolve `../src/format`.

- [ ] **Step 3: Write minimal implementation**

`ts/src/format.ts`:
```ts
export function abbrevOid(oid: string): string {
  return oid.slice(0, 10);
}

const UNITS: [label: string, seconds: number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function formatAge(when: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  for (const [label, unitSecs] of UNITS) {
    const n = Math.floor(secs / unitSecs);
    if (n >= 1) return `${n} ${label}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/format.test.ts`
Expected: PASS (6 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/src/format.ts ts/tests/format.test.ts
git commit -m "feat(ts): formatAge and abbrevOid helpers"
```

---

## Task 3: Test fixture repo helper

**Files:**
- Create: `ts/tests/fixtures/repo.ts`
- Test: `ts/tests/fixtures/repo.test.ts`

This helper shells out to the real `git` binary to build a deterministic repo in a temp dir, mirroring how cgit's own suite constructs throwaway repos. Later git-facade tasks consume it.

- [ ] **Step 1: Write the failing test**

`ts/tests/fixtures/repo.test.ts`:
```ts
import { test, expect, afterAll } from "bun:test";
import { existsSync } from "node:fs";
import { createFixtureRepo, type FixtureRepo } from "./repo";

let fixture: FixtureRepo;

test("createFixtureRepo builds a repo with known structure", async () => {
  fixture = await createFixtureRepo();
  expect(existsSync(`${fixture.path}/HEAD`)).toBe(true); // bare repo
  expect(fixture.commitSubjects.length).toBeGreaterThanOrEqual(3);
  expect(fixture.branches).toContain("main");
  expect(fixture.tags).toContain("v1.0");
});

afterAll(() => fixture?.cleanup());
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/fixtures/repo.test.ts`
Expected: FAIL — cannot resolve `./repo`.

- [ ] **Step 3: Write the helper**

`ts/tests/fixtures/repo.ts`:
```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FixtureRepo {
  path: string;            // path to the bare repo
  commitSubjects: string[]; // newest-first
  branches: string[];
  tags: string[];
  cleanup: () => void;
}

async function run(cwd: string, ...args: string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test Author",
      GIT_AUTHOR_EMAIL: "author@example.com",
      GIT_AUTHOR_DATE: "2026-06-01T10:00:00Z",
      GIT_COMMITTER_NAME: "Test Author",
      GIT_COMMITTER_EMAIL: "author@example.com",
      GIT_COMMITTER_DATE: "2026-06-01T10:00:00Z",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${await new Response(proc.stderr).text()}`);
  }
}

export async function createFixtureRepo(): Promise<FixtureRepo> {
  const root = mkdtempSync(join(tmpdir(), "cgit-ts-fixture-"));
  const work = join(root, "work");
  const bare = join(root, "repo.git");

  await run(root, "init", "-q", "-b", "main", work);
  await Bun.write(join(work, "README.md"), "# Fixture\n\nHello world.\n");
  await run(work, "add", "README.md");
  await run(work, "commit", "-q", "-m", "Add README");
  await Bun.write(join(work, "a.txt"), "first\n");
  await run(work, "add", "a.txt");
  await run(work, "commit", "-q", "-m", "Add a.txt");
  await run(work, "tag", "v1.0");
  await Bun.write(join(work, "b.txt"), "second\n");
  await run(work, "add", "b.txt");
  await run(work, "commit", "-q", "-m", "Add b.txt");

  // Publish to a bare repo (what the server actually serves).
  await run(root, "clone", "-q", "--bare", work, bare);

  const cleanup = () => rmSync(root, { recursive: true, force: true });
  return {
    path: bare,
    commitSubjects: ["Add b.txt", "Add a.txt", "Add README"],
    branches: ["main"],
    tags: ["v1.0"],
    cleanup,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/fixtures/repo.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/tests/fixtures/repo.ts ts/tests/fixtures/repo.test.ts
git commit -m "test(ts): deterministic fixture repo helper"
```

---

## Task 4: Git facade interface + binding spike gate (open + HEAD)

**Files:**
- Create: `ts/src/git/facade.ts`
- Create: `ts/src/git/binding/libgit2.ts`
- Create: `ts/src/git/binding/repository.ts`
- Test: `ts/tests/git/open.test.ts`

**SPIKE NOTE — read before implementing.** This task is the binding decision gate. The acceptance test below is binding-agnostic: it must pass via *whichever* binding you adopt. Evaluate options in priority order and stop at the first that makes the test pass cleanly: (1) an existing Bun-FFI libgit2 package; (2) a Node N-API libgit2 binding under Bun's Node compat; (3) hand-rolled `bun:ffi` against system `libgit2.so.1.9`. The implementation shown below is the **hand-rolled `bun:ffi` reference** (option 3, guaranteed available against libgit2 1.9.3). If you adopt a package instead, keep `facade.ts` and the test unchanged and implement `repository.ts` against that package's API. **Verify all `bun:ffi` marshalling (out-pointers, `CString`, `read.ptr`) against the live `bun:ffi` docs as you go — the TDD loop is there to catch marshalling mistakes.** Record the chosen option and why in a one-paragraph note appended to the spec file before committing.

- [ ] **Step 1: Write the failing test**

`ts/tests/git/open.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("openRepository + headRef", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.path).toBe(fixture.path);
    expect(repo.headRef()).toBe("main");
  } finally {
    repo.free();
  }
});

test("openRepository throws NotFound for a non-repo path", () => {
  expect(() => openRepository("/definitely/not/a/repo")).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/git/open.test.ts`
Expected: FAIL — cannot resolve `../../src/git/binding/repository`.

- [ ] **Step 3: Define the facade interface**

`ts/src/git/facade.ts`:
```ts
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
```

- [ ] **Step 4: Write the raw FFI binding (open + HEAD subset)**

`ts/src/git/binding/libgit2.ts`:
```ts
import { dlopen, FFIType, CString, ptr, read, toArrayBuffer } from "bun:ffi";

// libgit2 1.9.x runtime soname. Override with LIBGIT2_PATH if needed.
const LIB = process.env.LIBGIT2_PATH ??
  (process.platform === "darwin" ? "libgit2.dylib" : "libgit2.so.1.9");

export const lib = dlopen(LIB, {
  git_libgit2_init: { args: [], returns: FFIType.i32 },
  git_repository_open: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },
  git_repository_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_repository_head: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_reference_shorthand: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_reference_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_error_last: { args: [], returns: FFIType.ptr },
}).symbols;

// --- FFI conventions used throughout repository.ts ---
// * Symbols returning `const char *` are declared `returns: FFIType.cstring`,
//   so Bun coerces them to a JS string automatically — use the result directly
//   (do NOT wrap in `new CString(...)`).
// * `Type **out` parameters: pass `ptr(ptrSlot())`, then read the written
//   pointer (a plain JS number) with `readPtr(slot)`. Pass that number directly
//   to any later `FFIType.ptr` argument.
// * Pass JS strings to `cstring` args via `cstr()` (NUL-terminated bytes).

// 8-byte slot to receive a pointer-typed out parameter.
export function ptrSlot(): Uint8Array { return new Uint8Array(8); }
// 20-byte slot to receive a raw git_oid out parameter (e.g. git_revwalk_next).
export function oidSlot(): Uint8Array { return new Uint8Array(20); }
// Read the pointer value (as a number) written into an out-slot.
export function readPtr(slot: Uint8Array): number { return Number(read.ptr(ptr(slot), 0)); }
// Encode a JS string as NUL-terminated bytes for a `cstring` argument.
export function cstr(s: string): Uint8Array { return new TextEncoder().encode(s + "\0"); }

// One-time global init.
let inited = false;
export function ensureInit(): void {
  if (inited) return;
  const rc = lib.git_libgit2_init();
  if (rc < 0) throw new Error("git_libgit2_init failed");
  inited = true;
}

// git_error_last() returns `const git_error { char *message; int klass; }`.
// message is the first field -> read the pointer at offset 0 and decode it.
export function lastErrorMessage(): string {
  const errPtr = lib.git_error_last();
  if (!errPtr) return "unknown libgit2 error";
  const msgPtr = read.ptr(Number(errPtr), 0);
  return msgPtr ? new CString(Number(msgPtr)).toString() : "unknown libgit2 error";
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
```

- [ ] **Step 5: Implement the facade over the binding (open + HEAD)**

`ts/src/git/binding/repository.ts`:
```ts
import type { Repository, Reference, Commit, Signature, LogOptions, LogPage } from "../facade";
import {
  lib, ensureInit, ptrSlot, oidSlot, readPtr, cstr, check,
  ptr, read, toArrayBuffer, CString,
} from "./libgit2";
// (oidSlot/cstr/read/toArrayBuffer/CString/Commit/Signature are used by methods
//  added in Tasks 5–7; importing them now keeps repository.ts stable across tasks.)

class Repo implements Repository {
  constructor(readonly path: string, private handle: number) {}

  headRef(): string {
    const slot = ptrSlot();
    check(lib.git_repository_head(ptr(slot), this.handle));
    const refPtr = readPtr(slot);
    try {
      return lib.git_reference_shorthand(refPtr) as string;
    } finally {
      lib.git_reference_free(refPtr);
    }
  }

  references(): Reference[] { throw new Error("not implemented yet"); }
  log(_opts: LogOptions): LogPage { throw new Error("not implemented yet"); }
  readFileAtRef(_ref: string, _path: string): Uint8Array | null {
    throw new Error("not implemented yet");
  }

  free(): void {
    if (this.handle) {
      lib.git_repository_free(this.handle);
      this.handle = 0;
    }
  }
}

export function openRepository(path: string): Repository {
  ensureInit();
  const slot = ptrSlot();
  check(lib.git_repository_open(ptr(slot), cstr(path)));
  return new Repo(path, readPtr(slot));
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd ts && bun test tests/git/open.test.ts`
Expected: PASS (2 pass). If FFI marshalling errors appear, fix against the `bun:ffi` docs — the behavior contract is fixed by the test.

- [ ] **Step 7: Record the binding decision and commit**

Append a one-paragraph "Binding decision" note to the spec file documenting which option you adopted and why.

```bash
git add ts/src/git ts/tests/git/open.test.ts docs/superpowers/specs/2026-06-05-cgit-ts-walking-skeleton-design.md
git commit -m "feat(ts): git facade + libgit2 binding (open + HEAD)"
```

---

## Task 5: Facade — references()

**Files:**
- Modify: `ts/src/git/binding/libgit2.ts` (add ref-iteration symbols)
- Modify: `ts/src/git/binding/repository.ts` (implement `references()`)
- Test: `ts/tests/git/references.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/git/references.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("references() returns branches and tags with oids", () => {
  const repo = openRepository(fixture.path);
  try {
    const refs = repo.references();
    const branches = refs.filter((r) => r.kind === "branch").map((r) => r.name);
    const tags = refs.filter((r) => r.kind === "tag").map((r) => r.name);
    expect(branches).toContain("main");
    expect(tags).toContain("v1.0");
    for (const r of refs) {
      expect(r.commitOid).toMatch(/^[0-9a-f]{40}$/);
      expect(r.fullName.startsWith("refs/")).toBe(true);
    }
  } finally {
    repo.free();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/git/references.test.ts`
Expected: FAIL — "not implemented yet".

- [ ] **Step 3: Add ref-iteration symbols to the binding**

In `ts/src/git/binding/libgit2.ts`, add these entries to the `dlopen` symbol map:
```ts
  git_reference_iterator_new: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_reference_next: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_reference_iterator_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_reference_name: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_reference_is_branch: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_reference_is_tag: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_reference_peel: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  git_object_id: { args: [FFIType.ptr], returns: FFIType.ptr },
  git_object_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_oid_tostr_s: { args: [FFIType.ptr], returns: FFIType.cstring },
```
Notes for the implementation:
- `git_oid_tostr_s` is declared `returns: FFIType.cstring`, so it yields a 40-char
  hex JS string directly — no `CString` wrapping needed.
- `git_object_id` returns a `const git_oid *` (a pointer/number), which you pass
  straight to `git_oid_tostr_s`.
- `GIT_OBJECT_COMMIT` is `1` in libgit2's `git_object_t` enum.
- `GIT_ITEROVER` (the iterator-exhausted sentinel) is `-31`.

- [ ] **Step 4: Implement references()**

Replace the `references()` stub in `ts/src/git/binding/repository.ts`:
```ts
references(): Reference[] {
  const iterSlot = ptrSlot();
  check(lib.git_reference_iterator_new(ptr(iterSlot), this.handle));
  const iter = readPtr(iterSlot);
  const refs: Reference[] = [];
  try {
    const refSlot = ptrSlot();
    while (true) {
      const rc = lib.git_reference_next(ptr(refSlot), iter);
      if (rc === -31 /* GIT_ITEROVER */) break;
      check(rc);
      const refPtr = readPtr(refSlot);
      try {
        const fullName = lib.git_reference_name(refPtr) as string;
        const isBranch = lib.git_reference_is_branch(refPtr) === 1;
        const isTag = lib.git_reference_is_tag(refPtr) === 1;
        if (!isBranch && !isTag) continue; // skip HEAD, notes, etc.
        const name = fullName.replace(/^refs\/(heads|tags)\//, "");
        const commitOid = this.peelToCommitOid(refPtr);
        refs.push({
          name,
          fullName,
          kind: isBranch ? "branch" : "tag",
          targetOid: commitOid,
          commitOid,
        });
      } finally {
        lib.git_reference_free(refPtr);
      }
    }
  } finally {
    lib.git_reference_iterator_free(iter);
  }
  return refs;
}

private peelToCommitOid(refPtr: number): string {
  const objSlot = ptrSlot();
  check(lib.git_reference_peel(ptr(objSlot), refPtr, 1 /* GIT_OBJECT_COMMIT */));
  const obj = readPtr(objSlot);
  try {
    const oidPtr = lib.git_object_id(obj) as number;
    return lib.git_oid_tostr_s(oidPtr) as string;
  } finally {
    lib.git_object_free(obj);
  }
}
```
No import changes needed — Task 4 already imports `ptrSlot`, `readPtr`, `lib`, `ptr`,
and `check` into `repository.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ts && bun test tests/git/references.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 6: Commit**

```bash
git add ts/src/git ts/tests/git/references.test.ts
git commit -m "feat(ts): facade references() with branch/tag peeling"
```

---

## Task 6: Facade — log()

**Files:**
- Modify: `ts/src/git/binding/libgit2.ts` (add revwalk + commit symbols)
- Modify: `ts/src/git/binding/repository.ts` (implement `log()`)
- Test: `ts/tests/git/log.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/git/log.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("log() returns newest-first commits with fields", () => {
  const repo = openRepository(fixture.path);
  try {
    const page = repo.log({ limit: 10 });
    expect(page.commits.map((c) => c.summary)).toEqual(fixture.commitSubjects);
    expect(page.hasMore).toBe(false);
    const head = page.commits[0];
    expect(head.oid).toMatch(/^[0-9a-f]{40}$/);
    expect(head.abbrevOid).toBe(head.oid.slice(0, 10));
    expect(head.author.name).toBe("Test Author");
    expect(head.author.email).toBe("author@example.com");
    expect(head.author.when instanceof Date).toBe(true);
  } finally {
    repo.free();
  }
});

test("log() paginates with offset/limit and reports hasMore", () => {
  const repo = openRepository(fixture.path);
  try {
    const page = repo.log({ limit: 2, offset: 0 });
    expect(page.commits.length).toBe(2);
    expect(page.hasMore).toBe(true);
    const page2 = repo.log({ limit: 2, offset: 2 });
    expect(page2.commits.length).toBe(1);
    expect(page2.hasMore).toBe(false);
  } finally {
    repo.free();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/git/log.test.ts`
Expected: FAIL — "not implemented yet".

- [ ] **Step 3: Add revwalk + commit symbols to the binding**

In `ts/src/git/binding/libgit2.ts`, add to the `dlopen` symbol map:
```ts
  git_revwalk_new: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_revwalk_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_revwalk_sorting: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  git_revwalk_push_ref: { args: [FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },
  git_revwalk_push_head: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_revwalk_next: { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_commit_lookup: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  git_commit_free: { args: [FFIType.ptr], returns: FFIType.void },
  git_commit_summary: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_commit_message: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_commit_author: { args: [FFIType.ptr], returns: FFIType.ptr },
  git_commit_committer: { args: [FFIType.ptr], returns: FFIType.ptr },
  git_commit_parentcount: { args: [FFIType.ptr], returns: FFIType.u32 },
  git_commit_parent_id: { args: [FFIType.ptr, FFIType.u32], returns: FFIType.ptr },
```
Add these constants/helpers at the bottom:
```ts
// git_sort_t: GIT_SORT_TOPOLOGICAL (1) | GIT_SORT_TIME (2).
export const GIT_SORT_TOPOLOGICAL = 1;
export const GIT_SORT_TIME = 2;
// raw git_oid is 20 bytes; a slot to hold one for revwalk_next output.
export function oidSlot(): Uint8Array {
  return new Uint8Array(20);
}
```
`git_signature` layout (libgit2 1.9): `{ char *name; char *email; git_time { git_time_t time(i64); int offset(i32); char sign; } }`. Read `name` at offset 0, `email` at offset 8, `time` (i64 seconds) at offset 16.

- [ ] **Step 4: Implement log()**

Replace the `log()` stub in `ts/src/git/binding/repository.ts`:
```ts
log(opts: LogOptions): LogPage {
  const offset = opts.offset ?? 0;
  const limit = opts.limit;
  const walkSlot = ptrSlot();
  check(lib.git_revwalk_new(ptr(walkSlot), this.handle));
  const walk = readPtr(walkSlot);
  try {
    lib.git_revwalk_sorting(walk, 2 /* GIT_SORT_TIME */);
    if (opts.ref) {
      const full = opts.ref.startsWith("refs/") ? opts.ref : `refs/heads/${opts.ref}`;
      check(lib.git_revwalk_push_ref(walk, cstr(full)));
    } else {
      check(lib.git_revwalk_push_head(walk));
    }
    const commits: Commit[] = [];
    const oid = oidSlot();
    let index = 0;
    let hasMore = false;
    while (true) {
      const rc = lib.git_revwalk_next(ptr(oid), walk);
      if (rc === -31 /* GIT_ITEROVER */) break;
      check(rc);
      if (index < offset) { index++; continue; }
      if (commits.length >= limit) { hasMore = true; break; }
      commits.push(this.readCommit(oid));
      index++;
    }
    return { commits, hasMore };
  } finally {
    lib.git_revwalk_free(walk);
  }
}

private readCommit(oidBytes: Uint8Array): Commit {
  const slot = ptrSlot();
  check(lib.git_commit_lookup(ptr(slot), this.handle, ptr(oidBytes)));
  const commit = readPtr(slot);
  try {
    const oid = Buffer.from(oidBytes).toString("hex");
    const summary = lib.git_commit_summary(commit) as string;
    const message = lib.git_commit_message(commit) as string;
    const author = this.readSignature(lib.git_commit_author(commit) as number);
    const committer = this.readSignature(lib.git_commit_committer(commit) as number);
    const parents: string[] = [];
    const pc = lib.git_commit_parentcount(commit);
    for (let i = 0; i < pc; i++) {
      const pid = lib.git_commit_parent_id(commit, i) as number;
      parents.push(lib.git_oid_tostr_s(pid) as string);
    }
    return {
      oid,
      abbrevOid: oid.slice(0, 10),
      author,
      committer,
      summary,
      message,
      parents,
    };
  } finally {
    lib.git_commit_free(commit);
  }
}

// git_commit_author returns a `const git_signature *`. We read its `char *name`
// (offset 0), `char *email` (offset 8), and `git_time_t time` (i64, offset 16).
// These fields are read as raw pointers/ints, so `name`/`email` ARE wrapped in
// `CString` here (unlike cstring-typed returns elsewhere).
private readSignature(sigPtr: number): Signature {
  const namePtr = read.ptr(sigPtr, 0);
  const emailPtr = read.ptr(sigPtr, 8);
  const timeSecs = read.i64(sigPtr, 16);
  return {
    name: namePtr ? new CString(Number(namePtr)).toString() : "",
    email: emailPtr ? new CString(Number(emailPtr)).toString() : "",
    when: new Date(Number(timeSecs) * 1000),
  };
}
```
No import changes needed — Task 4 already imports `oidSlot`, `cstr`, `read`, and
`CString` into `repository.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ts && bun test tests/git/log.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 6: Commit**

```bash
git add ts/src/git ts/tests/git/log.test.ts
git commit -m "feat(ts): facade log() with offset/limit pagination"
```

---

## Task 7: Facade — readFileAtRef()

**Files:**
- Modify: `ts/src/git/binding/libgit2.ts` (add revparse + blob symbols)
- Modify: `ts/src/git/binding/repository.ts` (implement `readFileAtRef()`)
- Test: `ts/tests/git/readfile.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/git/readfile.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("readFileAtRef returns blob bytes", () => {
  const repo = openRepository(fixture.path);
  try {
    const bytes = repo.readFileAtRef("main", "README.md");
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toContain("# Fixture");
  } finally {
    repo.free();
  }
});

test("readFileAtRef returns null for a missing path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.readFileAtRef("main", "nope.txt")).toBeNull();
  } finally {
    repo.free();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/git/readfile.test.ts`
Expected: FAIL — "not implemented yet".

- [ ] **Step 3: Add revparse + blob symbols to the binding**

In `ts/src/git/binding/libgit2.ts`, add to the `dlopen` symbol map:
```ts
  git_revparse_single: { args: [FFIType.ptr, FFIType.ptr, FFIType.cstring], returns: FFIType.i32 },
  git_blob_rawcontent: { args: [FFIType.ptr], returns: FFIType.ptr },
  git_blob_rawsize: { args: [FFIType.ptr], returns: FFIType.u64 },
  git_blob_free: { args: [FFIType.ptr], returns: FFIType.void },
```
`GIT_ENOTFOUND` is `-3` (returned by `git_revparse_single` when the path/ref does not exist).

- [ ] **Step 4: Implement readFileAtRef()**

Replace the `readFileAtRef()` stub in `ts/src/git/binding/repository.ts`:
```ts
readFileAtRef(ref: string, path: string): Uint8Array | null {
  const spec = `${ref}:${path}`;
  const slot = ptrSlot();
  const rc = lib.git_revparse_single(ptr(slot), this.handle, cstr(spec));
  if (rc === -3 /* GIT_ENOTFOUND */) return null;
  check(rc);
  const blob = readPtr(slot);
  try {
    const size = Number(lib.git_blob_rawsize(blob));
    const dataPtr = lib.git_blob_rawcontent(blob) as number;
    // Copy the bytes out of libgit2-owned memory before freeing the blob.
    return new Uint8Array(toArrayBuffer(dataPtr, 0, size)).slice();
  } finally {
    lib.git_blob_free(blob);
  }
}
```
No import changes needed — Task 4 already imports `toArrayBuffer` into `repository.ts`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd ts && bun test tests/git/readfile.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 6: Commit**

```bash
git add ts/src/git ts/tests/git/readfile.test.ts
git commit -m "feat(ts): facade readFileAtRef() via revparse + blob"
```

---

## Task 8: Config + repo discovery

**Files:**
- Create: `ts/src/config/config.ts`
- Create: `ts/src/scan/scan.ts`
- Test: `ts/tests/scan.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/scan.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createFixtureRepo, type FixtureRepo } from "./fixtures/repo";
import { scanRepos } from "../src/scan/scan";
import { loadConfig } from "../src/config/config";

let fixture: FixtureRepo;
let root: string;

beforeAll(async () => {
  fixture = await createFixtureRepo();
  // Place the bare fixture repo under a fresh scan root as "project.git".
  root = mkdtempSync(join(tmpdir(), "cgit-ts-scan-"));
  const dest = join(root, "project.git");
  mkdirSync(dirname(dest), { recursive: true });
  await Bun.spawn(["cp", "-r", fixture.path, dest]).exited;
});

afterAll(() => { fixture?.cleanup(); rmSync(root, { recursive: true, force: true }); });

test("scanRepos discovers bare repos and strips .git from the name", () => {
  const repos = scanRepos(root);
  expect(repos.length).toBe(1);
  expect(repos[0].name).toBe("project");
  expect(repos[0].path).toBe(join(root, "project.git"));
});

test("loadConfig provides defaults and honors CGIT_SCAN_PATH", () => {
  const cfg = loadConfig({ CGIT_SCAN_PATH: "/srv/git" });
  expect(cfg.scanPath).toBe("/srv/git");
  expect(cfg.logPageSize).toBeGreaterThan(0);
  expect(cfg.summaryLog).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/scan.test.ts`
Expected: FAIL — cannot resolve `../src/scan/scan`.

- [ ] **Step 3: Write config and scan**

`ts/src/config/config.ts`:
```ts
export interface SiteConfig {
  scanPath: string;
  cloneUrlBase?: string;
  summaryBranches: number;
  summaryTags: number;
  summaryLog: number;
  logPageSize: number;
  repolistPageSize: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  return {
    scanPath: env.CGIT_SCAN_PATH ?? process.cwd(),
    cloneUrlBase: env.CGIT_CLONE_URL_BASE,
    summaryBranches: Number(env.CGIT_SUMMARY_BRANCHES ?? 10),
    summaryTags: Number(env.CGIT_SUMMARY_TAGS ?? 10),
    summaryLog: Number(env.CGIT_SUMMARY_LOG ?? 10),
    logPageSize: Number(env.CGIT_LOG_PAGE_SIZE ?? 50),
    repolistPageSize: Number(env.CGIT_REPOLIST_PAGE_SIZE ?? 50),
  };
}
```

`ts/src/scan/scan.ts`:
```ts
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

export interface DiscoveredRepo {
  name: string;
  path: string;
  description?: string;
  owner?: string;
}

function isGitRepo(dir: string): boolean {
  // Bare repo: HEAD + objects/ + refs/ directly inside.
  if (existsSync(join(dir, "HEAD")) && existsSync(join(dir, "objects"))) return true;
  // Non-bare: a .git directory.
  return existsSync(join(dir, ".git", "HEAD"));
}

function readDescription(dir: string): string | undefined {
  const path = join(dir, "description");
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8").trim();
  if (!text || text.startsWith("Unnamed repository")) return undefined;
  return text;
}

export function scanRepos(root: string): DiscoveredRepo[] {
  if (!existsSync(root)) return [];
  const repos: DiscoveredRepo[] = [];
  for (const entry of readdirSync(root)) {
    const dir = join(root, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (!isGitRepo(dir)) continue;
    repos.push({
      name: basename(entry).replace(/\.git$/, ""),
      path: dir,
      description: readDescription(dir),
    });
  }
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/scan.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/src/config ts/src/scan ts/tests/scan.test.ts
git commit -m "feat(ts): typed config + bare-repo discovery"
```

---

## Task 9: ViewModels + decoration helper

**Files:**
- Create: `ts/src/viewmodels.ts`
- Test: `ts/tests/viewmodels.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/viewmodels.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildDecorationMap, type RefVM } from "../src/viewmodels";
import type { Reference } from "../src/git/facade";

test("buildDecorationMap groups refs by commit oid", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "v1.0", fullName: "refs/tags/v1.0", kind: "tag", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "dev", fullName: "refs/heads/dev", kind: "branch", targetOid: "b".repeat(40), commitOid: "b".repeat(40) },
  ];
  const map = buildDecorationMap(refs);
  const onA = map.get("a".repeat(40)) as RefVM[];
  expect(onA.map((r) => r.name).sort()).toEqual(["main", "v1.0"]);
  expect(map.get("b".repeat(40))!.length).toBe(1);
  expect(map.has("c".repeat(40))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/viewmodels.test.ts`
Expected: FAIL — cannot resolve `../src/viewmodels`.

- [ ] **Step 3: Write the ViewModels**

`ts/src/viewmodels.ts`:
```ts
import type { Reference, RefKind, Commit } from "./git/facade";
import { abbrevOid, formatAge } from "./format";

export interface RepoMeta {
  name: string;
  description?: string;
  owner?: string;
}

export interface RefVM {
  name: string;
  kind: RefKind;
  commitOid: string;
  abbrevOid: string;
}

export interface RepoListEntry {
  name: string;
  description?: string;
  owner?: string;
  lastCommitAge?: string;
}

export interface RepolistViewModel {
  repos: RepoListEntry[];
}

export interface LogRow {
  abbrevOid: string;
  subject: string;
  authorName: string;
  ageLabel: string;
  decorations: RefVM[];
}

export interface SummaryViewModel {
  repo: RepoMeta;
  branches: RefVM[];
  tags: RefVM[];
  recentCommits: LogRow[];
  cloneUrls: string[];
  about?: string;
}

export interface PagerVM {
  offset: number;
  limit: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface LogViewModel {
  repo: RepoMeta;
  ref: string;
  rows: LogRow[];
  pager: PagerVM;
}

export function refToVM(ref: Reference): RefVM {
  return {
    name: ref.name,
    kind: ref.kind,
    commitOid: ref.commitOid,
    abbrevOid: abbrevOid(ref.commitOid),
  };
}

export function buildDecorationMap(refs: Reference[]): Map<string, RefVM[]> {
  const map = new Map<string, RefVM[]>();
  for (const ref of refs) {
    const list = map.get(ref.commitOid) ?? [];
    list.push(refToVM(ref));
    map.set(ref.commitOid, list);
  }
  return map;
}

export function commitToLogRow(
  c: Commit,
  decorations: Map<string, RefVM[]>,
  now: Date = new Date(),
): LogRow {
  return {
    abbrevOid: c.abbrevOid,
    subject: c.summary,
    authorName: c.author.name,
    ageLabel: formatAge(c.author.when, now),
    decorations: decorations.get(c.oid) ?? [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/viewmodels.test.ts`
Expected: PASS (1 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/src/viewmodels.ts ts/tests/viewmodels.test.ts
git commit -m "feat(ts): ViewModel types + decoration map"
```

---

## Task 10: Errors + ErrorPage view

**Files:**
- Create: `ts/src/errors.ts`
- Create: `ts/src/views/default/ErrorPage.tsx`
- Test: `ts/tests/errors.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/errors.test.ts`:
```ts
import { test, expect } from "bun:test";
import { HttpError, statusForError } from "../src/errors";

test("HttpError carries a status", () => {
  const e = new HttpError(404, "Repository not found");
  expect(e.status).toBe(404);
  expect(e.message).toBe("Repository not found");
});

test("statusForError defaults unknown errors to 500", () => {
  expect(statusForError(new HttpError(400, "bad"))).toBe(400);
  expect(statusForError(new Error("boom"))).toBe(500);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/errors.test.ts`
Expected: FAIL — cannot resolve `../src/errors`.

- [ ] **Step 3: Write errors + ErrorPage**

`ts/src/errors.ts`:
```ts
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export function statusForError(err: unknown): number {
  if (err instanceof HttpError) return err.status;
  return 500;
}

export function notFound(message: string): HttpError {
  return new HttpError(404, message);
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, message);
}
```

`ts/src/views/default/ErrorPage.tsx`:
```tsx
import { Layout } from "./Layout";

export function ErrorPage(props: { status: number; message: string }) {
  return (
    <Layout title={`Error ${props.status}`}>
      <div class="error">
        <h2>{props.status}</h2>
        <p>{props.message}</p>
      </div>
    </Layout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/errors.test.ts`
Expected: PASS (2 pass). (`ErrorPage.tsx` is exercised in Task 14; it depends on `Layout` from Task 11.)

- [ ] **Step 5: Commit**

```bash
git add ts/src/errors.ts ts/src/views/default/ErrorPage.tsx ts/tests/errors.test.ts
git commit -m "feat(ts): typed HTTP errors + ErrorPage view"
```

---

## Task 11: Layout + RepolistPage views

**Files:**
- Create: `ts/src/views/default/Layout.tsx`
- Create: `ts/src/views/default/RepolistPage.tsx`
- Create: `ts/src/public/cgit.css`
- Test: `ts/tests/views/repolist-view.test.ts`

JSX auto-escapes interpolated values. Verify both rendering and escaping.

- [ ] **Step 1: Write the failing test**

`ts/tests/views/repolist-view.test.ts`:
```ts
import { test, expect } from "bun:test";
import { RepolistPage } from "../../src/views/default/RepolistPage";
import type { RepolistViewModel } from "../../src/viewmodels";

function render(node: any): string {
  return node.toString(); // hono/jsx server nodes stringify to HTML
}

test("RepolistPage renders rows and escapes descriptions", () => {
  const vm: RepolistViewModel = {
    repos: [
      { name: "alpha", description: "first <repo>", lastCommitAge: "2 days ago" },
      { name: "beta" },
    ],
  };
  const html = render(RepolistPage({ vm }));
  expect(html).toContain("alpha");
  expect(html).toContain("2 days ago");
  expect(html).toContain("first &lt;repo&gt;"); // escaped
  expect(html).not.toContain("first <repo>");
  expect(html).toContain('href="/?p=alpha&amp;page=summary"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/views/repolist-view.test.ts`
Expected: FAIL — cannot resolve `RepolistPage`.

- [ ] **Step 3: Write Layout, RepolistPage, CSS**

`ts/src/views/default/Layout.tsx`:
```tsx
import type { PropsWithChildren } from "hono/jsx";

export function Layout(props: PropsWithChildren<{ title: string; repoNav?: { name: string } }>) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>{props.title}</title>
        <link rel="stylesheet" href="/cgit.css" />
      </head>
      <body>
        <header class="site-header">
          <a href="/">cgit-ts</a>
          {props.repoNav ? (
            <nav class="repo-nav">
              <a href={`/?p=${props.repoNav.name}&page=summary`}>summary</a>
              <a href={`/?p=${props.repoNav.name}&page=log`}>log</a>
            </nav>
          ) : null}
        </header>
        <main>{props.children}</main>
        <footer class="site-footer">generated by cgit-ts</footer>
      </body>
    </html>
  );
}
```

`ts/src/views/default/RepolistPage.tsx`:
```tsx
import { Layout } from "./Layout";
import type { RepolistViewModel } from "../../viewmodels";

export function RepolistPage(props: { vm: RepolistViewModel }) {
  return (
    <Layout title="Repositories">
      <table class="repolist">
        <thead>
          <tr><th>Name</th><th>Description</th><th>Owner</th><th>Idle</th></tr>
        </thead>
        <tbody>
          {props.vm.repos.map((r) => (
            <tr>
              <td><a href={`/?p=${r.name}&page=summary`}>{r.name}</a></td>
              <td>{r.description ?? ""}</td>
              <td>{r.owner ?? ""}</td>
              <td>{r.lastCommitAge ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  );
}
```

`ts/src/public/cgit.css`:
```css
body { font-family: sans-serif; margin: 0; color: #333; }
.site-header { background: #ccc; padding: 0.5em 1em; }
.site-header a { margin-right: 1em; }
main { padding: 1em; }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 0.25em 0.75em; border-bottom: 1px solid #eee; }
.ref { font-size: 0.8em; padding: 0 0.4em; border-radius: 3px; margin-left: 0.3em; }
.ref.branch { background: #d0f0d0; }
.ref.tag { background: #f0e0a0; }
.site-footer { padding: 1em; color: #999; font-size: 0.8em; }
.error h2 { color: #b00; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/views/repolist-view.test.ts`
Expected: PASS (1 pass). If `.toString()` does not yield HTML in your Hono version, render with `import { render } from "hono/jsx/dom"` is NOT correct for SSR — instead use the server stringify shown in Task 14's e2e (the route returns `c.html(<Page/>)`); adjust this unit test to assert via `app.request` if needed.

- [ ] **Step 5: Commit**

```bash
git add ts/src/views ts/src/public ts/tests/views/repolist-view.test.ts
git commit -m "feat(ts): Layout + RepolistPage views + base CSS"
```

---

## Task 12: SummaryPage + LogPage views

**Files:**
- Create: `ts/src/views/default/SummaryPage.tsx`
- Create: `ts/src/views/default/LogPage.tsx`
- Test: `ts/tests/views/summary-log-view.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/views/summary-log-view.test.ts`:
```ts
import { test, expect } from "bun:test";
import { SummaryPage } from "../../src/views/default/SummaryPage";
import { LogPage } from "../../src/views/default/LogPage";
import type { SummaryViewModel, LogViewModel } from "../../src/viewmodels";

test("SummaryPage renders branches, tags, recent log and escaped about", () => {
  const vm: SummaryViewModel = {
    repo: { name: "alpha", description: "the alpha repo" },
    branches: [{ name: "main", kind: "branch", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    tags: [{ name: "v1.0", kind: "tag", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    recentCommits: [{ abbrevOid: "aaaaaaaaaa", subject: "Add <x>", authorName: "Ann", ageLabel: "1 day ago", decorations: [] }],
    cloneUrls: ["https://example.com/alpha.git"],
    about: "# Title & stuff",
  };
  const html = SummaryPage({ vm }).toString();
  expect(html).toContain("main");
  expect(html).toContain("v1.0");
  expect(html).toContain("Add &lt;x&gt;");
  expect(html).toContain("# Title &amp; stuff"); // about escaped as plain text
  expect(html).toContain("https://example.com/alpha.git");
});

test("LogPage renders rows, decorations and pager links", () => {
  const vm: LogViewModel = {
    repo: { name: "alpha" },
    ref: "main",
    rows: [{
      abbrevOid: "aaaaaaaaaa", subject: "Add a", authorName: "Ann", ageLabel: "1 day ago",
      decorations: [{ name: "main", kind: "branch", commitOid: "a".repeat(40), abbrevOid: "aaaaaaaaaa" }],
    }],
    pager: { offset: 50, limit: 50, hasPrev: true, hasNext: true },
  };
  const html = LogPage({ vm }).toString();
  expect(html).toContain("Add a");
  expect(html).toContain("main"); // decoration badge
  expect(html).toContain("page=log");
  expect(html).toContain("ofs=0");   // prev
  expect(html).toContain("ofs=100"); // next
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/views/summary-log-view.test.ts`
Expected: FAIL — cannot resolve `SummaryPage`.

- [ ] **Step 3: Write SummaryPage and LogPage**

`ts/src/views/default/SummaryPage.tsx`:
```tsx
import { Layout } from "./Layout";
import type { SummaryViewModel, RefVM, LogRow } from "../../viewmodels";

function RefList(props: { title: string; refs: RefVM[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
      <ul>{props.refs.map((r) => <li>{r.name} <code>{r.abbrevOid}</code></li>)}</ul>
    </section>
  );
}

function LogRows(props: { rows: LogRow[] }) {
  return (
    <table class="log">
      <tbody>
        {props.rows.map((row) => (
          <tr>
            <td>{row.ageLabel}</td>
            <td>{row.subject}</td>
            <td>{row.authorName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SummaryPage(props: { vm: SummaryViewModel }) {
  const { vm } = props;
  return (
    <Layout title={vm.repo.name} repoNav={{ name: vm.repo.name }}>
      <h2>{vm.repo.name}</h2>
      {vm.repo.description ? <p>{vm.repo.description}</p> : null}
      <RefList title="Branches" refs={vm.branches} />
      <RefList title="Tags" refs={vm.tags} />
      <section>
        <h3>Recent commits</h3>
        <LogRows rows={vm.recentCommits} />
      </section>
      {vm.cloneUrls.length ? (
        <section>
          <h3>Clone</h3>
          <ul>{vm.cloneUrls.map((u) => <li><code>{u}</code></li>)}</ul>
        </section>
      ) : null}
      {vm.about ? (
        <section id="summary">
          <h3>About</h3>
          <pre class="about">{vm.about}</pre>
        </section>
      ) : null}
    </Layout>
  );
}
```

`ts/src/views/default/LogPage.tsx`:
```tsx
import { Layout } from "./Layout";
import type { LogViewModel } from "../../viewmodels";

export function LogPage(props: { vm: LogViewModel }) {
  const { vm } = props;
  const base = `/?p=${vm.repo.name}&page=log&h=${vm.ref}`;
  const prevOfs = Math.max(0, vm.pager.offset - vm.pager.limit);
  const nextOfs = vm.pager.offset + vm.pager.limit;
  return (
    <Layout title={`${vm.repo.name}: log`} repoNav={{ name: vm.repo.name }}>
      <h2>{vm.repo.name}: log ({vm.ref})</h2>
      <table class="log">
        <thead><tr><th>Age</th><th>Commit</th><th>Author</th><th></th></tr></thead>
        <tbody>
          {vm.rows.map((row) => (
            <tr>
              <td>{row.ageLabel}</td>
              <td><code>{row.abbrevOid}</code> {row.subject}</td>
              <td>{row.authorName}</td>
              <td>
                {row.decorations.map((d) => (
                  <span class={`ref ${d.kind}`}>{d.name}</span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav class="pager">
        {vm.pager.hasPrev ? <a href={`${base}&ofs=${prevOfs}`}>&laquo; newer</a> : null}
        {vm.pager.hasNext ? <a href={`${base}&ofs=${nextOfs}`}>older &raquo;</a> : null}
      </nav>
    </Layout>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/views/summary-log-view.test.ts`
Expected: PASS (2 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/src/views ts/tests/views/summary-log-view.test.ts
git commit -m "feat(ts): SummaryPage + LogPage views"
```

---

## Task 13: Route ViewModel builders

**Files:**
- Create: `ts/src/routes/repolist.ts`
- Create: `ts/src/routes/summary.ts`
- Create: `ts/src/routes/log.ts`
- Test: `ts/tests/routes/builders.test.ts`

This task implements the pure `build*VM` functions (unit tested here). The Hono handlers that gather data and return responses are added in Task 14.

- [ ] **Step 1: Write the failing test**

`ts/tests/routes/builders.test.ts`:
```ts
import { test, expect } from "bun:test";
import { buildRepolistVM } from "../../src/routes/repolist";
import { buildSummaryVM } from "../../src/routes/summary";
import { buildLogVM } from "../../src/routes/log";
import type { Commit, Reference } from "../../src/git/facade";

const now = new Date("2026-06-05T12:00:00Z");
const when = new Date("2026-06-04T12:00:00Z");

function commit(oid: string, summary: string): Commit {
  return {
    oid, abbrevOid: oid.slice(0, 10),
    author: { name: "Ann", email: "a@x.io", when },
    committer: { name: "Ann", email: "a@x.io", when },
    summary, message: summary + "\n", parents: [],
  };
}

test("buildRepolistVM maps discovered repos + last-commit age", () => {
  const vm = buildRepolistVM(
    [{ name: "alpha", path: "/r/alpha.git", description: "d" }],
    new Map([["alpha", when]]),
    now,
  );
  expect(vm.repos[0].name).toBe("alpha");
  expect(vm.repos[0].description).toBe("d");
  expect(vm.repos[0].lastCommitAge).toBe("1 day ago");
});

test("buildSummaryVM splits branches/tags, builds rows and clone urls", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
    { name: "v1.0", fullName: "refs/tags/v1.0", kind: "tag", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
  ];
  const vm = buildSummaryVM(
    { name: "alpha", description: "d" },
    refs,
    [commit("a".repeat(40), "Add a")],
    "# readme",
    ["https://h/alpha.git"],
    now,
  );
  expect(vm.branches.map((b) => b.name)).toEqual(["main"]);
  expect(vm.tags.map((t) => t.name)).toEqual(["v1.0"]);
  expect(vm.recentCommits[0].subject).toBe("Add a");
  expect(vm.recentCommits[0].decorations.map((d) => d.name).sort()).toEqual(["main", "v1.0"]);
  expect(vm.about).toBe("# readme");
  expect(vm.cloneUrls).toEqual(["https://h/alpha.git"]);
});

test("buildLogVM builds rows, decorations and pager", () => {
  const refs: Reference[] = [
    { name: "main", fullName: "refs/heads/main", kind: "branch", targetOid: "a".repeat(40), commitOid: "a".repeat(40) },
  ];
  const vm = buildLogVM(
    { name: "alpha" }, "main",
    { commits: [commit("a".repeat(40), "Add a"), commit("b".repeat(40), "Add b")], hasMore: true },
    refs, 50, 50, now,
  );
  expect(vm.ref).toBe("main");
  expect(vm.rows.length).toBe(2);
  expect(vm.rows[0].decorations.map((d) => d.name)).toEqual(["main"]);
  expect(vm.pager).toEqual({ offset: 50, limit: 50, hasPrev: true, hasNext: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/routes/builders.test.ts`
Expected: FAIL — cannot resolve `../../src/routes/repolist`.

- [ ] **Step 3: Write the builders**

`ts/src/routes/repolist.ts`:
```ts
import type { DiscoveredRepo } from "../scan/scan";
import { formatAge } from "../format";
import type { RepolistViewModel } from "../viewmodels";

export function buildRepolistVM(
  repos: DiscoveredRepo[],
  lastCommitByName: Map<string, Date>,
  now: Date = new Date(),
): RepolistViewModel {
  return {
    repos: repos.map((r) => {
      const when = lastCommitByName.get(r.name);
      return {
        name: r.name,
        description: r.description,
        owner: r.owner,
        lastCommitAge: when ? formatAge(when, now) : undefined,
      };
    }),
  };
}
```

`ts/src/routes/summary.ts`:
```ts
import type { Commit, Reference } from "../git/facade";
import {
  buildDecorationMap, refToVM, commitToLogRow,
  type SummaryViewModel, type RepoMeta,
} from "../viewmodels";

export function buildSummaryVM(
  repo: RepoMeta,
  refs: Reference[],
  recentCommits: Commit[],
  about: string | undefined,
  cloneUrls: string[],
  now: Date = new Date(),
): SummaryViewModel {
  const decorations = buildDecorationMap(refs);
  return {
    repo,
    branches: refs.filter((r) => r.kind === "branch").map(refToVM),
    tags: refs.filter((r) => r.kind === "tag").map(refToVM),
    recentCommits: recentCommits.map((c) => commitToLogRow(c, decorations, now)),
    cloneUrls,
    about,
  };
}
```

`ts/src/routes/log.ts`:
```ts
import type { Reference, LogPage } from "../git/facade";
import {
  buildDecorationMap, commitToLogRow,
  type LogViewModel, type RepoMeta,
} from "../viewmodels";

export function buildLogVM(
  repo: RepoMeta,
  ref: string,
  page: LogPage,
  refs: Reference[],
  offset: number,
  limit: number,
  now: Date = new Date(),
): LogViewModel {
  const decorations = buildDecorationMap(refs);
  return {
    repo,
    ref,
    rows: page.commits.map((c) => commitToLogRow(c, decorations, now)),
    pager: { offset, limit, hasPrev: offset > 0, hasNext: page.hasMore },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ts && bun test tests/routes/builders.test.ts`
Expected: PASS (3 pass).

- [ ] **Step 5: Commit**

```bash
git add ts/src/routes ts/tests/routes/builders.test.ts
git commit -m "feat(ts): pure ViewModel builders for the three pages"
```

---

## Task 14: Server dispatch + end-to-end wiring

**Files:**
- Modify: `ts/src/server.ts` (dispatch, static CSS, handlers)
- Create: `ts/src/routes/render.ts` (handler helpers gluing facade → builder → view)
- Test: `ts/tests/e2e.test.ts`

- [ ] **Step 1: Write the failing test**

`ts/tests/e2e.test.ts`:
```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFixtureRepo, type FixtureRepo } from "./fixtures/repo";
import { createApp } from "../src/server";

let fixture: FixtureRepo;
let root: string;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  fixture = await createFixtureRepo();
  root = mkdtempSync(join(tmpdir(), "cgit-ts-e2e-"));
  await Bun.spawn(["cp", "-r", fixture.path, join(root, "project.git")]).exited;
  app = createApp({
    scanPath: root, summaryBranches: 10, summaryTags: 10,
    summaryLog: 10, logPageSize: 2, repolistPageSize: 50,
  });
});

afterAll(() => { fixture?.cleanup(); rmSync(root, { recursive: true, force: true }); });

test("GET / lists the repo", async () => {
  const html = await (await app.request("/")).text();
  expect(html).toContain("project");
  expect(html).toContain('href="/?p=project&amp;page=summary"');
});

test("GET /?p=project&page=summary shows refs and about", async () => {
  const res = await app.request("/?p=project&page=summary");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("main");
  expect(html).toContain("v1.0");
  expect(html).toContain("# Fixture"); // README rendered as plain text
});

test("GET /?p=project&page=log paginates", async () => {
  const html = await (await app.request("/?p=project&page=log")).text();
  expect(html).toContain("Add b.txt");
  expect(html).toContain("older"); // hasNext pager (page size 2, 3 commits)
});

test("GET /?p=missing&page=summary 404s", async () => {
  const res = await app.request("/?p=missing&page=summary");
  expect(res.status).toBe(404);
});

test("GET /cgit.css serves the stylesheet", async () => {
  const res = await app.request("/cgit.css");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/css");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ts && bun test tests/e2e.test.ts`
Expected: FAIL — `createApp` is not exported.

- [ ] **Step 3: Write render helpers**

`ts/src/routes/render.ts`:
```ts
import type { SiteConfig } from "../config/config";
import { scanRepos } from "../scan/scan";
import { openRepository } from "../git/binding/repository";
import { notFound } from "../errors";
import { buildRepolistVM } from "./repolist";
import { buildSummaryVM } from "./summary";
import { buildLogVM } from "./log";
import type { RepoMeta } from "../viewmodels";

function findRepo(cfg: SiteConfig, name: string) {
  const repo = scanRepos(cfg.scanPath).find((r) => r.name === name);
  if (!repo) throw notFound(`Repository not found: ${name}`);
  return repo;
}

export function repolistVM(cfg: SiteConfig) {
  const repos = scanRepos(cfg.scanPath);
  const lastCommit = new Map<string, Date>();
  for (const r of repos) {
    const repo = openRepository(r.path);
    try {
      const page = repo.log({ limit: 1 });
      if (page.commits[0]) lastCommit.set(r.name, page.commits[0].author.when);
    } finally { repo.free(); }
  }
  return buildRepolistVM(repos, lastCommit);
}

export function summaryVM(cfg: SiteConfig, name: string) {
  const disc = findRepo(cfg, name);
  const repo = openRepository(disc.path);
  try {
    const refs = repo.references();
    const head = repo.headRef();
    const recent = repo.log({ ref: head, limit: cfg.summaryLog }).commits;
    const readme = repo.readFileAtRef(head, "README.md");
    const about = readme ? new TextDecoder().decode(readme) : undefined;
    const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
    const cloneUrls = cfg.cloneUrlBase ? [`${cfg.cloneUrlBase.replace(/\/$/, "")}/${disc.name}.git`] : [];
    return buildSummaryVM(meta, refs, recent, about, cloneUrls);
  } finally { repo.free(); }
}

export function logVM(cfg: SiteConfig, name: string, ref: string | undefined, offset: number) {
  const disc = findRepo(cfg, name);
  const repo = openRepository(disc.path);
  try {
    const head = ref ?? repo.headRef();
    const refs = repo.references();
    const limit = cfg.logPageSize;
    const page = repo.log({ ref: head, offset, limit });
    const meta: RepoMeta = { name: disc.name, description: disc.description, owner: disc.owner };
    return buildLogVM(meta, head, page, refs, offset, limit);
  } finally { repo.free(); }
}
```

- [ ] **Step 4: Rewrite server.ts with dispatch**

`ts/src/server.ts`:
```ts
import { Hono } from "hono";
import { loadConfig, type SiteConfig } from "./config/config";
import { repolistVM, summaryVM, logVM } from "./routes/render";
import { RepolistPage } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";
import { LogPage } from "./views/default/LogPage";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  app.get("/healthz", (c) => c.text("ok"));

  app.get("/cgit.css", async (c) => {
    const css = await Bun.file(new URL("./public/cgit.css", import.meta.url)).text();
    return c.body(css, 200, { "content-type": "text/css; charset=utf-8" });
  });

  app.get("/", (c) => {
    try {
      const p = c.req.query("p");
      if (!p) return c.html(RepolistPage({ vm: repolistVM(cfg) }));
      const page = c.req.query("page") ?? "summary";
      if (page === "log") {
        const ref = c.req.query("h") || undefined;
        const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
        return c.html(LogPage({ vm: logVM(cfg, p, ref, ofs) }));
      }
      return c.html(SummaryPage({ vm: summaryVM(cfg, p) }));
    } catch (err) {
      const status = statusForError(err);
      const message = err instanceof Error ? err.message : "Internal error";
      if (status === 500) console.error(err);
      return c.html(ErrorPage({ status, message }), status as 400 | 404 | 500);
    }
  });

  return app;
}

const app = createApp(loadConfig());
export default app;

if (import.meta.main) {
  const port = Number(process.env.PORT ?? 3000);
  Bun.serve({ port, fetch: app.fetch });
  console.log(`cgit-ts listening on :${port}`);
}
```

Update `ts/tests/smoke.test.ts` import if needed — it imports the default `app`, which still exists, so it keeps passing.

- [ ] **Step 5: Run the full suite to verify everything passes**

Run: `cd ts && bun test`
Expected: PASS — all suites green (smoke, format, fixtures, git open/references/log/readfile, scan, viewmodels, errors, views, builders, e2e).

- [ ] **Step 6: Manual smoke check (optional but recommended)**

Run: `cd ts && CGIT_SCAN_PATH=<a dir of bare repos> bun run src/server.ts` then open `http://localhost:3000/`.
Expected: repolist renders; clicking a repo shows summary; the log paginates.

- [ ] **Step 7: Commit**

```bash
git add ts/src/server.ts ts/src/routes/render.ts ts/tests/e2e.test.ts
git commit -m "feat(ts): server dispatch + end-to-end repolist/summary/log"
```

---

## Done criteria

- `cd ts && bun test` is fully green.
- `bun run src/server.ts` against a directory of bare repos serves working repolist, summary, and log pages.
- No raw libgit2 pointer escapes `ts/src/git/`; no HTML string is built outside `ts/src/views/`.
- The binding decision is recorded in the spec file.
