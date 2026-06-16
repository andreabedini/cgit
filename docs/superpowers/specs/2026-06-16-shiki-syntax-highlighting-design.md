# Server-Side Syntax Highlighting with Shiki — Design

**Date:** 2026-06-16
**Status:** Approved, pending implementation plan

## Goal

Render source files in the blob view with syntax highlighting, server-side, with
no client JavaScript. Highlighting applies only to the **text** branch of the
existing three-way blob view (image / text / binary); image and binary blobs are
untouched.

## Scope

In scope:

- A highlighting module using Shiki's lazy, on-demand grammar loading.
- Dual light/dark themes (`github-light` / `github-dark`) via CSS variables and a
  `prefers-color-scheme` media query — no client JS.
- Line numbers from a CSS counter over Shiki's per-line `<span class="line">`
  (retiring the current manual gutter).
- Plaintext fallback for unknown languages, highlight failures, and very large
  files.

Out of scope:

- Highlighting image/binary blobs (they never reach the text branch).
- Caching highlighted HTML by blob oid (a clean future optimization; blobs are
  immutable by oid).
- Per-line anchors / line linking.
- Themes beyond the one light/dark pair.

## Dependency

Add `shiki` (`bun add shiki`).

Use the bundled singleton shorthand: `import { codeToHtml } from "shiki"`. It
lazily loads each grammar and theme on first use and caches them, so startup
stays light and memory grows only with the languages actually viewed (the
"lazy on-demand" strategy chosen during brainstorming). The default engine is
Oniguruma (WASM), which runs under Bun; if WASM causes trouble during
implementation, switch to Shiki's pure-JS engine via a custom singleton — an
internal detail, not a design change.

## Module — `src/highlight.ts`

```ts
langForPath(path: string): string
```
Pure map from extension/filename to a Shiki language id (e.g. `ts`, `tsx`, `js`,
`json`, `c`, `h`, `cpp`, `py`, `rs`, `go`, `rb`, `java`, `sh`/`bash`, `yaml`,
`toml`, `md`, `html`, `css`, `sql`, plus filename specials like `Makefile`,
`Dockerfile`). Unknown → `"text"`.

```ts
highlightBlob(code: string, path: string, size: number): Promise<string>
```
- `lang = size > 512*1024 ? "text" : langForPath(path)` (cap bounds CPU on huge
  files).
- Returns `await codeToHtml(code, { lang, themes: { light: "github-light", dark:
  "github-dark" } })` — the `<pre class="shiki">…</pre>` HTML, lines wrapped in
  `<span class="line">`.
- On any error (a grammar Shiki doesn't have, etc.) retry once with `lang:
  "text"`, so it never throws into the route.

Highlighting always goes through Shiki — even the fallback uses `lang: "text"` —
so the rendered markup (and thus line numbering) is uniform across all text
files.

## Route — `/:repo/tree/*` (blob branch)

The handler becomes `async`. After `classifyBlob` yields `{ kind, text }`:

- `kind === "text"` → `const highlighted = await highlightBlob(text, path,
  bytes.length)`; render `<BlobPage … kind="text" highlighted={highlighted} … />`.
- `kind === "image"` / `"binary"` → unchanged (no `await`, no `highlighted`).

The `/raw/` route is unaffected.

## `BlobPage`

The text branch swaps the `text?` prop for `highlighted?: string` (the Shiki
HTML) and renders it raw:

```tsx
{props.kind === "image" ? (
  <img class="blob-image" src={rawHref} alt={props.path} />
) : props.kind === "binary" ? (
  <p class="binary">Binary file not shown.</p>
) : (
  <div class="blob" dangerouslySetInnerHTML={{ __html: props.highlighted ?? "" }} />
)}
```

The manual `<pre class="linenos">` / `<pre class="code">` gutter is removed.
`name`/`ref`/`path`/`size`/`kind` and the title, breadcrumb, and `raw · N bytes`
line are unchanged. The raw HTML comes from Shiki (a trusted, escaped renderer of
the file's text); it is not attacker-controlled markup.

## CSS — `cgit.css`

Replace the flex-gutter `.blob` rules (`.blob`, `.blob .linenos`, `.blob .code`)
with Shiki-oriented rules; keep `.blob-image` and `.binary`:

- `.blob` container: border, rounded, `overflow-x: auto`.
- `.blob .shiki`: reset margin, set padding/line-height; `white-space: pre` (no
  wrap — long lines scroll).
- Line numbers via counter:
  `.blob .shiki code { counter-reset: line }`,
  `.blob .shiki .line { counter-increment: line }`,
  `.blob .shiki .line::before { content: counter(line); … right-aligned,
  --secondary-color, user-select: none; }`.
- Dark mode (the documented Shiki dual-theme recipe):
  ```css
  @media (prefers-color-scheme: dark) {
    .blob .shiki,
    .blob .shiki span {
      color: var(--shiki-dark) !important;
      background-color: var(--shiki-dark-bg) !important;
    }
  }
  ```
  (Light theme uses the inline colors Shiki emits by default; the media query
  flips to the `--shiki-dark*` variables. The line-number `::before` keeps
  `--secondary-color` in both modes.)

## Error handling / fallbacks

- Unknown language or highlight failure → plaintext (`lang: "text"`), still
  line-numbered, no colors.
- Files > 512 KB → plaintext.
- Image/binary blobs are never highlighted (they don't enter the text branch).

## Testing

- `tests/highlight.test.ts`
  - `langForPath`: a few known extensions (`ts`, `c`, `py`), filename special
    (`Makefile`), and unknown → `"text"`.
  - `highlightBlob`: a small TypeScript snippet returns HTML containing
    `class="shiki"` and at least one token `<span`; an oversized input
    (> 512 KB) returns markup without language tokens (rendered as `text`);
    content with an unknown extension still returns `class="shiki"` markup.
- View test (`tests/views/tree-blob-view.test.tsx`)
  - `BlobPage` with `kind="text"` and a `highlighted` HTML string injects it raw
    (the markup appears in the output); title and `raw` link still present. The
    existing image/binary tests are unaffected (those props don't change).
- e2e (`tests/e2e.test.ts`)
  - `/project/tree/main/README.md` (markdown, a known grammar) returns HTML
    containing `class="shiki"`; the breadcrumb and `raw` link still present.
  - The existing `logo.bin` (binary) and `icon.gif` (image) cases are unchanged.

## Notes for later (not this round)

- Highlighted HTML is cacheable by blob oid (immutable) — a future optimization.
- The text-branch view test currently asserts a `<pre class="linenos">` gutter;
  the plan must update it to assert the injected Shiki markup instead.
</content>
