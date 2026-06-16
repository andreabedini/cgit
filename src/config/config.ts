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
