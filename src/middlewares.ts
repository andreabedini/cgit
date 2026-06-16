import type { Reference } from "./git/facade";
import { factory } from "./app/env";
import { findRepo, openRepository } from "./git";

// Resolve `/:repo/` to a discovered repo + an open libgit2 handle, exposed to
// downstream handlers via context. Owns the repo's lifecycle: it frees the
// handle once the handler has run, so handlers never open or free repos
// themselves.
export const useRepository = factory.createMiddleware(async (c, next) => {
  // Redirect-only stubs (`/repo`, `/repo/log`) lack a trailing slash and get sent
  // to their slash form by appendTrailingSlash — don't open a repo we'd discard.
  // tree/raw are genuine slash-less content paths, so open the repo for those.
  const p = c.req.path;
  if (!p.endsWith("/") && !p.includes("/tree/") && !p.includes("/raw/")) return next();

  const disc = findRepo(c.env.CGIT_SCAN_PATH, c.req.param("repo")!); // present: matched by /:repo/*
  c.set("disc", disc);

  const repo = openRepository(disc.path);
  c.set("repo", repo);

  try {
    await next();
  } finally {
    repo.free();
  }
});

// Group refs by the commit they point at, for decorating log rows.
export function buildDecorationMap(refs: Reference[]): Map<string, Reference[]> {
  const map = new Map<string, Reference[]>();
  for (const ref of refs) {
    const list = map.get(ref.commitOid) ?? [];
    list.push(ref);
    map.set(ref.commitOid, list);
  }
  return map;
}
