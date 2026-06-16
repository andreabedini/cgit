// Look up the MIME type for a path by its lowercased extension.
// Returns undefined when there is no extension (e.g. "Makefile") or a leading
// dot only (e.g. ".gitignore"), or when the extension is not in the map.
export function mimeForPath(
  path: string,
  mimeTypes: Record<string, string>,
): string | undefined {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const ext = base.slice(dot + 1).toLowerCase();
  return mimeTypes[ext];
}
