# Shiki Syntax Highlighting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side syntax-highlight the blob view's text branch with Shiki (dual github light/dark themes, CSS-counter line numbers), no client JS.

**Architecture:** A `src/highlight.ts` module wraps Shiki's lazy singleton `codeToHtml` (grammars load on demand). The `/:repo/tree/*` handler becomes async and, for `kind === "text"`, awaits `highlightBlob` and passes the resulting `<pre class="shiki">` HTML to `BlobPage`, which injects it raw. CSS retires the manual gutter in favor of a counter over Shiki's per-line spans; dark mode flips to Shiki's `--shiki-dark` variables.

**Tech Stack:** Bun, Hono JSX, Shiki, `bun test`. Repo is jj-colocated — commit with `jj commit -m "…"` (no `git add`/`git commit`). The controller advances `main` after each task.

---

## Background the executor needs

- **VCS:** jujutsu (jj). Commit with `jj commit -m "…"`; jj auto-snapshots. No `git add`/`git commit`. End every message with a blank line then
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Shiki:** `import { codeToHtml } from "shiki"` is a singleton that lazily loads grammars/themes on demand and caches them. Dual themes: `codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" } })`. It emits `<pre class="shiki …" style="…"><code><span class="line">…</span>…</code></pre>` and throws if `lang` is an unknown grammar. The first call loads the WASM engine (one-time, ~1s); Bun's default test timeout is generous. If WASM ever fails under Bun, switch to Shiki's JS engine via a custom singleton — an internal detail.
- **Current blob flow:** `/:repo/tree/*` (sync handler) → if not a tree, `repo.readFileAtRef` → `classifyBlob(bytes, mimeForPath(path, c.env.mimeTypes))` → `{ kind, text }` → `BlobPage`. `BlobPage` currently takes `kind` + `text?` and the text branch renders a manual `<pre class="linenos">`/`<pre class="code">` gutter. This plan replaces the text branch with Shiki.
- **Hono JSX** supports `dangerouslySetInnerHTML={{ __html }}` for raw injection.

## File Structure

- Create `src/highlight.ts` — `langForPath`, `langForBlob`, `highlightBlob`.
- Modify `src/views/default/BlobPage.tsx` — text branch injects `highlighted` HTML.
- Modify `src/server.tsx` — async handler; await `highlightBlob` for text.
- Modify `src/public/cgit.css` — Shiki `.blob` rules + dark dual-theme.
- Modify `package.json` / `bun.lock` — add `shiki`.
- Create `tests/highlight.test.ts`; modify `tests/views/tree-blob-view.test.tsx`, `tests/e2e.test.ts`.

---

## Task 1: Shiki dependency + highlight module

**Files:**
- Modify: `package.json`, `bun.lock` (via `bun add`)
- Create: `src/highlight.ts`
- Test: `tests/highlight.test.ts`

- [ ] **Step 1: Install Shiki**

Run: `bun add shiki`
Expected: `shiki` appears under `dependencies` in `package.json`; `bun.lock` updated. (Network access to registry.npmjs.org is permitted.)

- [ ] **Step 2: Write the failing tests**

Create `tests/highlight.test.ts`:

```ts
import { test, expect } from "bun:test";
import { langForPath, langForBlob, highlightBlob } from "../src/highlight";

test("langForPath maps known extensions", () => {
  expect(langForPath("src/a.ts")).toBe("ts");
  expect(langForPath("main.c")).toBe("c");
  expect(langForPath("app.py")).toBe("python");
});

test("langForPath maps filename specials", () => {
  expect(langForPath("path/to/Makefile")).toBe("make");
});

test("langForPath returns text for unknown or extensionless paths", () => {
  expect(langForPath("notes.xyz")).toBe("text");
  expect(langForPath("README")).toBe("text");
});

test("langForBlob falls back to text above the size cap", () => {
  expect(langForBlob("a.ts", 10)).toBe("ts");
  expect(langForBlob("a.ts", 600 * 1024)).toBe("text");
});

test("highlightBlob returns Shiki markup with per-line token spans", async () => {
  const html = await highlightBlob("const x = 1;\n", "a.ts", 12);
  expect(html).toContain('class="shiki');
  expect(html).toContain('class="line"');
  expect(html).toContain("<span"); // tokenized
});

test("highlightBlob returns Shiki markup for an unknown language", async () => {
  const html = await highlightBlob("hello world\n", "a.unknownext", 12);
  expect(html).toContain('class="shiki');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/highlight.test.ts`
Expected: FAIL — cannot find module `src/highlight`.

- [ ] **Step 4: Implement the module**

Create `src/highlight.ts`:

```ts
import { codeToHtml } from "shiki";

// Skip real grammars above this size to bound highlighting CPU on huge files.
const HIGHLIGHT_SIZE_CAP = 512 * 1024;

const EXT_LANG: Record<string, string> = {
  ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  json: "json", c: "c", h: "c", cpp: "cpp", cc: "cpp", cxx: "cpp",
  hpp: "cpp", hh: "cpp", py: "python", rs: "rust", go: "go", rb: "ruby",
  java: "java", kt: "kotlin", sh: "bash", bash: "bash", zsh: "bash",
  yaml: "yaml", yml: "yaml", toml: "toml", md: "markdown", markdown: "markdown",
  html: "html", htm: "html", xml: "xml", css: "css", scss: "scss",
  sql: "sql", php: "php", swift: "swift", lua: "lua", pl: "perl",
  diff: "diff", patch: "diff",
};

const FILENAME_LANG: Record<string, string> = {
  Makefile: "make",
  Dockerfile: "docker",
};

// Map a file path to a Shiki language id; unknown -> "text".
export function langForPath(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (FILENAME_LANG[base]) return FILENAME_LANG[base];
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "text";
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_LANG[ext] ?? "text";
}

// The language Shiki should actually use: the path's language, or "text" when
// the blob is over the size cap.
export function langForBlob(path: string, size: number): string {
  return size > HIGHLIGHT_SIZE_CAP ? "text" : langForPath(path);
}

// Render `code` to dual-theme Shiki HTML (<pre class="shiki"> with per-line
// <span class="line">). Unknown grammars / failures fall back to plaintext, so
// the output markup (and line numbering) is uniform across all text files.
export async function highlightBlob(code: string, path: string, size: number): Promise<string> {
  const themes = { light: "github-light", dark: "github-dark" } as const;
  const lang = langForBlob(path, size);
  try {
    return await codeToHtml(code, { lang, themes });
  } catch {
    return await codeToHtml(code, { lang: "text", themes });
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/highlight.test.ts`
Expected: PASS (6 tests). The first highlight call loads the WASM engine; allow a moment.

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS (nothing else wired yet).

- [ ] **Step 7: Commit**

```bash
jj commit -m "feat(ts): add Shiki highlight module (lang map + highlightBlob)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Render the text branch with Shiki

This changes `BlobPage`'s text-branch prop (`text?` → `highlighted?`), makes the tree handler async to await highlighting, and swaps the CSS — together, so the build stays green.

**Files:**
- Modify: `src/views/default/BlobPage.tsx`
- Modify: `src/server.tsx`
- Modify: `src/public/cgit.css`
- Test: `tests/views/tree-blob-view.test.tsx`, `tests/e2e.test.ts`

- [ ] **Step 1: Update the view tests (text branch → highlighted HTML)**

In `tests/views/tree-blob-view.test.tsx`:

Replace the test titled "BlobPage hoists its title, renders text lines and a raw link" with:

```tsx
test("BlobPage hoists its title and injects highlighted HTML with a raw link", async () => {
  const html = await render(
    <BlobPage
      name="proj"
      ref="main"
      path="a.txt"
      kind="text"
      highlighted={'<pre class="shiki"><code><span class="line">foo</span></code></pre>'}
      size={7}
    />,
  );
  expect(headOf(html)).toContain("<title>proj: a.txt</title>");
  expect(html).toContain('href="/proj/raw/main/a.txt"');
  expect(html).toContain('class="shiki"');
  expect(html).toContain("foo");
  expect(html).toContain("7 bytes");
});
```

Replace the test titled "BlobPage numbers lines in a gutter without a phantom trailing line" with one that proves the HTML is injected raw (not escaped):

```tsx
test("BlobPage injects the highlighted HTML raw, not escaped", async () => {
  const html = await render(
    <BlobPage
      name="proj"
      ref="main"
      path="a.txt"
      kind="text"
      highlighted={'<pre class="shiki"><span class="line">x</span></pre>'}
      size={1}
    />,
  );
  expect(html).toContain('<pre class="shiki">');
  expect(html).not.toContain("&lt;pre");
});
```

Leave the binary and image tests unchanged (they pass no `text`/`highlighted`).

- [ ] **Step 2: Update the e2e README assertion (Shiki tokenizes "# Fixture")**

In `tests/e2e.test.ts`, replace:

```ts
test("GET /project/tree/main/README.md shows the file with a raw link", async () => {
  const html = await (await req("/project/tree/main/README.md")).text();
  expect(html).toContain("# Fixture");
  expect(html).toContain('href="/project/raw/main/README.md"');
});
```

with:

```ts
test("GET /project/tree/main/README.md highlights the file with a raw link", async () => {
  const html = await (await req("/project/tree/main/README.md")).text();
  expect(html).toContain('class="shiki'); // syntax-highlighted
  expect(html).toContain("Fixture");        // content present (may be tokenized)
  expect(html).toContain('href="/project/raw/main/README.md"');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test tests/views/tree-blob-view.test.tsx tests/e2e.test.ts`
Expected: FAIL — `BlobProps` has no `highlighted`; README output has no `class="shiki"` yet.

- [ ] **Step 4: Update BlobPage**

Replace the entire contents of `src/views/default/BlobPage.tsx` with:

```tsx
import { Breadcrumb } from "./Breadcrumb";
import { encodeSegments } from "./paths";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  kind: "text" | "binary" | "image";
  highlighted?: string; // Shiki HTML, present when kind === "text"
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${encodeURIComponent(props.name)}/raw/${encodeSegments(props.ref)}/${encodeSegments(props.path)}`;
  return (
    <>
      <title>{`${props.name}: ${props.path}`}</title>
      <Breadcrumb name={props.name} ref={props.ref} path={props.path} />
      <p>
        <a href={rawHref}>raw</a> &middot; {props.size} bytes
      </p>
      {props.kind === "image" ? (
        <img class="blob-image" src={rawHref} alt={props.path} />
      ) : props.kind === "binary" ? (
        <p class="binary">Binary file not shown.</p>
      ) : (
        <div class="blob" dangerouslySetInnerHTML={{ __html: props.highlighted ?? "" }} />
      )}
    </>
  );
}
```

- [ ] **Step 5: Make the tree handler async and await highlighting**

In `src/server.tsx`, add the import alongside the others:

```ts
import { highlightBlob } from "./highlight";
```

Change the `/:repo/tree/*` handler signature to `async`, and replace the blob branch. The handler currently begins:

```ts
  app.get("/:repo/tree/*", (c) => {
```

Change that line to:

```ts
  app.get("/:repo/tree/*", async (c) => {
```

Then replace this block:

```ts
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes !== null) {
      const { kind, text } = classifyBlob(bytes, mimeForPath(path, c.env.mimeTypes));
      return c.render(
        <BlobPage name={disc.name} ref={ref} path={path} kind={kind} text={text} size={bytes.length} />,
      );
    }
    throw notFound(`Path not found: ${path}`);
```

with:

```ts
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes !== null) {
      const { kind, text } = classifyBlob(bytes, mimeForPath(path, c.env.mimeTypes));
      const highlighted =
        kind === "text" ? await highlightBlob(text ?? "", path, bytes.length) : undefined;
      return c.render(
        <BlobPage name={disc.name} ref={ref} path={path} kind={kind} highlighted={highlighted} size={bytes.length} />,
      );
    }
    throw notFound(`Path not found: ${path}`);
```

- [ ] **Step 6: Swap the CSS to Shiki rules**

In `src/public/cgit.css`, replace the entire blob block — from the comment `/* Blob (file) view: one code block with a line-number gutter. …` through the `.blob .code { … }` rule (i.e. the `.blob`, `.blob pre`, `.blob .linenos`, `.blob .code` rules) — with:

```css
/* Blob (file) view: Shiki-highlighted source with a line-number gutter.
   Terminal.css styles every <pre> as a bordered, padded, wrapping card; the
   .blob overrides below strip that and add CSS-counter line numbers over
   Shiki's per-line spans. Shiki's dual github light/dark themes are selected
   via prefers-color-scheme (the dark block flips token colors to --shiki-dark). */
.blob {
  border: 1px solid var(--secondary-color);
  border-radius: 3px;
  overflow-x: auto;
}
.blob .shiki {
  margin: 0;
  padding: 0.5em 0;
  border: 0;
  border-radius: 0;
  white-space: pre;
  line-height: 1.5;
}
.blob .shiki code {
  counter-reset: line;
}
.blob .shiki .line {
  counter-increment: line;
}
.blob .shiki .line::before {
  content: counter(line);
  display: inline-block;
  width: 3ch;
  margin-right: 1.5em;
  padding: 0 0.5em;
  text-align: right;
  color: var(--secondary-color);
  user-select: none;
}
@media (prefers-color-scheme: dark) {
  .blob .shiki,
  .blob .shiki span {
    color: var(--shiki-dark) !important;
    background-color: var(--shiki-dark-bg) !important;
  }
}
```

Leave the `.blob-image` rule that follows it unchanged.

- [ ] **Step 7: Run the targeted tests**

Run: `bun test tests/views/tree-blob-view.test.tsx tests/e2e.test.ts`
Expected: PASS — the view tests inject highlighted HTML; the README e2e shows `class="shiki"`. The binary (`logo.bin`) and image (`icon.gif`) cases are unaffected (no highlighting path).

- [ ] **Step 8: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 9: Manually verify against a real repo**

Run (server + curl in ONE command — each sandboxed command has its own network namespace):

```bash
CGIT_SCAN_PATH=/home/andrea/code PORT=3000 bun run src/server.tsx >"$TMPDIR/srv.log" 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT
curl -sS --retry 30 --retry-connrefused --retry-delay 1 -m 40 -o /dev/null http://localhost:3000/healthz
curl -sS -m 15 "http://localhost:3000/meson/tree/HEAD/meson.build" | grep -o 'class="shiki[^"]*"' | head -1
```

Expected: a `class="shiki…"` match — confirming a real source file is highlighted. (Informational; the e2e test is authoritative.)

- [ ] **Step 10: Commit**

```bash
jj commit -m "feat(ts): syntax-highlight the blob text view with Shiki

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Shiki lazy singleton + `langForPath`/`langForBlob`/`highlightBlob` with size cap and plaintext fallback (Task 1); async route awaiting `highlightBlob` for the text branch only (Task 2, Step 5); `BlobPage` injects `highlighted` raw, retiring the gutter (Task 2, Step 4); CSS counter line numbers + dual-theme dark block (Task 2, Step 6); dependency added (Task 1, Step 1); tests for the module, the view (raw injection), and e2e (`class="shiki"`) all present. The spec's "update the gutter view test" note is handled (Task 2, Step 1). No gaps.
- **Placeholder scan:** none — every step has complete code/commands.
- **Type consistency:** `highlightBlob(code, path, size): Promise<string>` defined in Task 1 and called identically in Task 2, Step 5. `BlobProps` drops `text?`, adds `highlighted?: string` (Task 2, Step 4), matching the route's `highlighted={highlighted}` and the view tests. `langForBlob(path, size)` signature consistent between Task 1's implementation and tests. `kind: "text"|"binary"|"image"` unchanged.
- **Note:** image/binary branches and their tests are untouched; only the text branch changes.
</content>
