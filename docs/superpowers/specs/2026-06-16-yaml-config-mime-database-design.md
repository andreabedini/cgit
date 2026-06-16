# YAML Config + MIME Database — Design

**Date:** 2026-06-16
**Status:** Approved, pending implementation plan

## Goal

Introduce a YAML configuration file for the cgit TypeScript rewrite, starting
with a MIME-type database (extension → MIME type). Use the MIME database to
drive a three-way blob view (image / text / binary) and to set the `/raw/`
route's `Content-Type`. When the config file is missing, fall back to built-in
defaults.

This is the foundational step toward a YAML-centric configuration that will
eventually absorb the current env-var settings (`loadConfig`). This round adds
the loader and the `mimetype:` section only; the existing `CGIT_*` env vars are
left in place.

## Scope

In scope:

- A synchronous YAML config loader (`Bun.YAML.parse` + `readFileSync`).
- Config discovery via `CGIT_CONFIG`, defaulting to `./cgit.yaml`.
- A built-in default MIME map, overridden/extended by the YAML `mimetype:`
  section.
- A pure `mimeForPath` helper.
- A three-way blob view: inline image, binary-download notice, text.
- `/raw/` `Content-Type` from the MIME database.
- Loading config once at startup instead of per request.
- An example config file and a fixture image for tests.

Out of scope (explicitly deferred):

- Migrating the other `CGIT_*` settings into the YAML file (separate, later).
- Syntax highlighting (the next spec; it replaces the text branch's renderer).
- Caching highlighted/served blobs by oid.
- Hoisting `createApp()` out of the per-request path (unrelated to config).

## Config loading

Extend `src/config/config.ts`.

- `loadConfig(env = process.env)` stays **synchronous** and keeps reading the
  `CGIT_*` env vars as today. It additionally loads the MIME map and adds it to
  the returned config.
- **Discovery:** the YAML path is `env.CGIT_CONFIG` if set, else `./cgit.yaml`.
- **Read + parse:** `readFileSync(path, "utf8")` then `Bun.YAML.parse(text)`.
- **Missing file:** if the file does not exist (`ENOENT`), use the built-in
  defaults only — no error.
- **Malformed YAML / unreadable (non-ENOENT):** throw. Because config is loaded
  once at startup (below), this fails fast with a clear message rather than
  per-request.
- The parsed document's `mimetype` key (an object of `ext: type`) is merged
  **over** `DEFAULT_MIME_TYPES` (override + extend). Keys are lowercased.

### Bootstrap change

`src/server.tsx` currently calls `loadConfig()` inside the per-request `fetch`
closure. Since `loadConfig` now performs file I/O, hoist it to load once at
startup:

```ts
const config = loadConfig();
export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: (req: Request) => createApp().fetch(req, config),
};
```

`createApp()` remains per-request (out of scope). Tests are unaffected — they
inject their own config via `app.request(path, undefined, cfg)`.

## MIME database

- `DEFAULT_MIME_TYPES: Record<string, string>` in `src/config/config.ts`:

```ts
export const DEFAULT_MIME_TYPES: Record<string, string> = {
  gif: "image/gif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  avif: "image/avif",
  pdf: "application/pdf",
};
```

- Added to the config (`Env["Bindings"]`) as `mimeTypes: Record<string, string>`.
- New pure helper `src/mime.ts`:

```ts
// Look up the MIME type for a path by its lowercased extension.
// Returns undefined when there is no extension or no match.
export function mimeForPath(
  path: string,
  mimeTypes: Record<string, string>,
): string | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined; // no extension, or dotfile like ".gitignore"
  const ext = base.slice(dot + 1).toLowerCase();
  return mimeTypes[ext];
}
```

## Blob view (three-way)

The `/:repo/tree/*` file branch classifies the blob and renders accordingly,
using `isBinary` as the fallback for unknown extensions:

1. MIME starts with `image/` → **image**: render an inline `<img>` whose `src`
   is the `/raw/` URL.
2. MIME is defined and **not** `text/*` (e.g. `application/pdf`) → **binary**:
   the "binary file" download notice + raw link.
3. otherwise (`text/*` or no MIME match):
   - if there was no MIME match, call `isBinary(bytes)`; if binary → **binary**
     notice.
   - else → **text**: the current line-numbered code-block rendering (Shiki
     replaces this in the next spec).

`BlobPage` props change to carry the decision. The route computes the category
and passes it in; the view does not re-derive MIME. Concretely, replace the
single `binary` boolean with a `kind: "text" | "binary" | "image"` plus the
`text` (for text) and the raw href (already derivable from name/ref/path). The
image branch renders `<img class="blob-image" src={rawHref} alt={path} />`;
`.blob-image { max-width: 100%; }` in `cgit.css`.

## /raw/ route

`Content-Type` = `mimeForPath(path, c.env.mimeTypes)` when defined; otherwise
the existing fallback `isBinary(bytes) ? "application/octet-stream"
: "text/plain; charset=utf-8"`.

## Supporting files

- `cgit.example.yaml` at the repo root, documenting the section:

```yaml
# cgit-ts configuration. Point the server at this file with CGIT_CONFIG,
# or place it at ./cgit.yaml. All sections are optional.
mimetype:
  gif: image/gif
  pdf: application/pdf
```

- The test fixture (`tests/fixtures/repo.ts`) gains a tiny `icon.gif`
  (arbitrary bytes) added to the **existing** "Add b.txt" commit, so commit
  counts and subjects are unchanged.

## Data flow

```
startup: loadConfig() reads CGIT_* env + CGIT_CONFIG (or ./cgit.yaml)
         -> SiteConfig { ...CGIT_*, mimeTypes: defaults <- yaml.mimetype }
request /tree file:
  mime = mimeForPath(path, c.env.mimeTypes)
  kind = image/* ? "image"
       : (mime && !text/*) ? "binary"
       : mimeMatch(text/*) ? "text"
       : isBinary(bytes) ? "binary" : "text"
  render BlobPage(kind, ...)
request /raw:
  Content-Type = mime ?? (isBinary ? octet-stream : text/plain)
```

## Error handling

- Missing config file → defaults (no error).
- Malformed/unreadable config → throw at startup (fail fast).
- Unknown extension → `isBinary` decides text vs binary; raw falls back to the
  octet-stream/text rule.

## Testing

- `tests/mime.test.ts` — `mimeForPath`: known ext (`logo.gif` → `image/gif`),
  unknown ext → undefined, uppercase ext (`A.GIF`) → matched, no extension and
  dotfile → undefined.
- `tests/config.test.ts` (new) — `loadConfig` merges a YAML `mimetype:` over the
  defaults; missing file → defaults; `CGIT_CONFIG` override path is honored
  (writes a temp YAML file and points `CGIT_CONFIG` at it). Malformed YAML
  throws.
- View test (`tests/views/tree-blob-view.test.tsx`) — `BlobPage` renders `<img
  src=".../raw/...">` for `kind="image"`; the notice for `kind="binary"`; the
  text branch (existing assertions) for `kind="text"`.
- e2e (`tests/e2e.test.ts`) — `/project/tree/main/icon.gif` contains `<img` with
  `src="/project/raw/main/icon.gif"`; `/project/raw/main/icon.gif` →
  `Content-Type: image/gif`. The e2e config object gains
  `mimeTypes: DEFAULT_MIME_TYPES`.

## Notes for later (not this round)

- The YAML file is structured to absorb the remaining `CGIT_*` settings in a
  later migration; this round only adds `mimetype:`.
- Per-request `createApp()` rebuild is untouched.
</content>
