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
