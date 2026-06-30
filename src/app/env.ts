import { createFactory } from 'hono/factory'

import { Commit, CommitDiff, Repository } from "../git";
import { DiscoveredRepo } from "../git/scan";

export type Env = {
  Bindings: {
    CGIT_SCAN_PATH: string;
    CGIT_CLONE_URL_BASE?: string;
    CGIT_SUMMARY_BRANCHES: number;
    CGIT_SUMMARY_TAGS: number;
    CGIT_SUMMARY_LOG: number;
    CGIT_LOG_PAGE_SIZE: number;
    CGIT_REPOLIST_PAGE_SIZE: number;
    mimeTypes: Record<string, string>;
  };
  Variables: {
    disc: DiscoveredRepo;
    repo: Repository;
    commit: Commit;
    diff: CommitDiff;
  }
};

export const factory = createFactory<Env>();
