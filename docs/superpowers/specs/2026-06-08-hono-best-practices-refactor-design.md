# cgit-ts: Align with Hono best practices

**Date:** 2026-06-08
**Branch:** `ts-rewrite`
**Status:** Approved design

## Goal

Refactor the existing TypeScript rewrite (milestone M2) so it follows the practices in
[Hono's best-practices guide](https://hono.dev/docs/guides/best-practices),
[JSX guide](https://hono.dev/docs/guides/jsx), and
[`jsxRenderer` middleware](https://hono.dev/docs/middleware/builtin/jsx-renderer).

This is a pure refactor: **no observable behavior changes.** Every existing test
(`ts/tests/**`) must keep passing unchanged. The e2e tests in `ts/tests/e2e.test.ts` —
which lock down exact redirect targets, status codes, the 404 path, and static-asset
content types — are the behavioral oracle for the routing changes.

## Current state

- `src/server.ts` — a single `createApp(cfg)` registers every route inline. Each handler
  calls a `*VM()` data function then `c.html(Page({ vm }))`.
- `src/routes/render.ts` — the data/service layer: opens repos via the git facade, calls
  the facade, assembles ViewModels.
- `src/routes/{summary,log,repolist}.ts` — pure ViewModel builders (git data → ViewModel).
- `src/views/default/*.tsx` — page components; each manually wraps itself in `<Layout>`.
- `src/views/default/Layout.tsx` — full HTML document; threads `title` and `repoNav`
  through props.

Already best-practice-compliant: handlers call plain helper functions taking explicit
args (not `Context`), so they don't hit the "controller kills path-param inference"
anti-pattern.

## Target design

### 1. Routing — `app.route()` composition

Split the monolithic `createApp` into composed sub-apps so the route tree scales as the
remaining per-repo pages (tree, commit, diff, refs, …) land.

- **`src/server.ts`** — slims to: instantiate `Hono`, register the `jsxRenderer` layout
  middleware (`app.use`), register infrastructure routes (`/healthz`, the two static CSS
  routes), mount the sub-apps, and wire `onError` / `notFound`. No page logic inline.
- **`src/app/root.ts`** — a `Hono` instance for the site root: `GET /` (repolist).
- **`src/app/repo.ts`** — a `Hono` instance defining the **full** repo paths internally
  (`GET /:repo/` summary, `GET /:repo/log/` log, plus the bare→trailing-slash `301`
  redirects `GET /:repo` and `GET /:repo/log`), mounted with `app.route("/", repoApp)`.
  The `:repo` param is read via `c.req.param("repo")`.

Handlers remain thin and call the existing data functions. No `Context`-taking
controllers.

**Resolved by spike (2026-06-08):** mounting on `/:repo` (`app.route("/:repo", repoApp)`)
**breaks** the trailing-slash convention — Hono maps the sub-app's `/` to bare `/project`,
not `/project/`, so canonical pages 404. The working arrangement is the one above: the
sub-app owns the full `/:repo/…` patterns and is mounted at `/`. Root (`GET /`) is mounted
before the repo sub-app so the exact `/` match wins. Verified against all six e2e
behaviors (`/`, `/project/`, `/project/log/`, the two redirects, and the 404).

### 2. JSX rendering — `jsxRenderer` middleware

- Rename **`Layout.tsx` → `src/views/default/renderer.tsx`**, exporting
  `renderer = jsxRenderer(({ children, repoNav }) => <html>…</html>)`.
- Register with `app.use(renderer)` (path `*`) so it wraps every page.
- Handlers change from `c.html(SummaryPage({ vm }))` to
  `c.render(<SummaryPage vm={vm} />, { repoNav: { name, active: "summary" } })`.

**Error pages with the renderer (resolved by spike 2026-06-08):** `c.render` **is**
available inside `app.notFound` and `app.onError`. `c.render` defaults to HTTP 200, so the
status must be set explicitly first: `c.status(404); return c.render(<ErrorPage … />)`.
Metadata hoisting also works through the `jsxRenderer` layout (a page-emitted `<title>` is
hoisted into `<head>`), confirming §3.

### 3. Metadata hoisting — drop the `title` prop

- Remove the `title` prop from the layout entirely.
- Each page emits its own `<title>…</title>` (and any page-specific `<meta>`) inline in
  its JSX; Hono hoists these into `<head>`.
- Titles preserved exactly as today: `vm.repo.name` (summary), `"{name}: log"` (log),
  `"Repositories"` (repolist), `"Error {status}"` (error).

### 4. Context — typed renderer props + a forward-looking `RepoContext`

- `repoNav` is passed as a **typed `ContextRenderer` prop**, augmenting the `hono` module:

  ```ts
  declare module "hono" {
    interface ContextRenderer {
      (content: string | Promise<string>, props?: { repoNav?: RepoNav }): Response;
    }
  }
  ```

  The layout's header reads `repoNav` without it being threaded through page props.

- Introduce **`RepoContext = createContext<{ name: string; ref?: string }>(…)`**, provided
  at the top of `SummaryPage` / `LogPage` and consumed by nested link-building
  sub-components. This is the single place `createContext`/`useContext` earns its keep: it
  removes `repo.name` / `ref` drilling into link helpers and establishes the pattern for
  the deeper pages still to come. Context is **not** introduced where the view tree is
  shallow.

### 5. Async components — deferred (decided)

Views stay pure synchronous functions of a ViewModel; data fetching stays in the data
layer. The git/libgit2 binding is synchronous, so async components would add coupling and
no benefit. If the facade ever becomes async, async components would slot in at the data
boundary inside each page — noted here as the future seam, not implemented now.

## What does not change

- The git facade (`src/git/**`), `src/errors.ts`, the pure ViewModel builders
  (`src/routes/{summary,log,repolist}.ts`), and `src/viewmodels.ts` are untouched.
- The data functions currently in `src/routes/render.ts` stay as the service layer. The
  file may be renamed to `src/data/` for clarity (optional, low-churn) — not required for
  correctness.
- View unit tests keep rendering pages as pure functions: the `RepoContext` provider lives
  inside each page, so string rendering resolves the context with no live request.

## Testing strategy

- Run the full `bun test` suite after each step; it must stay green throughout.
- No new behavior, so no new behavioral tests are strictly required. Add a focused unit
  test only if `RepoContext` link-building introduces a new pure helper worth pinning.
- The e2e suite is the source of truth for the routing/redirect/404/static behavior.

## File-level change summary

| File | Change |
|------|--------|
| `src/server.ts` | Slim to middleware + mounts + error wiring |
| `src/app/root.ts` | New — root `Hono` (`GET /`) |
| `src/app/repo.ts` | New — repo `Hono` mounted at `/:repo` |
| `src/views/default/renderer.tsx` | New — `jsxRenderer` layout (replaces `Layout.tsx`) |
| `src/views/default/Layout.tsx` | Removed |
| `src/views/default/RepolistPage.tsx` | Drop `<Layout>`; emit `<title>` |
| `src/views/default/SummaryPage.tsx` | Drop `<Layout>`; emit `<title>`; provide `RepoContext` |
| `src/views/default/LogPage.tsx` | Drop `<Layout>`; emit `<title>`; provide `RepoContext` |
| `src/views/default/ErrorPage.tsx` | Drop `<Layout>`; emit `<title>` |
| `src/routes/render.ts` | Unchanged (optionally moved to `src/data/`) |
| git facade, errors, VM builders, viewmodels | Unchanged |
