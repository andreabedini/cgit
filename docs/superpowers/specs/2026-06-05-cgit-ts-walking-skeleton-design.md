# cgit-ts — Walking Skeleton (Milestone 1) — Design

**Date:** 2026-06-05
**Status:** Approved for planning
**Scope:** Milestone 1 only (the walking skeleton). Later milestones are sketched under *Roadmap* but not specified here.

## Project vision

A TypeScript/Bun reimplementation of cgit as a **spiritual successor**, not a faithful
drop-in clone. cgit is fast and beloved but hard to customise. The successor keeps the
purpose — a fast web frontend for browsing Git repositories — while making customisation
first-class. The two customisation pillars that drive the architecture are:

1. **Templating / theming** — HTML is authored as composable, type-safe components that
   can later be overridden by themes without recompiling the core.
2. **Plugins / hooks** — a later capability to contribute pages, columns, and content
   transforms. Not built in Milestone 1, but the module boundaries are designed so it can
   be added additively rather than via a rewrite.

Faithfulness to cgit's exact output, URL scheme, or `cgitrc` format is **not** a goal.

## Milestone 1 goal

Prove the entire stack end-to-end through the fewest pages: discover repositories, list
them, show one repository's summary, and show a paginated commit log. Concretely, this
exercises every layer — repo discovery, the libgit2 access layer, routing, JSX rendering,
and HTTP serving — so that every subsequent page reuses proven machinery.

**Pages in scope:** `repolist`, `summary`, `log`.

## Technology decisions (locked)

| Concern | Decision |
|---|---|
| Runtime | Bun 1.3.14 (confirmed present) |
| HTTP server | Hono (`Bun.serve` under the hood) |
| Rendering | Hono JSX / TSX, server-rendered to a string |
| Git access | libgit2 1.9.3 (confirmed present), behind a typed facade; **binding impl chosen by a spike** (see below) |
| Language | TypeScript throughout |
| Caching | **None in M1**; request path shaped so a cache can wrap dispatch later |
| Plugins | **None in M1**; module boundaries designed to admit a registry later |
| Tests | Bun's built-in test runner; TDD |

## Repository placement

All new code lives in a new top-level `ts/` directory. The existing C cgit and its `git/`
submodule are **left untouched**.

```
ts/
  src/
    server.ts            # Bun.serve + Hono app wiring, config load
    config/              # typed site/repo config
    scan/                # filesystem repo discovery (scan-tree analogue)
    git/
      facade.ts          # interface: Repository, Reference, Commit, Tree, Blob
      binding/           # libgit2 access; impl decided by spike
    routes/              # repolist, summary, log handlers
    views/
      default/           # default-theme TSX components (Layout + pages)
    errors.ts            # typed error kinds
  tests/
  package.json
  tsconfig.json
```

## Architecture

Strict downward-only layering. Each layer depends only on layers below it.

```
server.ts            Bun.serve + Hono app, config load
  routes/            request -> ViewModel         (calls Git facade only)
  views/             ViewModel -> HTML            (pure; never touches git)
  git/facade         typed Git facade            (the ONLY caller of the binding)
  git/binding        libgit2 access              (spike decides impl)
  scan/  config/     repo discovery + typed config
```

**The keystone boundary:** a route handler parses the request, calls the **Git facade**
(never the raw binding), assembles a **plain ViewModel object**, and passes it to a
**view component**. Views are pure `ViewModel -> HTML`. Consequences:

- No raw libgit2 pointers or types escape `git/`.
- No HTML strings exist outside `views/` (ViewModels carry plain data only — never
  pre-rendered HTML — so JSX auto-escaping is never bypassed).
- Future theming swaps the view; future plugins feed routes/views from a registry. Both
  are additive because the ViewModel contract sits between handler and view.

## Git access layer

### Spike (first task of the milestone)

The binding carries the most risk, so the milestone opens with a timeboxed spike that
evaluates options **in order** and stops at the first that passes:

1. An existing **Bun-FFI** libgit2 package.
2. A **Node N-API** libgit2 binding (e.g. `nodegit`-style) under Bun's Node compat.
3. **Hand-rolled `bun:ffi`** via `dlopen` against system `libgit2.so.1.9`.

**Acceptance criteria for a binding:** can open a repo; enumerate references
(branches/tags) with their target oids; perform a revwalk yielding commit fields
(oid, author, committer, timestamps, summary, full message, parent oids); read a blob's
bytes by path at a ref. Must not leak/crash under repeated requests, build cleanly under
Bun, and not be abandonware.

**Spike output:** a one-page decision note committed to the repo, plus the facade
interface with the chosen implementation behind it.

### Facade

The facade is defined as a **TypeScript interface** so the binding is swappable and the
facade is mockable in handler tests. If we hand-roll, the facade owns all pointer lifetime
and freeing; nothing above it ever sees a pointer.

Minimal surface required by M1:

- `openRepository(path): Repository`
- `Repository.references(): Reference[]` (name, kind branch|tag, target oid, peeled
  commit for annotated tags)
- `Repository.log({ ref, offset, limit }): { commits: Commit[]; hasMore: boolean }`
  (uses offset/limit + a `hasMore` flag rather than a total count, since counting all
  commits in a revwalk is expensive; the log pager is next/prev based)
- `Commit` fields: oid, abbreviated oid, author {name,email,when}, committer, summary,
  message, parent oids.
- `Repository.readFileAtRef(ref, path): bytes | null` (for the README/about).
- `Repository.headRef()` / default branch resolution.

## ViewModels and pages

Grounded in what cgit's equivalent pages display.

### Repolist (`routes/repolist`, `views/default/RepolistPage`)

`RepolistViewModel`: `{ repos: RepoListEntry[]; sections?: string[]; pager: PagerVM }`
where `RepoListEntry = { name, description, owner?, lastCommitWhen?, links }`.
- Columns: name, description, owner (optional), idle/last-commit age, nav links
  (summary/log/tree).
- Optional section grouping (gray divider rows when section changes).
- Pagination: numbered pages, shown only when total exceeds page size; offset-based.
  (Repo count is cheap to know, so repolist's pager can be numbered.)

### Summary (`routes/summary`, `views/default/SummaryPage`)

`SummaryViewModel`: `{ repo: RepoMeta; branches: Ref[]; tags: Ref[];
recentCommits: Commit[]; cloneUrls: string[]; about?: RenderedAbout }`.
- Branches (capped count), tags (capped count).
- Recent log: last N commits (subject, author, decorations) — fixed limit, no pagination.
- Clone URLs.
- About/README: load the first configured README and render it as **escaped plain text**
  in M1. Markdown/AsciiDoc rendering and the filter pipeline are a later milestone.
  Wrapped in its own section.

### Log (`routes/log`, `views/default/LogPage`)

`LogViewModel`: `{ repo: RepoMeta; commits: LogRow[]; pager: PagerVM; ref: string }`
where `LogRow = { abbrevOid, subject, author, when, ageLabel, decorations: Ref[] }`.
- Per row: subject, author, age, ref decorations (branch/tag badges).
- Pagination: offset/limit (`ofs`), next/prev based (driven by `hasMore`), preserving
  `p`, `h`, and sort params.
- Commit-graph rendering is **out of scope** for M1.

## Rendering conventions

- Hono JSX, SSR to a string. A single `<Layout>` provides chrome: site header, repo nav
  (when in a repo), footer. Each page is a component taking its ViewModel as props.
- All interpolation is JSX auto-escaped. The single discipline rule: **ViewModels carry
  plain data, never pre-built HTML.**
- One static CSS stylesheet served by Hono.
- Components live in `views/default/` — the `default` segment foreshadows themes without
  building theme resolution in M1.

## Routing and cache-readiness

- URL scheme keeps cgit's familiar query style for M1: `?p=<repo>&page=<cmd>&h=<ref>&ofs=<n>`.
  Pretty `PATH_INFO` URLs are a later milestone.
- Each handler is `(ctx) => Promise<Response>`, pure-ish (no hidden global mutation).
- A request is identified by `(repo, page, query)`. No cache is built, but this identity
  plus the no-hidden-state rule means a future cache or plugin registry wraps the dispatch
  without touching handler internals.

## Error handling

Three buckets, mapped at the handler boundary:

1. Repo or ref not found -> **404** page.
2. Bad/missing query params -> **400** page.
3. libgit2 / FFI errors -> caught at the facade, logged, surfaced as a **500** page.
   A raw pointer error or process crash is never acceptable.

Facade methods return typed results or throw typed errors (`errors.ts`); handlers map
error kinds to status + the corresponding error view.

## Testing

Bun's built-in test runner, TDD throughout. Three layers:

1. **Facade integration tests** against a real fixture repo built in a temp dir (mirrors
   how cgit's own suite constructs throwaway repos). Exercises the real binding.
2. **Handler tests** with a **mocked facade**, asserting ViewModel shape and error mapping.
3. **End-to-end tests** hitting the running Hono app and asserting on rendered HTML for
   each of the three pages.

## Out of scope for Milestone 1

Each is a candidate later milestone:

- SQLite response caching (interface + store).
- Plugin / registry system.
- Theme override resolution.
- The other 18 page types (tree, blob, commit, diff, blame, refs, snapshot, stats, atom,
  plain, patch, tag, …).
- Smart-HTTP clone endpoints, snapshots, auth filters.
- Pretty `PATH_INFO` URLs.
- The full content-filter pipeline (rich Markdown/AsciiDoc, syntax highlighting).
- Commit-graph rendering on the log page.

## Roadmap (indicative order, not specified here)

1. **M1 — walking skeleton** (this doc): repolist + summary + log.
2. M2 — browse path: tree + blob + commit + diff.
3. M3 — caching layer (interface already cache-ready) backed by SQLite.
4. M4 — plugin/registry system + theme override resolution (seams already designed in).
5. M5+ — remaining pages, clone endpoints, snapshots, pretty URLs.

## Binding decision

**Chosen: Option 3 — hand-rolled `bun:ffi` via `dlopen` against `libgit2.so.1.9`.**

The spike evaluated all three options in priority order. Option 1 (a Bun-FFI
libgit2 package) does not exist on npm: the only `libgit2` package is an
abandoned 2016 Emscripten/WASM port (single version, zero deps, wrong shape — it
cannot open a real on-disk repository path) and there is no `bun-libgit2`-style
package. Option 2 (a Node N-API binding such as `nodegit`) requires native
compilation against a specific libgit2/Node ABI, is heavy, and is fragile under
Bun's Node compatibility layer, with no guarantee the prebuilt binaries match
this host's libgit2 1.9.3. Option 3 is guaranteed available (libgit2.so.1.9 is
installed at `/lib64`), gives full control over marshalling, and made the
acceptance test pass cleanly. The typed facade (`facade.ts`) keeps the binding
swappable, so a future package can replace `repository.ts` without touching
callers.

Notes for Tasks 5-7: `bun:ffi` pointers are plain JS numbers at runtime but the
`Pointer` type is branded, so a `toPtr(n)` cast helper in `libgit2.ts` is used at
every FFI call boundary to satisfy `tsc`. Also, on this Bun version (1.3.14) a
symbol declared `returns: FFIType.cstring` came back as a boxed `CString` (a
`String` object), not a primitive — `String(...)` is used to normalize it; do the
same for any future cstring-returning calls.
