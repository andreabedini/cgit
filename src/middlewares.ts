import type { Reference } from "./git/facade";
import { factory } from "./app/env";
import { findRepo, openRepository } from "./git";

// Resolve `/:repo/` to a discovered repo + an open libgit2 handle, exposed to
// downstream handlers via context. Owns the repo's lifecycle: it frees the
// handle once the handler has run, so handlers never open or free repos
// themselves.
export const useRepository = factory.createMiddleware(async (c, next) => {
  // Bare `/:repo` is handled by appendTrailingSlash (it 404s then redirects);
  // skip opening a repo we would only throw away on the redirect.
  if (!c.req.path.endsWith("/")) return next();

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
