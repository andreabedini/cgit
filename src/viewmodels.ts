import type { Reference, RefKind, Commit } from "./git/facade";
import { abbrevOid, formatAge } from "./format";

export interface RepoMeta {
  name: string;
  description?: string;
  owner?: string;
}

export interface RefVM {
  name: string;
  kind: RefKind;
  commitOid: string;
  abbrevOid: string;
}

export interface RepoListEntry {
  name: string;
  description?: string;
  owner?: string;
  lastCommitAge?: string;
}

export interface RepolistViewModel {
  repos: RepoListEntry[];
}

export interface LogRow {
  abbrevOid: string;
  subject: string;
  authorName: string;
  ageLabel: string;
  decorations: RefVM[];
}

export interface SummaryViewModel {
  repo: RepoMeta;
  branches: RefVM[];
  tags: RefVM[];
  recentCommits: LogRow[];
  cloneUrls: string[];
  about?: string;
}

export interface PagerVM {
  offset: number;
  limit: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export interface LogViewModel {
  repo: RepoMeta;
  ref: string;
  rows: LogRow[];
  pager: PagerVM;
}

export function refToVM(ref: Reference): RefVM {
  return {
    name: ref.name,
    kind: ref.kind,
    commitOid: ref.commitOid,
    abbrevOid: abbrevOid(ref.commitOid),
  };
}

export function buildDecorationMap(refs: Reference[]): Map<string, RefVM[]> {
  const map = new Map<string, RefVM[]>();
  for (const ref of refs) {
    const list = map.get(ref.commitOid) ?? [];
    list.push(refToVM(ref));
    map.set(ref.commitOid, list);
  }
  return map;
}

export function commitToLogRow(
  c: Commit,
  decorations: Map<string, RefVM[]>,
  now: Date = new Date(),
): LogRow {
  return {
    abbrevOid: c.abbrevOid,
    subject: c.summary,
    authorName: c.author.name,
    ageLabel: formatAge(c.author.when, now),
    decorations: decorations.get(c.oid) ?? [],
  };
}
