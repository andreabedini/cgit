import type { Reference, LogPage } from "../git/facade";
import {
  buildDecorationMap,
  commitToLogRow,
  type LogViewModel,
  type RepoMeta,
} from "../viewmodels";

export function buildLogVM(
  repo: RepoMeta,
  ref: string,
  page: LogPage,
  refs: Reference[],
  offset: number,
  limit: number,
  now: Date = new Date(),
): LogViewModel {
  const decorations = buildDecorationMap(refs);
  return {
    repo,
    ref,
    rows: page.commits.map((c) => commitToLogRow(c, decorations, now)),
    pager: { offset, limit, hasPrev: offset > 0, hasNext: page.hasMore },
  };
}
