import { createFactory } from 'hono/factory'

import { Repository } from "../git";
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
  };
  Variables: {
    disc: DiscoveredRepo;
    repo: Repository;
  }
};

export const factory = createFactory<Env>();
