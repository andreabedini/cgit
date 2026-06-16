import type { Env } from "../app/env";

// Config is carried on the request as Bindings (c.env). This is the CGIT_*
// shape, so loadConfig() reads straight from a process.env-like record.
export type SiteConfig = Env["Bindings"];

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
  };
}
