# Tree + Blob Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file-tree browsing (directory listing + single-file view) and a raw-bytes route to the cgit TypeScript rewrite.

**Architecture:** A single `/:repo/tree/*` route serves both directories and files (it lists a subtree or renders a blob depending on what the path resolves to); a sibling `/:repo/raw/*` route serves raw bytes. A pure `splitRefPath` helper greedily separates the ref from the path in the URL tail using the repo's known ref names. The libgit2 binding gains tree-listing; views follow the existing `hono/jsx-renderer` pattern.

**Tech Stack:** Bun, Hono (`hono/jsx-renderer`, `hono/trailing-slash`), libgit2 via `bun:ffi`, `bun test`. The repo is a jj-colocated git repo — commit with `jj commit`.

---

## Background the executor needs

- **VCS:** This repo uses **jujutsu (jj)**, colocated with git. Commit with `jj commit -m "..."` (it auto-snapshots the working copy; there is no `git add` step). Do not run `git commit`.
- **Config injection:** Site config rides on each request as Hono Bindings (`c.env`). Tests inject it as the third arg to `app.request(path, undefined, cfg)`.
- **`appendTrailingSlash()` semantics (verified against `node_modules/hono/.../trailing-slash/index.js`):** With no options it is a *404 fallback* — it runs the handler first and only issues a 301 to the slash form when the response status is 404 and the path lacks a trailing slash. It also honours a `skip(path)` predicate in that fallback branch. This is why a `/:repo/tree/*` route that returns 200 for files needs no special handling, but genuine 404s under `/tree/` and `/raw/` must be excluded from the fallback via `skip`.
- **`useRepository` middleware** (`src/middlewares.ts`) currently skips opening the repo for any path without a trailing slash (an optimization for redirect-only stubs like `/repo` and `/repo/log`). Tree/blob file URLs legitimately lack a trailing slash, so the guard is relaxed in Task 7.
- **Renderer test harness:** View tests mount the page through `renderer` so `<title>` hoists into `<head>` (see `tests/views/title-hoisting.test.tsx`).

## File Structure

- Create `src/git/refpath.ts` — pure `splitRefPath(tail, refNames, defaultRef)`.
- Create `src/blob.ts` — `isBinary(bytes)`.
- Create `src/views/default/Breadcrumb.tsx` — shared path breadcrumb.
- Create `src/views/default/TreePage.tsx` — directory listing.
- Create `src/views/default/BlobPage.tsx` — single-file view.
- Modify `src/git/facade.ts` — add `TreeEntry` and `tree()` to the `Repository` interface.
- Modify `src/git/binding/libgit2.ts` — add tree-entry FFI symbols.
- Modify `src/git/binding/repository.ts` — implement `tree()`; add object-type guard to `readFileAtRef`.
- Modify `src/views/default/renderer.tsx` — add a "tree" menu item.
- Modify `src/middlewares.ts` — relax the trailing-slash guard.
- Modify `src/server.tsx` — register the two routes and the `skip` option.
- Modify `tests/fixtures/repo.ts` — add a subdirectory file and a binary file to the final commit.
- Create tests: `tests/git/refpath.test.ts`, `tests/blob.test.ts`, `tests/git/tree.test.ts`, `tests/views/tree-blob-view.test.tsx`; extend `tests/e2e.test.ts` and `tests/git/readfile.test.ts`.

---

## Task 1: Extend the test fixture with a subdirectory and a binary file

The fixture's three commits and their subjects are asserted by `log.test.ts` and `e2e.test.ts`, so we must **not** add commits. We add `src/hello.txt` and `logo.bin` to the working tree *before the existing "Add b.txt" commit*, so they land in that commit and appear at the `main` HEAD tree without changing commit count or subjects.

**Files:**
- Modify: `tests/fixtures/repo.ts`

- [ ] **Step 1: Add `mkdirSync` to the node:fs import**

Change line 1 of `tests/fixtures/repo.ts`:

```ts
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
```

- [ ] **Step 2: Extend the `FixtureRepo` interface**

Replace the `FixtureRepo` interface with:

```ts
export interface FixtureRepo {
  path: string;             // path to the bare repo
  commitSubjects: string[]; // newest-first
  branches: string[];
  tags: string[];
  subdir: string;           // "src"
  subdirFile: string;       // "src/hello.txt"
  binaryFile: string;       // "logo.bin"
  cleanup: () => void;
}
```

- [ ] **Step 3: Add the files into the final commit**

In `createFixtureRepo`, replace the b.txt block:

```ts
    await Bun.write(join(work, "b.txt"), "second\n");
    await run(work, "add", "b.txt");
    await run(work, "commit", "-q", "-m", "Add b.txt");
```

with:

```ts
    await Bun.write(join(work, "b.txt"), "second\n");
    mkdirSync(join(work, "src"), { recursive: true });
    await Bun.write(join(work, "src", "hello.txt"), "hi from src\n");
    // NUL byte in the first bytes -> detected as binary.
    await Bun.write(join(work, "logo.bin"), new Uint8Array([0, 1, 2, 3, 0, 255, 10, 0]));
    await run(work, "add", "-A");
    await run(work, "commit", "-q", "-m", "Add b.txt");
```

- [ ] **Step 4: Return the new metadata**

In the returned object, add the three fields alongside the existing ones:

```ts
    return {
      path: bare,
      commitSubjects: ["Add b.txt", "Add a.txt", "Add README"],
      branches: ["main"],
      tags: ["v1.0", "v2.0"],
      subdir: "src",
      subdirFile: "src/hello.txt",
      binaryFile: "logo.bin",
      cleanup,
    };
```

- [ ] **Step 5: Verify the existing suite still passes**

Run: `bun test`
Expected: all existing tests still PASS (commit counts and subjects unchanged).

- [ ] **Step 6: Commit**

```bash
jj commit -m "test(ts): add subdir and binary file to fixture repo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `splitRefPath` greedy ref/path resolver

**Files:**
- Create: `src/git/refpath.ts`
- Test: `tests/git/refpath.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/git/refpath.test.ts`:

```ts
import { test, expect } from "bun:test";
import { splitRefPath } from "../../src/git/refpath";

const refs = ["main", "feature/login", "v1.0"];

test("simple branch ref splits off the path", () => {
  expect(splitRefPath("main/src/a.ts", refs, "main")).toEqual({ ref: "main", path: "src/a.ts" });
});

test("ref containing slashes wins by longest match", () => {
  expect(splitRefPath("feature/login/src/a.ts", refs, "main")).toEqual({
    ref: "feature/login",
    path: "src/a.ts",
  });
});

test("ref with no trailing path yields an empty path", () => {
  expect(splitRefPath("main", refs, "main")).toEqual({ ref: "main", path: "" });
});

test("hex-looking first segment is treated as an oid", () => {
  expect(splitRefPath("a1b2c3d4/src", refs, "main")).toEqual({ ref: "a1b2c3d4", path: "src" });
});

test("empty tail defaults to the head ref and empty path", () => {
  expect(splitRefPath("", refs, "main")).toEqual({ ref: "main", path: "" });
});

test("unknown non-oid first segment falls back to default ref with the whole tail as path", () => {
  expect(splitRefPath("docs/readme.md", refs, "main")).toEqual({
    ref: "main",
    path: "docs/readme.md",
  });
});

test("a trailing slash on a directory tail is trimmed", () => {
  expect(splitRefPath("main/src/", refs, "main")).toEqual({ ref: "main", path: "src" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/git/refpath.test.ts`
Expected: FAIL — cannot find module `src/git/refpath`.

- [ ] **Step 3: Write the implementation**

Create `src/git/refpath.ts`:

```ts
// Separate the ref from the path in a `/tree/` or `/raw/` URL tail.
//
// Refs can contain slashes (e.g. "feature/login"), so the split is ambiguous on
// its own. We resolve greedily against the repo's known ref names:
//   1. the LONGEST ref name that is a prefix of the tail (on a segment boundary)
//   2. else, if the first segment looks like a hex oid, treat it as the ref
//   3. else, default to `defaultRef` with the whole tail as the path
export function splitRefPath(
  tail: string,
  refNames: string[],
  defaultRef: string,
): { ref: string; path: string } {
  const normalized = tail.replace(/^\/+/, "").replace(/\/+$/, "");

  // 1. longest matching ref name
  const match = refNames
    .filter((r) => normalized === r || normalized.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (match) {
    return { ref: match, path: normalized.slice(match.length).replace(/^\/+/, "") };
  }

  // 2. hex oid first segment
  const slash = normalized.indexOf("/");
  const first = slash === -1 ? normalized : normalized.slice(0, slash);
  if (/^[0-9a-f]{4,40}$/i.test(first)) {
    return { ref: first, path: slash === -1 ? "" : normalized.slice(slash + 1) };
  }

  // 3. default ref
  return { ref: defaultRef, path: normalized };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/git/refpath.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat(ts): add greedy splitRefPath ref/path resolver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `isBinary` content classifier

**Files:**
- Create: `src/blob.ts`
- Test: `tests/blob.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/blob.test.ts`:

```ts
import { test, expect } from "bun:test";
import { isBinary } from "../src/blob";

test("isBinary detects a NUL byte", () => {
  expect(isBinary(new Uint8Array([0x68, 0x69, 0x00]))).toBe(true);
});

test("isBinary treats plain text as non-binary", () => {
  expect(isBinary(new TextEncoder().encode("hello\nworld\n"))).toBe(false);
});

test("isBinary only scans the first 8000 bytes", () => {
  const buf = new Uint8Array(9000);
  buf[8500] = 0; // NUL past the scan window
  expect(isBinary(buf)).toBe(false);
});

test("isBinary treats empty input as non-binary", () => {
  expect(isBinary(new Uint8Array([]))).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/blob.test.ts`
Expected: FAIL — cannot find module `src/blob`.

- [ ] **Step 3: Write the implementation**

Create `src/blob.ts`:

```ts
// A blob is treated as binary if a NUL byte appears within the first 8000 bytes
// — the same heuristic git itself uses for diff/textconv decisions.
export function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/blob.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat(ts): add isBinary blob classifier

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: libgit2 tree listing + `readFileAtRef` type guard

**Files:**
- Modify: `src/git/facade.ts`
- Modify: `src/git/binding/libgit2.ts`
- Modify: `src/git/binding/repository.ts`
- Test: `tests/git/tree.test.ts`, `tests/git/readfile.test.ts`

- [ ] **Step 1: Add the `TreeEntry` type and `tree()` to the facade**

In `src/git/facade.ts`, add after the `Reference` interface (before `LogOptions`):

```ts
export interface TreeEntry {
  name: string;
  mode: number;                       // raw git filemode (octal when displayed)
  type: "blob" | "tree" | "commit";   // "commit" == submodule gitlink
  oid: string;
  size?: number;                      // present for blobs
}
```

In the `Repository` interface, add (after `readFileAtRef`):

```ts
  /** Lists a tree at `ref`/`path`. Returns null if the path is not a tree
   *  (e.g. it is a blob) or does not exist. `path` "" means the root tree. */
  tree(ref: string, path: string): TreeEntry[] | null;
```

- [ ] **Step 2: Write the failing binding tests**

Create `tests/git/tree.test.ts`:

```ts
import { test, expect, beforeAll, afterAll } from "bun:test";
import { createFixtureRepo, type FixtureRepo } from "../fixtures/repo";
import { openRepository } from "../../src/git/binding/repository";

let fixture: FixtureRepo;
beforeAll(async () => { fixture = await createFixtureRepo(); });
afterAll(() => fixture?.cleanup());

test("tree() lists root entries with types and blob sizes", () => {
  const repo = openRepository(fixture.path);
  try {
    const entries = repo.tree("main", "");
    expect(entries).not.toBeNull();
    const byName = Object.fromEntries(entries!.map((e) => [e.name, e]));
    expect(byName["README.md"].type).toBe("blob");
    expect(byName["README.md"].size).toBeGreaterThan(0);
    expect(byName["README.md"].oid).toMatch(/^[0-9a-f]{40}$/);
    expect(byName["src"].type).toBe("tree");
    expect(byName["logo.bin"].type).toBe("blob");
  } finally {
    repo.free();
  }
});

test("tree() lists a subdirectory", () => {
  const repo = openRepository(fixture.path);
  try {
    const entries = repo.tree("main", "src");
    expect(entries!.map((e) => e.name)).toContain("hello.txt");
  } finally {
    repo.free();
  }
});

test("tree() returns null for a blob path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.tree("main", "README.md")).toBeNull();
  } finally {
    repo.free();
  }
});

test("tree() returns null for a missing path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.tree("main", "nope/missing")).toBeNull();
  } finally {
    repo.free();
  }
});
```

Add to `tests/git/readfile.test.ts` (after the existing tests, before the final close):

```ts
test("readFileAtRef returns null for a directory path", () => {
  const repo = openRepository(fixture.path);
  try {
    expect(repo.readFileAtRef("main", "src")).toBeNull();
  } finally {
    repo.free();
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/git/tree.test.ts`
Expected: FAIL — `repo.tree is not a function`.

- [ ] **Step 4: Add the FFI symbols**

In `src/git/binding/libgit2.ts`, add these entries inside the `SYMBOLS` object (after `git_blob_free`):

```ts
  git_object_type: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_tree_entrycount: { args: [FFIType.ptr], returns: FFIType.u64 },
  git_tree_entry_byindex: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.ptr },
  git_tree_entry_name: { args: [FFIType.ptr], returns: FFIType.cstring },
  git_tree_entry_type: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_tree_entry_filemode: { args: [FFIType.ptr], returns: FFIType.i32 },
  git_tree_entry_id: { args: [FFIType.ptr], returns: FFIType.ptr },
  git_tree_entry_to_object: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
```

- [ ] **Step 5: Add object-type constants in the binding**

In `src/git/binding/repository.ts`, add below the existing `GIT_OBJECT_COMMIT` constant:

```ts
const GIT_OBJECT_TREE = 2;
const GIT_OBJECT_BLOB = 3;
```

Add `TreeEntry` to the type import at the top of the file:

```ts
import type { Repository, Reference, Commit, Signature, LogOptions, LogPage, TreeEntry } from "../facade";
```

- [ ] **Step 6: Implement `tree()` and a `blobSize` helper**

In `src/git/binding/repository.ts`, add these methods to the `Repo` class (place them right after `readFileAtRef`):

```ts
  tree(ref: string, path: string): TreeEntry[] | null {
    const spec = path ? `${ref}:${path}` : `${ref}:`;
    const slot = ptrSlot();
    const rc = lib.git_revparse_single(toPtr(ptr(slot)), toPtr(this.handle), cstr(spec));
    if (rc === -3 /* GIT_ENOTFOUND */) return null;
    check(rc);
    const obj = readPtr(slot);
    try {
      if (lib.git_object_type(toPtr(obj)) !== GIT_OBJECT_TREE) return null;
      const count = Number(lib.git_tree_entrycount(toPtr(obj)));
      const entries: TreeEntry[] = [];
      for (let i = 0; i < count; i++) {
        const entry = Number(lib.git_tree_entry_byindex(toPtr(obj), i));
        const name = String(lib.git_tree_entry_name(toPtr(entry)));
        const mode = lib.git_tree_entry_filemode(toPtr(entry));
        const otype = lib.git_tree_entry_type(toPtr(entry));
        const type = otype === GIT_OBJECT_TREE ? "tree" : otype === GIT_OBJECT_COMMIT ? "commit" : "blob";
        const oidPtr = Number(lib.git_tree_entry_id(toPtr(entry)));
        const oid = String(lib.git_oid_tostr_s(toPtr(oidPtr)));
        const size = type === "blob" ? this.blobSize(entry) : undefined;
        entries.push({ name, mode, type, oid, size });
      }
      return entries;
    } finally {
      lib.git_object_free(toPtr(obj));
    }
  }

  // Load the blob behind a tree entry just to read its size. The entry pointer is
  // owned by the tree (no free); the looked-up object is freed here.
  private blobSize(entry: number): number {
    const slot = ptrSlot();
    check(lib.git_tree_entry_to_object(toPtr(ptr(slot)), toPtr(this.handle), toPtr(entry)));
    const obj = readPtr(slot);
    try {
      return Number(lib.git_blob_rawsize(toPtr(obj)));
    } finally {
      lib.git_object_free(toPtr(obj));
    }
  }
```

- [ ] **Step 7: Add the object-type guard to `readFileAtRef`**

In `src/git/binding/repository.ts`, replace the body of `readFileAtRef`'s `try` block (and switch the free call) so a non-blob (e.g. a tree) returns null instead of misreading memory:

```ts
  readFileAtRef(ref: string, path: string): Uint8Array | null {
    const spec = `${ref}:${path}`;
    const slot = ptrSlot();
    const rc = lib.git_revparse_single(toPtr(ptr(slot)), toPtr(this.handle), cstr(spec));
    if (rc === -3 /* GIT_ENOTFOUND */) return null;
    check(rc);
    const obj = readPtr(slot);
    try {
      if (lib.git_object_type(toPtr(obj)) !== GIT_OBJECT_BLOB) return null;
      const size = Number(lib.git_blob_rawsize(toPtr(obj)));
      const dataPtr = Number(lib.git_blob_rawcontent(toPtr(obj)));
      // Copy the bytes out of libgit2-owned memory before freeing the object.
      return new Uint8Array(toArrayBuffer(toPtr(dataPtr), 0, size)).slice();
    } finally {
      lib.git_object_free(toPtr(obj));
    }
  }
```

- [ ] **Step 8: Run the binding tests**

Run: `bun test tests/git/tree.test.ts tests/git/readfile.test.ts`
Expected: PASS (4 + 3 tests).

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
jj commit -m "feat(ts): list trees via libgit2; guard readFileAtRef to blobs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Breadcrumb component + TreePage view

**Files:**
- Create: `src/views/default/Breadcrumb.tsx`
- Create: `src/views/default/TreePage.tsx`
- Test: `tests/views/tree-blob-view.test.tsx`

- [ ] **Step 1: Write the failing TreePage test**

Create `tests/views/tree-blob-view.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";
import { TreePage } from "../../src/views/default/TreePage";
import type { TreeEntry } from "../../src/git/facade";

function headOf(html: string): string {
  return html.slice(0, html.indexOf("</head>"));
}

async function render(node: any): Promise<string> {
  const app = new Hono();
  app.use(renderer);
  app.get("/", (c) => c.render(node));
  return (await app.request("/")).text();
}

const entries: TreeEntry[] = [
  { name: "a.txt", mode: 0o100644, type: "blob", oid: "f".repeat(40), size: 6 },
  { name: "src", mode: 0o040000, type: "tree", oid: "e".repeat(40) },
];

test("TreePage hoists its title and lists directories before files", async () => {
  const html = await render(<TreePage name="proj" ref="main" path="" entries={entries} />);
  expect(headOf(html)).toContain("<title>proj: main</title>");
  // directory sorts before the file
  expect(html.indexOf("src/")).toBeLessThan(html.indexOf("a.txt"));
  expect(html).toContain('href="/proj/tree/main/src"');
  expect(html).toContain('href="/proj/tree/main/a.txt"');
  expect(html).toContain("100644");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: FAIL — cannot find module `TreePage`.

- [ ] **Step 3: Implement the Breadcrumb component**

Create `src/views/default/Breadcrumb.tsx`:

```tsx
// Path breadcrumb shared by the tree and blob views. Renders
// `name / ref / seg / seg ...` where every parent segment links back into the
// `/tree/` route and the final segment is plain text.
export function Breadcrumb(props: { name: string; ref: string; path: string }) {
  const segments = props.path.split("/").filter(Boolean);
  const base = `/${props.name}/tree/${props.ref}`;
  let acc = "";
  return (
    <nav class="breadcrumb">
      <a href={`${base}/`}>{props.name}</a>
      <span> / </span>
      <span>{props.ref}</span>
      {segments.map((seg, i) => {
        acc += "/" + seg;
        const last = i === segments.length - 1;
        return (
          <>
            <span> / </span>
            {last ? <span>{seg}</span> : <a href={`${base}${acc}`}>{seg}</a>}
          </>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Implement TreePage**

Create `src/views/default/TreePage.tsx`:

```tsx
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
jj commit -m "feat(ts): add Breadcrumb and TreePage views

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: BlobPage view

**Files:**
- Create: `src/views/default/BlobPage.tsx`
- Test: `tests/views/tree-blob-view.test.tsx` (extend)

- [ ] **Step 1: Add the failing BlobPage tests**

Add to the top imports of `tests/views/tree-blob-view.test.tsx`:

```tsx
import { BlobPage } from "../../src/views/default/BlobPage";
```

Add these tests at the end of the file:

```tsx
test("BlobPage hoists its title, renders text lines and a raw link", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="a.txt" binary={false} text={"foo\nbar"} size={7} />,
  );
  expect(headOf(html)).toContain("<title>proj: a.txt</title>");
  expect(html).toContain('href="/proj/raw/main/a.txt"');
  expect(html).toContain("foo");
  expect(html).toContain("bar");
  expect(html).toContain("7 bytes");
});

test("BlobPage shows a notice for binary files", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="logo.bin" binary={true} size={8} />,
  );
  expect(html).toContain("Binary file not shown.");
  expect(html).toContain('href="/proj/raw/main/logo.bin"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: FAIL — cannot find module `BlobPage`.

- [ ] **Step 3: Implement BlobPage**

Create `src/views/default/BlobPage.tsx`:

```tsx
import { Breadcrumb } from "./Breadcrumb";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  binary: boolean;
  text?: string;   // present when !binary
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${props.name}/raw/${props.ref}/${props.path}`;
  return (
    <>
      <title>{`${props.name}: ${props.path}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <p>
        <a href={rawHref}>raw</a> &middot; {props.size} bytes
      </p>
      {props.binary ? (
        <p class="binary">Binary file not shown.</p>
      ) : (
        <table class="blob">
          <tbody>
            {(props.text ?? "").split("\n").map((line, i) => (
              <tr>
                <td class="lineno">{i + 1}</td>
                <td>
                  <pre>{line}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: PASS (3 tests in the file).

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat(ts): add BlobPage view

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire routes, middleware, and menu

**Files:**
- Modify: `src/middlewares.ts`
- Modify: `src/views/default/renderer.tsx`
- Modify: `src/server.tsx`
- Test: `tests/e2e.test.ts` (extend)

- [ ] **Step 1: Write the failing e2e tests**

Add these tests to `tests/e2e.test.ts` (before the CSS tests near the end):

```ts
test("GET /project/tree/ lists the root tree", async () => {
  const res = await req("/project/tree/");
  expect(res.status).toBe(200);
  const html = await res.text();
  expect(html).toContain("README.md");
  expect(html).toContain("src/");
});

test("GET /project/tree/main/src lists a subdirectory", async () => {
  const html = await (await req("/project/tree/main/src")).text();
  expect(html).toContain("hello.txt");
});

test("GET /project/tree/main/README.md shows the file with a raw link", async () => {
  const html = await (await req("/project/tree/main/README.md")).text();
  expect(html).toContain("# Fixture");
  expect(html).toContain('href="/project/raw/main/README.md"');
});

test("GET /project/tree/main/logo.bin shows a binary notice", async () => {
  const html = await (await req("/project/tree/main/logo.bin")).text();
  expect(html).toContain("Binary file not shown.");
});

test("GET /project/raw/main/README.md serves text/plain", async () => {
  const res = await req("/project/raw/main/README.md");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/plain");
  expect(await res.text()).toContain("# Fixture");
});

test("GET /project/raw/main/logo.bin serves octet-stream", async () => {
  const res = await req("/project/raw/main/logo.bin");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/octet-stream");
});

test("GET /project/tree/main/missing 404s without a redirect", async () => {
  const res = await req("/project/tree/main/missing");
  expect(res.status).toBe(404);
});

test("GET /project/tree redirects to the trailing-slash form", async () => {
  const res = await req("/project/tree");
  expect(res.status).toBe(301);
  expect(new URL(res.headers.get("location")!, "http://localhost").pathname).toBe("/project/tree/");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/e2e.test.ts`
Expected: FAIL — tree/raw routes return 404 (not yet registered).

- [ ] **Step 3: Relax the `useRepository` trailing-slash guard**

In `src/middlewares.ts`, replace the guard line:

```ts
  if (!c.req.path.endsWith("/")) return next();
```

with:

```ts
  // Redirect-only stubs (`/repo`, `/repo/log`) lack a trailing slash and get sent
  // to their slash form by appendTrailingSlash — don't open a repo we'd discard.
  // tree/raw are genuine slash-less content paths, so open the repo for those.
  const p = c.req.path;
  if (!p.endsWith("/") && !p.includes("/tree/") && !p.includes("/raw/")) return next();
```

- [ ] **Step 4: Add the "tree" menu item**

In `src/views/default/renderer.tsx`, replace the `RepoNav` body from the `const active = ...` line through the `return` so it knows about tree, and widen the `item` union:

```tsx
  const name = disc.name;
  const path = c.req.path;
  const active =
    path.includes("/tree/") || path.includes("/raw/")
      ? "tree"
      : path.endsWith("/log/")
        ? "log"
        : "summary";
  const item = (page: "summary" | "log" | "tree", href: string) => (
    <li>
      <a class={`menu-item${active === page ? " active" : ""}`} href={href}>
        {page}
      </a>
    </li>
  );
  return (
    <nav class="terminal-menu">
      <ul>
        {item("summary", `/${name}/`)}
        {item("log", `/${name}/log/`)}
        {item("tree", `/${name}/tree/`)}
      </ul>
    </nav>
  );
```

- [ ] **Step 5: Add the `skip` option to appendTrailingSlash**

In `src/server.tsx`, replace:

```ts
  app.use(appendTrailingSlash());
```

with:

```ts
  // appendTrailingSlash is a 404 fallback: it sends slash-less paths to their
  // slash form only when the response is 404. Exclude tree/raw so a genuine
  // missing-path 404 there is returned as-is rather than bounced to a slash URL.
  app.use(
    appendTrailingSlash({
      skip: (p) => p.includes("/tree/") || p.includes("/raw/"),
    }),
  );
```

- [ ] **Step 6: Add imports to server.tsx**

In `src/server.tsx`, add these imports alongside the existing ones:

```ts
import { isBinary } from "./blob";
import { splitRefPath } from "./git/refpath";
import { BlobPage } from "./views/default/BlobPage";
import { TreePage } from "./views/default/TreePage";
```

- [ ] **Step 7: Register the tree and raw routes**

In `src/server.tsx`, add these two route handlers after the `/:repo/log/` handler and before `app.notFound(...)`:

```tsx
  app.get("/:repo/tree/*", (c) => {
    const repo = c.get("repo");
    const disc = c.get("disc");
    const tail = c.req.path.slice(`/${disc.name}/tree/`.length);
    const refNames = repo.references().map((r) => r.name);
    const { ref, path } = splitRefPath(tail, refNames, repo.headRef());

    const entries = repo.tree(ref, path);
    if (entries) {
      return c.render(<TreePage name={disc.name} ref={ref} path={path} entries={entries} />);
    }
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes !== null) {
      const binary = isBinary(bytes);
      const text = binary ? undefined : new TextDecoder().decode(bytes);
      return c.render(
        <BlobPage name={disc.name} ref={ref} path={path} binary={binary} text={text} size={bytes.length} />,
      );
    }
    throw notFound(`Path not found: ${path}`);
  });

  app.get("/:repo/raw/*", (c) => {
    const repo = c.get("repo");
    const disc = c.get("disc");
    const tail = c.req.path.slice(`/${disc.name}/raw/`.length);
    const refNames = repo.references().map((r) => r.name);
    const { ref, path } = splitRefPath(tail, refNames, repo.headRef());

    const bytes = repo.readFileAtRef(ref, path);
    if (bytes === null) throw notFound(`Path not found: ${path}`);
    const contentType = isBinary(bytes)
      ? "application/octet-stream"
      : "text/plain; charset=utf-8";
    return new Response(bytes, { headers: { "Content-Type": contentType } });
  });
```

Also add `notFound` to the existing import from `./errors` (it currently imports `statusForError`):

```ts
import { notFound, statusForError } from "./errors";
```

- [ ] **Step 8: Run the e2e tests**

Run: `bun test tests/e2e.test.ts`
Expected: PASS (all, including the 8 new tests).

- [ ] **Step 9: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 10: Manually smoke-test the running server**

Run: `CGIT_SCAN_PATH=<a dir containing a bare repo> bun run src/server.tsx`
Then visit `/<repo>/tree/`, click into a directory, click a file, and click its "raw" link. Confirm the directory lists, the file renders with line numbers, and raw serves the bytes.

- [ ] **Step 11: Commit**

```bash
jj commit -m "feat(ts): add /tree and /raw browsing routes and menu item

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** tree route (Task 7), blob view (Task 6), raw route (Task 7), greedy ref resolution (Task 2), menu link (Task 7), files+dirs-with-others-generic listing (Task 4 maps `commit`→submodule, symlinks listed by mode), binary detection (Task 3), content-types (Task 7), error handling via existing `notFound`/`statusForError` (Task 7), all tests in the spec's testing section are present. **Deviation from spec:** the bare `/:repo/tree/` is served directly as the HEAD-branch root (no redirect to `/tree/<branch>/`); `/:repo/tree` (no slash) still redirects to `/:repo/tree/` via appendTrailingSlash. This is simpler and avoids a redirect on every menu click — noted here so it is a conscious choice, not a gap.
- **Placeholder scan:** none — every code step shows complete code.
- **Type consistency:** `TreeEntry` (name/mode/type/oid/size?) is defined in Task 4 and consumed identically by TreePage (Task 5). `tree()` returns `TreeEntry[] | null` everywhere. `splitRefPath` signature `(tail, refNames, defaultRef)` is consistent across Task 2 and its call sites in Task 7. `BlobProps`/`TreeProps` match their render call sites.
</content>
