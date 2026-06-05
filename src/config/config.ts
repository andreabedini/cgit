export interface SiteConfig {
  scanPath: string;
  cloneUrlBase?: string;
  summaryBranches: number;
  summaryTags: number;
  summaryLog: number;
  logPageSize: number;
  repolistPageSize: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): SiteConfig {
  return {
    scanPath: env.CGIT_SCAN_PATH ?? process.cwd(),
    cloneUrlBase: env.CGIT_CLONE_URL_BASE,
    summaryBranches: Number(env.CGIT_SUMMARY_BRANCHES ?? 10),
    summaryTags: Number(env.CGIT_SUMMARY_TAGS ?? 10),
    summaryLog: Number(env.CGIT_SUMMARY_LOG ?? 10),
    logPageSize: Number(env.CGIT_LOG_PAGE_SIZE ?? 50),
    repolistPageSize: Number(env.CGIT_REPOLIST_PAGE_SIZE ?? 50),
  };
}
