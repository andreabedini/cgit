# Hono Best-Practices Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the cgit TypeScript rewrite to follow Hono best practices — `jsxRenderer` layout middleware, metadata hoisting, JSX `createContext`, and `app.route()` composition — with zero observable behavior change.

**Architecture:** Replace the manually-wrapped `Layout` component with a `jsxRenderer` middleware that owns the HTML document. Pages become content fragments that emit their own `<title>` (hoisted into `<head>`). A typed `ContextRenderer` prop carries `repoNav` to the layout; a `RepoContext` carries the current repo name/ref to nested link-builders. Routes split into a root sub-app and a repo sub-app, both mounted at `/` with the repo sub-app owning full `/:repo/…` patterns.

**Tech Stack:** Bun, Hono 4.12, hono/jsx, hono/jsx-renderer, TypeScript (strict), `bun test`.

**Spec:** `docs/superpowers/specs/2026-06-08-hono-best-practices-refactor-design.md`

**Working directory for all commands:** `ts/` (run `cd ts` first; `bun test` and `serveStatic` paths assume this cwd).

**Behavioral oracle:** `ts/tests/e2e.test.ts` locks down redirect targets, status codes, the 404 path, and static-asset content types. It must stay green after every task. Spike-verified facts this plan relies on:
- Metadata hoisting works through the `jsxRenderer` layout.
- `c.render` is available inside `app.notFound` / `app.onError`, but defaults to HTTP 200 — call `c.status(n)` first.
- Mounting the repo routes as full `/:repo/…` patterns at `app.route("/", repoApp)` preserves the trailing-slash convention (mounting on `/:repo` does **not**).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/views/default/renderer.tsx` | **New.** `jsxRenderer` layout middleware: full HTML document, header (with `repoNav` menu), footer, CSS links. Declares `RepoNav` type and augments `ContextRenderer`. Replaces `Layout.tsx`. |
| `src/views/default/RepoContext.tsx` | **New.** `createContext` for `{ name, ref? }` + `useRepo()` hook. |
| `src/views/default/Layout.tsx` | **Deleted.** |
| `src/views/default/RepolistPage.tsx` | Content fragment; emits `<title>`. |
| `src/views/default/SummaryPage.tsx` | Content fragment; emits `<title>`; provides `RepoContext`. |
| `src/views/default/LogPage.tsx` | Content fragment; emits `<title>`; provides `RepoContext`; `<Pager>` sub-component consumes `useRepo()`. |
| `src/views/default/ErrorPage.tsx` | Content fragment; emits `<title>`. |
| `src/app/root.tsx` | **New.** `createRootApp(cfg)` — `GET /` (repolist). |
| `src/app/repo.tsx` | **New.** `createRepoApp(cfg)` — `GET /:repo/`, `GET /:repo/log/`, and the two bare→slash redirects. |
| `src/server.tsx` | **Renamed from `server.ts`.** `createApp(cfg)`: registers renderer middleware + infra routes, mounts sub-apps, wires `notFound`/`onError`. |
| `package.json` | Update `module` and `dev` script `src/server.ts` → `src/server.tsx`. |
| `tests/views/renderer.test.tsx` | **New.** Layout/hoisting/nav tests. |
| `tests/views/repo-context.test.tsx` | **New.** `useRepo` resolves through `.toString()`. |

Unchanged: `src/git/**`, `src/errors.ts`, `src/routes/{summary,log,repolist}.ts` (pure VM builders), `src/routes/render.ts` (data/service layer), `src/viewmodels.ts`, `src/format.ts`, `src/config/config.ts`, `src/scan/scan.ts`.

---

## Task 1: jsxRenderer layout middleware (`renderer.tsx`)

**Files:**
- Create: `src/views/default/renderer.tsx`
- Test: `tests/views/renderer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/views/renderer.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { Hono } from "hono";
import { renderer } from "../../src/views/default/renderer";

function appWith(body: Parameters<Hono["get"]>[1]) {
  const app = new Hono();
  app.use(renderer);
  app.get("/", body);
  return app;
}

test("renderer wraps content in a full HTML document with CSS links", async () => {
  const app = appWith((c) => c.render(<p>hello</p>));
  const html = await (await app.request("/")).text();
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain('href="/terminal.min.css"');
  expect(html).toContain('href="/cgit.css"');
  expect(html).toContain("<p>hello</p>");
});

test("renderer hoists a page <title> into <head>", async () => {
  const app = appWith((c) =>
    c.render(
      <>
        <title>My Title</title>
        <p>x</p>
      </>,
    ),
  );
  const html = await (await app.request("/")).text();
  const head = html.slice(0, html.indexOf("</head>"));
  expect(head).toContain("<title>My Title</title>");
});

test("renderer shows the repo nav menu with the active tab", async () => {
  const app = appWith((c) =>
    c.render(<p>x</p>, { repoNav: { name: "alpha", active: "log" } }),
  );
  const html = await (await app.request("/")).text();
  expect(html).toContain('href="/alpha/"');
  expect(html).toContain('href="/alpha/log/"');
  expect(html).toContain('class="menu-item active"');
});

test("renderer omits the repo nav when no repoNav is given", async () => {
  const app = appWith((c) => c.render(<p>x</p>));
  const html = await (await app.request("/")).text();
  expect(html).not.toContain("terminal-menu");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ts && bun test tests/views/renderer.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/default/renderer'`.

- [ ] **Step 3: Write the renderer**

Create `src/views/default/renderer.tsx`:

```tsx
import { jsxRenderer } from "hono/jsx-renderer";
import type { PropsWithChildren } from "hono/jsx";

export interface RepoNav {
  name: string;
  active: "summary" | "log";
}

// Type the second argument of c.render(content, props) for every handler.
declare module "hono" {
  interface ContextRenderer {
    (content: string | Promise<string>, props?: { repoNav?: RepoNav }): Response;
  }
}

function Header({ repoNav }: { repoNav?: RepoNav }) {
  return (
    <header>
      <div class="terminal-nav">
        <div class="terminal-logo">
          <div class="logo terminal-prompt">
            <a href="/">cgit-ts</a>
          </div>
        </div>
        {repoNav ? (
          <nav class="terminal-menu">
            <ul>
              <li>
                <a
                  class={`menu-item${repoNav.active === "summary" ? " active" : ""}`}
                  href={`/${repoNav.name}/`}
                >
                  summary
                </a>
              </li>
              <li>
                <a
                  class={`menu-item${repoNav.active === "log" ? " active" : ""}`}
                  href={`/${repoNav.name}/log/`}
                >
                  log
                </a>
              </li>
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

export const renderer = jsxRenderer(
  ({ children, repoNav }: PropsWithChildren<{ repoNav?: RepoNav }>) => (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/terminal.min.css" />
        <link rel="stylesheet" href="/cgit.css" />
      </head>
      <body>
        <div class="container">
          <Header repoNav={repoNav} />
          <main>{children}</main>
          <hr />
          <footer>
            <p>generated by cgit-ts</p>
          </footer>
        </div>
      </body>
    </html>
  ),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ts && bun test tests/views/renderer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd ts && git add src/views/default/renderer.tsx tests/views/renderer.test.tsx
git commit -m "feat(ts): jsxRenderer layout middleware with metadata hoisting"
```

---

## Task 2: RepoContext + useRepo (`RepoContext.tsx`)

**Files:**
- Create: `src/views/default/RepoContext.tsx`
- Test: `tests/views/repo-context.test.tsx`

This task de-risks Task 3 by proving `useContext` resolves during a standalone `.toString()` (the pattern the view unit tests rely on).

- [ ] **Step 1: Write the failing test**

Create `tests/views/repo-context.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { RepoContext, useRepo } from "../../src/views/default/RepoContext";

function DeepChild() {
  const { name, ref } = useRepo();
  return <a href={`/${name}/log/?h=${ref}`}>link</a>;
}

function Wrapper() {
  return (
    <RepoContext.Provider value={{ name: "alpha", ref: "main" }}>
      <div>
        <DeepChild />
      </div>
    </RepoContext.Provider>
  );
}

test("useRepo reads the provided repo context from a nested component", () => {
  const html = Wrapper().toString();
  expect(html).toContain('href="/alpha/log/?h=main"');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ts && bun test tests/views/repo-context.test.tsx`
Expected: FAIL — `Cannot find module '../../src/views/default/RepoContext'`.

- [ ] **Step 3: Write RepoContext**

Create `src/views/default/RepoContext.tsx`:

```tsx
import { createContext, useContext } from "hono/jsx";

export interface RepoCtx {
  name: string;
  ref?: string;
}

export const RepoContext = createContext<RepoCtx>({ name: "" });

export function useRepo(): RepoCtx {
  return useContext(RepoContext);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ts && bun test tests/views/repo-context.test.tsx`
Expected: PASS (1 test). If it FAILS because context does not resolve during `.toString()`, STOP and report — Task 3's `LogPage` `<Pager>` depends on this; the fallback is to pass `name`/`ref` as explicit props to `<Pager>` and skip `useRepo` there.

- [ ] **Step 5: Commit**

```bash
cd ts && git add src/views/default/RepoContext.tsx tests/views/repo-context.test.tsx
git commit -m "feat(ts): RepoContext + useRepo for nested repo-relative links"
```

---

## Task 3: Convert pages to fragments + wire renderer into server

This is the one coordinated change: pages drop `<Layout>` and the server must simultaneously switch from `c.html(Page({vm}))` to `c.render(<Page/>)`, otherwise output loses the HTML document. `server.ts` gains JSX, so it is renamed to `server.tsx`. Routing stays monolithic here; Task 4 splits it.

**Files:**
- Modify: `src/views/default/RepolistPage.tsx`
- Modify: `src/views/default/SummaryPage.tsx`
- Modify: `src/views/default/LogPage.tsx`
- Modify: `src/views/default/ErrorPage.tsx`
- Delete: `src/views/default/Layout.tsx`
- Rename + rewrite: `src/server.ts` → `src/server.tsx`
- Modify: `package.json`

- [ ] **Step 1: Rewrite `RepolistPage.tsx`**

Replace the whole file `src/views/default/RepolistPage.tsx`:

```tsx
import type { RepolistViewModel } from "../../viewmodels";

export function RepolistPage(props: { vm: RepolistViewModel }) {
  return (
    <>
      <title>Repositories</title>
      <table class="repolist">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Owner</th>
            <th>Idle</th>
          </tr>
        </thead>
        <tbody>
          {props.vm.repos.map((r) => (
            <tr>
              <td>
                <a href={`/${r.name}/`}>{r.name}</a>
              </td>
              <td>{r.description ?? ""}</td>
              <td>{r.owner ?? ""}</td>
              <td>{r.lastCommitAge ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `SummaryPage.tsx`**

Replace the whole file `src/views/default/SummaryPage.tsx`:

```tsx
import { RepoContext } from "./RepoContext";
import type { SummaryViewModel, RefVM, LogRow } from "../../viewmodels";

function RefList(props: { title: string; refs: RefVM[] }) {
  return (
    <section>
      <h3>{props.title}</h3>
      <ul>
        {props.refs.map((r) => (
          <li>
            {r.name} <code>{r.abbrevOid}</code>
          </li>
        ))}
      </ul>
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
    <RepoContext.Provider value={{ name: vm.repo.name }}>
      <title>{vm.repo.name}</title>
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
          <ul>
            {vm.cloneUrls.map((u) => (
              <li>
                <code>{u}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {vm.about ? (
        <section id="summary">
          <h3>About</h3>
          <pre class="about">{vm.about}</pre>
        </section>
      ) : null}
    </RepoContext.Provider>
  );
}
```

Note: the `RepoContext.Provider` here has no consumer yet (forward-looking, per spec §4 — the deeper tree/commit pages will read it). It emits no markup, so view tests are unaffected.

- [ ] **Step 3: Rewrite `LogPage.tsx`**

Replace the whole file `src/views/default/LogPage.tsx`:

```tsx
import { RepoContext, useRepo } from "./RepoContext";
import type { LogViewModel, PagerVM } from "../../viewmodels";

function Pager(props: { pager: PagerVM }) {
  const { name, ref } = useRepo();
  const base = `/${name}/log/?h=${ref}`;
  const prevOfs = Math.max(0, props.pager.offset - props.pager.limit);
  const nextOfs = props.pager.offset + props.pager.limit;
  return (
    <nav class="pager btn-group">
      {props.pager.hasPrev ? (
        <a class="btn btn-default" href={`${base}&ofs=${prevOfs}`}>
          &laquo; newer
        </a>
      ) : null}
      {props.pager.hasNext ? (
        <a class="btn btn-default" href={`${base}&ofs=${nextOfs}`}>
          older &raquo;
        </a>
      ) : null}
    </nav>
  );
}

export function LogPage(props: { vm: LogViewModel }) {
  const { vm } = props;
  return (
    <RepoContext.Provider value={{ name: vm.repo.name, ref: vm.ref }}>
      <title>{`${vm.repo.name}: log`}</title>
      <h2>
        {vm.repo.name}: log ({vm.ref})
      </h2>
      <table class="log">
        <thead>
          <tr>
            <th>Age</th>
            <th>Commit</th>
            <th>Author</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {vm.rows.map((row) => (
            <tr>
              <td>{row.ageLabel}</td>
              <td>
                <code>{row.abbrevOid}</code> {row.subject}
              </td>
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
      <Pager pager={vm.pager} />
    </RepoContext.Provider>
  );
}
```

- [ ] **Step 4: Rewrite `ErrorPage.tsx`**

Replace the whole file `src/views/default/ErrorPage.tsx`:

```tsx
export function ErrorPage(props: { status: number; message: string }) {
  return (
    <>
      <title>{`Error ${props.status}`}</title>
      <h2>Error {props.status}</h2>
      <div class="terminal-alert terminal-alert-error" role="alert">
        {props.message}
      </div>
    </>
  );
}
```

- [ ] **Step 5: Delete `Layout.tsx`**

```bash
cd ts && git rm src/views/default/Layout.tsx
```

- [ ] **Step 6: Rename `server.ts` → `server.tsx` and rewrite it**

```bash
cd ts && git mv src/server.ts src/server.tsx
```

Replace the whole file `src/server.tsx`:

```tsx
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, type SiteConfig } from "./config/config";
import { renderer } from "./views/default/renderer";
import { repolistVM, summaryVM, logVM } from "./routes/render";
import { RepolistPage } from "./views/default/RepolistPage";
import { SummaryPage } from "./views/default/SummaryPage";
import { LogPage } from "./views/default/LogPage";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  // Layout middleware first so c.render is available to every handler below
  // (including notFound/onError).
  app.use(renderer);

  // Infra routes are registered before the `/:repo` routes so requests like
  // `/healthz` or `/cgit.css` match here and never look like a repo name.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/terminal.min.css", serveStatic({ path: "./src/public/terminal.min.css" }));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.get("/", (c) => c.render(<RepolistPage vm={repolistVM(cfg)} />));

  // Canonical pages use trailing slashes; redirect the bare forms to them.
  app.get("/:repo", (c) => c.redirect(`/${c.req.param("repo")}/`, 301));
  app.get("/:repo/log", (c) => c.redirect(`/${c.req.param("repo")}/log/`, 301));

  app.get("/:repo/", (c) => {
    const vm = summaryVM(cfg, c.req.param("repo"));
    return c.render(<SummaryPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "summary" },
    });
  });

  app.get("/:repo/log/", (c) => {
    const repo = c.req.param("repo");
    const ref = c.req.query("h") || undefined;
    const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    const vm = logVM(cfg, repo, ref, ofs);
    return c.render(<LogPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "log" },
    });
  });

  app.notFound((c) => {
    c.status(404);
    return c.render(<ErrorPage status={404} message="Not found" />);
  });

  app.onError((err, c) => {
    const status = statusForError(err);
    const message = err instanceof Error ? err.message : "Internal error";
    if (status === 500) console.error(err);
    c.status(status as 400 | 404 | 500);
    return c.render(<ErrorPage status={status} message={message} />);
  });

  return app;
}

const app = createApp(loadConfig());

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

- [ ] **Step 7: Update `package.json`**

In `package.json` change both references:

```json
  "module": "src/server.tsx",
```
```json
    "dev": "bun run src/server.tsx",
```

- [ ] **Step 8: Run the full suite**

Run: `cd ts && bun test`
Expected: PASS — all suites green, including `tests/e2e.test.ts` (redirects, 404, css content-type) and the view unit tests (`SummaryPage({vm}).toString()` etc. still contain the expected escaped HTML; the new inline `<title>` does not break any `toContain` assertion).

If `tests/views/summary-log-view.test.ts` or `tests/views/repolist-view.test.ts` fail, inspect the produced string — the assertions check `main`, `v1.0`, `Add &lt;x&gt;`, `# Title &amp; stuff`, clone URL (summary), `Add a`, `main`, `/alpha/log/`, `ofs=0`, `ofs=100` (log), and `alpha`, `first &lt;repo&gt;`, `href="/alpha/"` (repolist). All are page-body content preserved by this refactor.

- [ ] **Step 9: Commit**

```bash
cd ts && git add -A
git commit -m "refactor(ts): render pages via jsxRenderer + metadata hoisting

Drop the per-page Layout wrapper; pages emit their own <title> (hoisted).
LogPage pager reads repo name/ref from RepoContext. server.ts -> server.tsx."
```

---

## Task 4: Split routing into composed sub-apps (`app.route()`)

Extract the root and repo handlers into their own Hono instances and mount them. Verified arrangement: repo sub-app owns full `/:repo/…` patterns, mounted at `app.route("/", …)`.

**Files:**
- Create: `src/app/root.tsx`
- Create: `src/app/repo.tsx`
- Modify: `src/server.tsx`

- [ ] **Step 1: Create `src/app/root.tsx`**

```tsx
import { Hono } from "hono";
import type { SiteConfig } from "../config/config";
import { repolistVM } from "../routes/render";
import { RepolistPage } from "../views/default/RepolistPage";

export function createRootApp(cfg: SiteConfig) {
  const app = new Hono();
  app.get("/", (c) => c.render(<RepolistPage vm={repolistVM(cfg)} />));
  return app;
}
```

- [ ] **Step 2: Create `src/app/repo.tsx`**

```tsx
import { Hono } from "hono";
import type { SiteConfig } from "../config/config";
import { summaryVM, logVM } from "../routes/render";
import { SummaryPage } from "../views/default/SummaryPage";
import { LogPage } from "../views/default/LogPage";

export function createRepoApp(cfg: SiteConfig) {
  const app = new Hono();

  // Canonical pages use trailing slashes; redirect the bare forms to them.
  app.get("/:repo", (c) => c.redirect(`/${c.req.param("repo")}/`, 301));
  app.get("/:repo/log", (c) => c.redirect(`/${c.req.param("repo")}/log/`, 301));

  app.get("/:repo/", (c) => {
    const vm = summaryVM(cfg, c.req.param("repo"));
    return c.render(<SummaryPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "summary" },
    });
  });

  app.get("/:repo/log/", (c) => {
    const repo = c.req.param("repo");
    const ref = c.req.query("h") || undefined;
    const ofs = Math.max(0, Number(c.req.query("ofs") ?? 0) | 0);
    const vm = logVM(cfg, repo, ref, ofs);
    return c.render(<LogPage vm={vm} />, {
      repoNav: { name: vm.repo.name, active: "log" },
    });
  });

  return app;
}
```

- [ ] **Step 3: Rewrite `src/server.tsx` to compose the sub-apps**

Replace the whole file `src/server.tsx`:

```tsx
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { loadConfig, type SiteConfig } from "./config/config";
import { renderer } from "./views/default/renderer";
import { createRootApp } from "./app/root";
import { createRepoApp } from "./app/repo";
import { ErrorPage } from "./views/default/ErrorPage";
import { statusForError } from "./errors";

export function createApp(cfg: SiteConfig) {
  const app = new Hono();

  app.use(renderer);

  // Infra routes are registered before the repo sub-app so requests like
  // `/healthz` or `/cgit.css` never match the `/:repo` redirect.
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/terminal.min.css", serveStatic({ path: "./src/public/terminal.min.css" }));
  app.get("/cgit.css", serveStatic({ path: "./src/public/cgit.css" }));

  app.route("/", createRootApp(cfg));
  app.route("/", createRepoApp(cfg));

  app.notFound((c) => {
    c.status(404);
    return c.render(<ErrorPage status={404} message="Not found" />);
  });

  app.onError((err, c) => {
    const status = statusForError(err);
    const message = err instanceof Error ? err.message : "Internal error";
    if (status === 500) console.error(err);
    c.status(status as 400 | 404 | 500);
    return c.render(<ErrorPage status={status} message={message} />);
  });

  return app;
}

const app = createApp(loadConfig());

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: app.fetch,
};
```

- [ ] **Step 4: Run the full suite**

Run: `cd ts && bun test`
Expected: PASS — all suites green. The e2e suite confirms the composed routing preserves: `GET /` (200, lists repo), `GET /project/` (200), `GET /project/log/` (200, pager), `GET /missing/` (404), `GET /project` (301 → `/project/`), `GET /project/log` (301 → `/project/log/`), and both CSS routes (200, `text/css`).

If a redirect test fails (e.g. `/project/` 404s), the mount arrangement is wrong — re-confirm the repo sub-app uses full `/:repo/…` patterns and is mounted with `app.route("/", …)`, not `app.route("/:repo", …)`.

- [ ] **Step 5: Commit**

```bash
cd ts && git add -A
git commit -m "refactor(ts): compose routes via app.route() root + repo sub-apps"
```

---

## Task 5: Typecheck + final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the TypeScript type checker**

Run: `cd ts && bunx tsc --noEmit`
Expected: no errors. If `tsc` reports that `repoNav` is not assignable in `c.render(...)`, confirm the `declare module "hono"` augmentation in `renderer.tsx` is part of the compilation (it is global; no import needed) and that `RepoNav` matches the shape passed at the call sites.

- [ ] **Step 2: Run the full test suite once more**

Run: `cd ts && bun test`
Expected: PASS — every suite green.

- [ ] **Step 3: Manually confirm a rendered page (optional sanity check)**

Run: `cd ts && bun run src/server.tsx &` then `curl -s localhost:3000/healthz` (expect `ok`); stop the server afterward. Skip if a scan path with repos is not configured.

- [ ] **Step 4: Final commit (only if Step 1–2 produced fixes)**

```bash
cd ts && git add -A
git commit -m "chore(ts): typecheck clean after Hono best-practices refactor"
```

---

## Self-Review

**Spec coverage:**
- §1 `app.route()` composition → Task 4 (root + repo sub-apps, verified mount arrangement).
- §2 `jsxRenderer` middleware → Task 1 (renderer) + Task 3 (wired, `c.render`).
- §3 Metadata hoisting → Task 1 test + Task 3 (pages emit `<title>`, layout has none).
- §4 Context: typed `ContextRenderer` `repoNav` prop → Task 1; `RepoContext`/`useRepo` consumed by `LogPage` `<Pager>` → Tasks 2–3.
- §5 Async components deferred → no task (correct; nothing to implement).
- "What does not change" → git facade, errors, VM builders, viewmodels, render.ts untouched; confirmed no task modifies them.
- Error status fix (`c.status` before `c.render`) → Tasks 3 & 4 `notFound`/`onError`.

**Placeholder scan:** none — every code step shows full file content or exact edits; every run step has an exact command and expected result.

**Type consistency:** `RepoNav { name; active }` (renderer) used identically in `repoNav` props at all `c.render` call sites (Tasks 3, 4). `RepoCtx { name; ref? }` (RepoContext) provided by `SummaryPage` (`{ name }`) and `LogPage` (`{ name, ref }`), consumed by `useRepo()` in `Pager`. `createApp(cfg: SiteConfig)` signature unchanged, so `tests/{e2e,smoke}.test.ts` need no edits. Import paths from `src/app/*.tsx` use `../` (one level up from `src/app/` to `src/`).
