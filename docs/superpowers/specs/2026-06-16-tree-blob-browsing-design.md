# Tree + Blob Browsing — Design

**Date:** 2026-06-16
**Status:** Approved, pending implementation plan

## Goal

Add file-tree browsing to the cgit TypeScript rewrite: a directory listing
view and a single-file (blob) view, plus a raw-bytes route. This is the
highest-value next page set — it is the browsing surface users click into
most — and it builds on the `readFileAtRef` tree-traversal primitive that the
git facade already has, rather than requiring the diff engine.

## Scope

In scope:

- Directory listing at a ref + path.
- Single file view (text rendered in `<pre>` with line numbers; binary files
  show a notice + raw link).
- Raw-bytes route.
- Greedy ref/path resolution for a path-based URL scheme.
- A "tree" link in the per-repo menu.

Out of scope (explicitly deferred):

- Syntax highlighting.
- Inline image preview.
- Special navigation for symlinks (target resolution) and submodules
  (gitlink → commit linking). These entries are listed by name/mode only.
- `commit` / `diff` / `patch` pages (separate, diff-engine milestone).

## URL scheme

Path-based (cleaner than upstream cgit's `?h=`/`?id=` query scheme):

- `GET /:repo/tree/*` — the single browsing route. After resolving ref + path:
  - path points to a **subtree** → render the directory listing (`TreePage`).
  - path points to a **blob** → render the file view (`BlobPage`).
  - This mirrors cgit's behaviour: a file URL under `/tree/` shows the file.
- `GET /:repo/raw/*` — serve the blob's raw bytes.
- `GET /:repo/tree` (no tail) → `302` redirect to the default branch:
  `/:repo/tree/<HEAD-branch>/`.

### Known inconsistency (deferred)

The existing `/:repo/log/?h=ref` route carries the ref in the query string,
while `/tree/` will carry it in the path. Worth reconciling once more pages
land. Flagged, not fixed in this round.

## Greedy ref/path resolution

New pure module: `src/git/refpath.ts`.

```
splitRefPath(tail: string, refNames: string[]): { ref: string; path: string }
```

Refs can contain slashes (`feature/login`), so the ref portion of the URL tail
cannot be split blindly. Resolution:

1. Match the **longest** ref name in `refNames` that is a prefix of `tail`
   (on a path-segment boundary). The remainder is `path`.
2. If no ref matches and the first segment looks like a hex oid
   (`/^[0-9a-f]{4,40}$/`), treat it as the ref/oid and the rest as `path`.
3. Otherwise default `ref` to the HEAD branch and treat the whole `tail` as
   `path`.

Pure and isolated for straightforward unit testing. `refNames` comes from the
existing `repo.references()`.

## Binding + facade extension

- `src/git/binding/repository.ts` and `src/git/binding/libgit2.ts`: add tree
  listing — resolve ref → commit → tree, walk to the subpath, enumerate the
  entries. Reuses the tree-traversal logic already present for
  `readFileAtRef`.
- `src/git/facade.ts`: add

```ts
export interface TreeEntry {
  name: string;
  mode: number;                          // raw git filemode
  type: "blob" | "tree" | "commit";      // commit == submodule gitlink
  oid: string;
  size?: number;                         // present for blobs
}

// on Repository:
tree(ref: string, path: string): TreeEntry[];
```

Blobs and subtrees are fully populated (size for blobs). Symlinks are blobs
with a symlink filemode and are listed as-is. Submodules are `type: "commit"`
gitlinks, listed by name/mode without navigation.

## Views (`src/views/default/`)

- `TreePage.tsx` — path breadcrumb + entry table: mode, name (linked), size for
  blobs. Subtree entries link back into `/tree/...`; blob entries link into
  `/tree/...` plus a "raw" link to `/raw/...`.
- `BlobPage.tsx` — path breadcrumb + file metadata + a "raw" link.
  - Text content → `<pre>` with line numbers.
  - Binary content (NUL byte within the first ~8000 bytes — git's own
    heuristic) → "binary file" notice + raw link. No syntax highlighting.
- `renderer.tsx` — add a **tree** link to the per-repo menu.

A small `isBinary(bytes: Uint8Array): boolean` helper (NUL-byte scan over the
first ~8000 bytes) is shared by `BlobPage` and the raw route.

## Raw route content-type

- Text → `text/plain; charset=utf-8`.
- Binary → `application/octet-stream`.

Inline image preview is out of scope, so no extension→mime map is needed yet.

## Data flow

```
request
  → useRepository middleware opens the repo (existing)
  → splitRefPath(tail, repo.references()) → { ref, path }
  → /tree:  repo.tree(ref, path)
              entry is subtree → TreePage
              entry is blob    → readFileAtRef → isBinary? → BlobPage
  → /raw:   readFileAtRef → isBinary? → set content-type → return bytes
```

## Error handling

Unknown ref or path throws the existing repo error; `statusForError` maps it to
`404`; the existing `ErrorPage` renders. No new error plumbing.

## Testing

- `tests/git/refpath.test.ts` — simple ref, slashed ref (`feature/x`), oid,
  no-ref default, path-only tail.
- `tests/git/tree.test.ts` — binding lists fixture-repo entries with correct
  sizes and types.
- View tests — `TreePage` / `BlobPage` title hoisting + key content, mirroring
  the existing view tests.
- e2e (`tests/e2e.test.ts`) — tree directory, tree file → blob, raw text,
  raw/binary notice, redirect from bare `/tree`.
</content>
</invoke>
