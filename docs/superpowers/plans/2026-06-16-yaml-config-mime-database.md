# YAML Config + MIME Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a YAML configuration file (starting with a MIME-type database) that drives a three-way blob view (image / text / binary) and the `/raw/` route's `Content-Type`, with built-in defaults when the file is absent.

**Architecture:** `loadConfig` (sync) keeps reading `CGIT_*` env vars and additionally loads a `mimetype:` map from a YAML file (`CGIT_CONFIG`, default `./cgit.yaml`) via Bun's native `YAML.parse`, merged over built-in defaults. The map rides on `c.env` like the rest of the config. A pure `mimeForPath` resolves a path's MIME type; a pure `classifyBlob` turns bytes + MIME into a `{kind, text?}` decision the blob route renders.

**Tech Stack:** Bun (native `YAML.parse`), Hono JSX, `bun test`. Repo is jj-colocated — commit with `jj commit -m "…"` (no `git add`/`git commit`).

---

## Background the executor needs

- **VCS:** jujutsu (jj), colocated with git. Commit with `jj commit -m "…"`; jj auto-snapshots the working copy. Do NOT run `git commit`/`git add`. After each task's commit, the controller advances `main` — you do not need to.
- **Commit trailer:** end every commit message with a blank line then
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Config on `c.env`:** Hono carries the site config as Bindings. `SiteConfig = Env["Bindings"]`. Tests inject config as the third arg to `app.request(path, undefined, cfg)`.
- **Bun YAML:** `import { YAML } from "bun"; YAML.parse(text)` parses a YAML string synchronously (Bun's native parser). Throws on malformed input.
- **Existing blob flow:** `/:repo/tree/*` resolves a path; if `repo.tree()` returns null it's a blob → `repo.readFileAtRef()` → render `BlobPage`. `BlobPage` currently takes `binary: boolean` + `text?`. `src/blob.ts` already exports `isBinary(bytes)`.

## File Structure

- Modify `src/app/env.ts` — add `mimeTypes` to Bindings.
- Modify `src/config/config.ts` — `DEFAULT_MIME_TYPES`, YAML loading in `loadConfig`.
- Create `src/mime.ts` — pure `mimeForPath`.
- Modify `src/blob.ts` — add pure `classifyBlob` (alongside `isBinary`).
- Modify `src/views/default/BlobPage.tsx` — `kind` union; image branch.
- Modify `src/public/cgit.css` — `.blob-image`.
- Modify `src/server.tsx` — blob branch uses `classifyBlob`/`mimeForPath`; raw route `Content-Type` from MIME; hoist `loadConfig` to startup.
- Create `cgit.example.yaml` — documents the section.
- Modify `tests/fixtures/repo.ts` — add `icon.gif`.
- Create `tests/mime.test.ts`, `tests/config.test.ts`.
- Modify `tests/blob.test.ts`, `tests/views/tree-blob-view.test.tsx`, `tests/e2e.test.ts`.

---

## Task 1: Config loading with a YAML MIME map

**Files:**
- Modify: `src/app/env.ts`
- Modify: `src/config/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Add `mimeTypes` to the Bindings type**

In `src/app/env.ts`, add the field to `Bindings` (after `CGIT_REPOLIST_PAGE_SIZE`):

```ts
    CGIT_REPOLIST_PAGE_SIZE: number;
    mimeTypes: Record<string, string>;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/config.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config/config";

test("loadConfig uses default MIME types when the config file is missing", () => {
  const cfg = loadConfig({ CGIT_CONFIG: "/nonexistent/cgit.yaml" });
  expect(cfg.mimeTypes.gif).toBe("image/gif");
  expect(cfg.mimeTypes.pdf).toBe("application/pdf");
});

test("loadConfig merges the YAML mimetype section over the defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "cgit-cfg-"));
  try {
    const file = join(dir, "cgit.yaml");
    writeFileSync(file, "mimetype:\n  gif: image/x-custom\n  rs: text/rust\n");
    const cfg = loadConfig({ CGIT_CONFIG: file });
    expect(cfg.mimeTypes.gif).toBe("image/x-custom"); // overridden
    expect(cfg.mimeTypes.rs).toBe("text/rust");        // extended
    expect(cfg.mimeTypes.pdf).toBe("application/pdf");  // default kept
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadConfig throws on a malformed YAML config", () => {
  const dir = mkdtempSync(join(tmpdir(), "cgit-cfg-"));
  try {
    const file = join(dir, "cgit.yaml");
    writeFileSync(file, 'mimetype:\n  gif: "unterminated\n');
    expect(() => loadConfig({ CGIT_CONFIG: file })).toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test tests/config.test.ts`
Expected: FAIL — `cfg.mimeTypes` is undefined (not loaded yet).

- [ ] **Step 4: Implement the MIME defaults + YAML loading**

Replace the entire contents of `src/config/config.ts` with:

```ts
import { readFileSync } from "node:fs";
import { YAML } from "bun";
import type { Env } from "../app/env";

// Config is carried on the request as Bindings (c.env). This is the CGIT_*
// shape, so loadConfig() reads straight from a process.env-like record.
export type SiteConfig = Env["Bindings"];

// Sensible built-in MIME types, overridden/extended by the YAML `mimetype:`
// section. Keep this modest; unknown extensions fall back to the isBinary
// heuristic at render time.
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

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Built-in defaults, merged with the file's `mimetype:` section (file wins).
// Missing file -> defaults only. A present-but-unreadable/malformed file throws
// (config is loaded once at startup, so this fails fast).
function loadMimeTypes(env: Record<string, string | undefined>): Record<string, string> {
  const path = env.CGIT_CONFIG ?? "./cgit.yaml";
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT") return { ...DEFAULT_MIME_TYPES };
    throw e;
  }
  const doc = YAML.parse(text) as { mimetype?: Record<string, string> } | null;
  const merged: Record<string, string> = { ...DEFAULT_MIME_TYPES };
  for (const [ext, type] of Object.entries(doc?.mimetype ?? {})) {
    merged[ext.toLowerCase()] = type;
  }
  return merged;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): SiteConfig {
  return {
    CGIT_SCAN_PATH: env.CGIT_SCAN_PATH ?? "/srv/git",
    CGIT_CLONE_URL_BASE: env.CGIT_CLONE_URL_BASE,
    CGIT_SUMMARY_BRANCHES: num(env.CGIT_SUMMARY_BRANCHES, 10),
    CGIT_SUMMARY_TAGS: num(env.CGIT_SUMMARY_TAGS, 10),
    CGIT_SUMMARY_LOG: num(env.CGIT_SUMMARY_LOG, 10),
    CGIT_LOG_PAGE_SIZE: num(env.CGIT_LOG_PAGE_SIZE, 50),
    CGIT_REPOLIST_PAGE_SIZE: num(env.CGIT_REPOLIST_PAGE_SIZE, 50),
    mimeTypes: loadMimeTypes(env),
  };
}
```

- [ ] **Step 5: Run the config tests**

Run: `bun test tests/config.test.ts`
Expected: PASS (3 tests).

If the malformed-YAML test does NOT throw (Bun's parser tolerated the input), make the test input more clearly invalid — e.g. `"mimetype:\n\t- bad-tab-indent\n"` — until `YAML.parse` rejects it. Do not weaken the implementation.

- [ ] **Step 6: Run the full suite (catch config-shape regressions)**

Run: `bun test`
Expected: PASS. (The existing `loadConfig` test in `tests/scan.test.ts` passes no `CGIT_CONFIG`; `./cgit.yaml` does not exist in the repo, so it gets defaults and still satisfies its `CGIT_SCAN_PATH`/page-size assertions.)

- [ ] **Step 7: Commit**

```bash
jj commit -m "feat(ts): load a YAML mimetype map in loadConfig with defaults

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `mimeForPath` helper

**Files:**
- Create: `src/mime.ts`
- Test: `tests/mime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/mime.test.ts`:

```ts
import { test, expect } from "bun:test";
import { mimeForPath } from "../src/mime";

const m = { gif: "image/gif", pdf: "application/pdf" };

test("matches a known extension", () => {
  expect(mimeForPath("a/b/logo.gif", m)).toBe("image/gif");
});

test("is case-insensitive on the extension", () => {
  expect(mimeForPath("LOGO.GIF", m)).toBe("image/gif");
});

test("returns undefined for an unknown extension", () => {
  expect(mimeForPath("notes.txt", m)).toBeUndefined();
});

test("returns undefined when there is no extension", () => {
  expect(mimeForPath("path/to/Makefile", m)).toBeUndefined();
});

test("returns undefined for a dotfile with no extension", () => {
  expect(mimeForPath(".gitignore", m)).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/mime.test.ts`
Expected: FAIL — cannot find module `src/mime`.

- [ ] **Step 3: Implement**

Create `src/mime.ts`:

```ts
// Look up the MIME type for a path by its lowercased extension.
// Returns undefined when there is no extension (e.g. "Makefile") or a leading
// dot only (e.g. ".gitignore"), or when the extension is not in the map.
export function mimeForPath(
  path: string,
  mimeTypes: Record<string, string>,
): string | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  return mimeTypes[ext];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/mime.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat(ts): add mimeForPath extension lookup

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `classifyBlob` helper

**Files:**
- Modify: `src/blob.ts`
- Test: `tests/blob.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/blob.test.ts` — first extend the import on line 2:

```ts
import { isBinary, classifyBlob } from "../src/blob";
```

Then add at the end of the file:

```ts
const utf8 = (s: string) => new TextEncoder().encode(s);

test("classifyBlob: image mime -> image, no text decoded", () => {
  const r = classifyBlob(utf8("whatever"), "image/png");
  expect(r.kind).toBe("image");
  expect(r.text).toBeUndefined();
});

test("classifyBlob: non-text mime -> binary", () => {
  expect(classifyBlob(utf8("%PDF"), "application/pdf").kind).toBe("binary");
});

test("classifyBlob: text/* mime -> text with decoded content", () => {
  const r = classifyBlob(utf8("hello"), "text/plain");
  expect(r.kind).toBe("text");
  expect(r.text).toBe("hello");
});

test("classifyBlob: unknown mime + NUL bytes -> binary", () => {
  expect(classifyBlob(new Uint8Array([1, 0, 2]), undefined).kind).toBe("binary");
});

test("classifyBlob: unknown mime + plain text -> text", () => {
  const r = classifyBlob(utf8("plain"), undefined);
  expect(r.kind).toBe("text");
  expect(r.text).toBe("plain");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/blob.test.ts`
Expected: FAIL — `classifyBlob` is not exported.

- [ ] **Step 3: Implement**

Add to `src/blob.ts` (after the existing `isBinary` function):

```ts
export type BlobKind = "text" | "binary" | "image";

// Decide how to render a blob from its bytes and (optional) MIME type:
//  - image/*            -> image
//  - other non-text/*   -> binary (e.g. application/pdf)
//  - text/*             -> text (decoded)
//  - no MIME match      -> isBinary heuristic decides text vs binary
// Text is decoded only when the result is text.
export function classifyBlob(
  bytes: Uint8Array,
  mime: string | undefined,
): { kind: BlobKind; text?: string } {
  if (mime?.startsWith("image/")) return { kind: "image" };
  if (mime && !mime.startsWith("text/")) return { kind: "binary" };
  if (!mime && isBinary(bytes)) return { kind: "binary" };
  return { kind: "text", text: new TextDecoder().decode(bytes) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/blob.test.ts`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
jj commit -m "feat(ts): add classifyBlob (image/text/binary) decision

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: BlobPage `kind` union + image branch

**Files:**
- Modify: `src/views/default/BlobPage.tsx`
- Modify: `src/public/cgit.css`
- Test: `tests/views/tree-blob-view.test.tsx`

- [ ] **Step 1: Update the existing BlobPage tests and add an image test**

In `tests/views/tree-blob-view.test.tsx`:

Replace the `"foo\nbar"` text test's props — change `binary={false}` to `kind="text"`:

```tsx
test("BlobPage hoists its title, renders text lines and a raw link", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="a.txt" kind="text" text={"foo\nbar"} size={7} />,
  );
  expect(headOf(html)).toContain("<title>proj: a.txt</title>");
  expect(html).toContain('href="/proj/raw/main/a.txt"');
  expect(html).toContain("foo");
  expect(html).toContain("bar");
  expect(html).toContain("7 bytes");
});
```

Change the binary test's `binary={true}` to `kind="binary"`:

```tsx
test("BlobPage shows a notice for binary files", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="logo.bin" kind="binary" size={8} />,
  );
  expect(html).toContain("Binary file not shown.");
  expect(html).toContain('href="/proj/raw/main/logo.bin"');
});
```

Change the gutter test's `binary={false}` to `kind="text"`:

```tsx
test("BlobPage numbers lines in a gutter without a phantom trailing line", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="a.txt" kind="text" text={"foo\nbar\n"} size={8} />,
  );
  const gutter = html.match(/<pre class="linenos">([\s\S]*?)<\/pre>/)?.[1] ?? "";
  expect(gutter.split("\n")).toEqual(["1", "2"]);
});
```

Add a new image test at the end of the file:

```tsx
test("BlobPage renders an inline image for image blobs", async () => {
  const html = await render(
    <BlobPage name="proj" ref="main" path="icon.gif" kind="image" size={42} />,
  );
  expect(html).toContain("<img");
  expect(html).toContain('src="/proj/raw/main/icon.gif"');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: FAIL — `BlobProps` has no `kind` (type/prop mismatch; image test renders nothing).

- [ ] **Step 3: Update BlobPage**

Replace the contents of `src/views/default/BlobPage.tsx` with:

```tsx
import { Breadcrumb } from "./Breadcrumb";
import { encodeSegments } from "./paths";

export interface BlobProps {
  name: string;
  ref: string;
  path: string;
  kind: "text" | "binary" | "image";
  text?: string; // present when kind === "text"
  size: number;
}

export function BlobPage(props: BlobProps) {
  const rawHref = `/${encodeURIComponent(props.name)}/raw/${encodeSegments(props.ref)}/${encodeSegments(props.path)}`;
  const lines = (props.text ?? "").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
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
        <div class="blob">
          <pre class="linenos">{lines.map((_, i) => i + 1).join("\n")}</pre>
          <pre class="code">{lines.join("\n")}</pre>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Add the image style**

Append to `src/public/cgit.css`:

```css
/* Inline image preview in the blob view. */
.blob-image {
  max-width: 100%;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/views/tree-blob-view.test.tsx`
Expected: PASS (all, including the new image test).

- [ ] **Step 6: Commit**

```bash
jj commit -m "feat(ts): BlobPage renders image/text/binary by kind

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Fixture image + example config file

**Files:**
- Modify: `tests/fixtures/repo.ts`
- Create: `cgit.example.yaml`

- [ ] **Step 1: Add `imageFile` to the `FixtureRepo` interface**

In `tests/fixtures/repo.ts`, add the field after `binaryFile`:

```ts
  binaryFile: string;       // "logo.bin"
  imageFile: string;        // "icon.gif"
```

- [ ] **Step 2: Write `icon.gif` into the final commit**

In `createFixtureRepo`, add this line right after the `logo.bin` write (before `git add -A`):

```ts
    // A GIF header — content is irrelevant; the .gif extension drives MIME.
    await Bun.write(join(work, "icon.gif"), new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]));
```

- [ ] **Step 3: Return the new metadata field**

Add `imageFile: "icon.gif"` to the returned object (after `binaryFile`):

```ts
      binaryFile: "logo.bin",
      imageFile: "icon.gif",
```

- [ ] **Step 4: Verify the suite still passes (fixture didn't break anything)**

Run: `bun test`
Expected: PASS (commit counts/subjects unchanged; `icon.gif` rides in the existing "Add b.txt" commit).

- [ ] **Step 5: Create the example config file**

Create `cgit.example.yaml`:

```yaml
# cgit-ts configuration. Point the server at this file with the CGIT_CONFIG
# environment variable, or place it at ./cgit.yaml. All sections are optional;
# a missing file falls back to built-in defaults.

# Map file extensions to MIME types. These override and extend the built-in
# defaults. The blob view renders image/* inline, other non-text/* types as a
# download notice, and everything else as text. The /raw/ route serves the
# mapped type as its Content-Type.
mimetype:
  gif: image/gif
  pdf: application/pdf
```

- [ ] **Step 6: Commit**

```bash
jj commit -m "test(ts): add icon.gif fixture and example config file

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire MIME into the routes + startup config

**Files:**
- Modify: `src/server.tsx`
- Test: `tests/e2e.test.ts`

- [ ] **Step 1: Add the e2e tests**

In `tests/e2e.test.ts`:

Add `DEFAULT_MIME_TYPES` to the config import. The file already imports `SiteConfig`; add a second import line near the top:

```ts
import { DEFAULT_MIME_TYPES } from "../src/config/config";
```

Add `mimeTypes` to the `cfg` object in `beforeAll`:

```ts
  cfg = {
    CGIT_SCAN_PATH: root, CGIT_SUMMARY_BRANCHES: 10, CGIT_SUMMARY_TAGS: 10,
    CGIT_SUMMARY_LOG: 10, CGIT_LOG_PAGE_SIZE: 2, CGIT_REPOLIST_PAGE_SIZE: 50,
    mimeTypes: DEFAULT_MIME_TYPES,
  };
```

Add two tests before the CSS tests near the end:

```ts
test("GET /project/tree/main/icon.gif renders an inline image", async () => {
  const html = await (await req("/project/tree/main/icon.gif")).text();
  expect(html).toContain("<img");
  expect(html).toContain('src="/project/raw/main/icon.gif"');
});

test("GET /project/raw/main/icon.gif serves image/gif", async () => {
  const res = await req("/project/raw/main/icon.gif");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/gif");
});
```

- [ ] **Step 2: Run the e2e tests to verify the new ones fail**

Run: `bun test tests/e2e.test.ts`
Expected: FAIL — `icon.gif` currently renders as a binary notice (no MIME yet) and raw serves `application/octet-stream`.

- [ ] **Step 3: Import the helpers in server.tsx**

In `src/server.tsx`, add to the existing imports:

```ts
import { classifyBlob, isBinary } from "./blob";
import { mimeForPath } from "./mime";
```

If a separate `import { isBinary } from "./blob";` line already exists, replace it with the combined line above (do not duplicate the import).

- [ ] **Step 4: Use `classifyBlob`/`mimeForPath` in the tree blob branch**

In the `/:repo/tree/*` handler, replace the blob branch:

```ts
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes !== null) {
      const binary = isBinary(bytes);
      const text = binary ? undefined : new TextDecoder().decode(bytes);
      return c.render(
        <BlobPage name={disc.name} ref={ref} path={path} binary={binary} text={text} size={bytes.length} />,
      );
    }
    throw notFound(`Path not found: ${path}`);
```

with:

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

- [ ] **Step 5: Use MIME for the `/raw/` Content-Type**

In the `/:repo/raw/*` handler, replace:

```ts
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes === null) throw notFound(`Path not found: ${path}`);
    const contentType = isBinary(bytes)
      ? "application/octet-stream"
      : "text/plain; charset=utf-8";
    return new Response(bytes, { headers: { "Content-Type": contentType } });
```

with:

```ts
    const bytes = repo.readFileAtRef(ref, path);
    if (bytes === null) throw notFound(`Path not found: ${path}`);
    const contentType =
      mimeForPath(path, c.env.mimeTypes) ??
      (isBinary(bytes) ? "application/octet-stream" : "text/plain; charset=utf-8");
    return new Response(bytes, { headers: { "Content-Type": contentType } });
```

- [ ] **Step 6: Load config once at startup**

In `src/server.tsx`, replace the default export:

```ts
export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: (req: Request) => createApp().fetch(req, loadConfig()),
};
```

with:

```ts
// Load config once at startup (it now reads a file); a malformed config fails
// fast here rather than per request.
const config = loadConfig();

export default {
  port: Number(process.env.PORT ?? 3000),
  fetch: (req: Request) => createApp().fetch(req, config),
};
```

- [ ] **Step 7: Run the e2e tests**

Run: `bun test tests/e2e.test.ts`
Expected: PASS — including the two new image tests, and the existing README (text) / logo.bin (binary, no MIME) cases unchanged.

- [ ] **Step 8: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 9: Manually verify against a real repo**

Run (server + curl in ONE command — each sandboxed command has its own network namespace):

```bash
CGIT_SCAN_PATH=/home/andrea/code PORT=3000 bun run src/server.tsx >"$TMPDIR/srv.log" 2>&1 &
SRV=$!; trap 'kill $SRV 2>/dev/null' EXIT
curl -sS --retry 30 --retry-connrefused --retry-delay 1 -m 40 -o /dev/null http://localhost:3000/healthz
# pick any image in ~/code and confirm Content-Type + <img>; example:
curl -sS -D - -o /dev/null "http://localhost:3000/meson/raw/HEAD/some/image.png" | grep -i content-type
```

Expected: an `image/*` Content-Type for a known image extension. (If no image is handy, this step is informational — the e2e tests are authoritative.)

- [ ] **Step 10: Commit**

```bash
jj commit -m "feat(ts): drive blob view and raw Content-Type from the MIME map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** config loader + `CGIT_CONFIG`/default + defaults-on-missing + throw-on-malformed (Task 1); `DEFAULT_MIME_TYPES` (Task 1); `mimeForPath` (Task 2); three-way `classifyBlob` with `isBinary` fallback (Task 3); `BlobPage` image/text/binary + `.blob-image` (Task 4); example config + fixture image (Task 5); route wiring, raw Content-Type, startup-once config (Task 6); all spec tests present. No gaps.
- **Placeholder scan:** none — every step has complete code/commands.
- **Type consistency:** `mimeTypes: Record<string,string>` defined in `env.ts` (Task 1) and consumed as `c.env.mimeTypes` (Task 6) and in tests. `mimeForPath(path, mimeTypes)` signature consistent across Tasks 2/3/6. `classifyBlob(bytes, mime) -> {kind, text?}` with `kind: "text"|"binary"|"image"` matches `BlobProps.kind` (Task 4) and the route's destructuring (Task 6). `DEFAULT_MIME_TYPES` exported (Task 1), imported in e2e (Task 6).
- **Note:** Task 6 keeps the tree handler synchronous (`classifyBlob` is sync). The next spec (Shiki) makes the text branch async — out of scope here.
</content>
