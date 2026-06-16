// Separate the ref from the path in a `/tree/` or `/raw/` URL tail.
//
// Refs can contain slashes (e.g. "feature/login"), so the split is ambiguous on
// its own. We resolve greedily against the repo's known ref names:
//   1. the LONGEST ref name that is a prefix of the tail (on a segment boundary)
//   2. else, if the first segment is HEAD or looks like a hex oid, treat it as the ref
//   3. else, default to `defaultRef` with the whole tail as the path
export function splitRefPath(
  tail: string,
  refNames: string[],
  defaultRef: string,
): { ref: string; path: string } {
  const normalized = tail.replace(/^\/+/, "").replace(/\/+$/, "");

  // 1. longest matching ref name
  const match = refNames
    .filter((r) => normalized === r || normalized.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (match) {
    return { ref: match, path: normalized.slice(match.length).replace(/^\/+/, "") };
  }

  // 2. HEAD or a hex oid first segment (libgit2 revparse resolves both)
  const slash = normalized.indexOf("/");
  const first = slash === -1 ? normalized : normalized.slice(0, slash);
  if (first === "HEAD" || /^[0-9a-f]{4,40}$/i.test(first)) {
    return { ref: first, path: slash === -1 ? "" : normalized.slice(slash + 1) };
  }

  // 3. default ref
  return { ref: defaultRef, path: normalized };
}
