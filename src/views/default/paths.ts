// Percent-encode each slash-separated segment of a ref or path for use in an
// href, preserving the "/" separators between segments. Hono decodes
// c.req.path, so links built this way round-trip back through splitRefPath.
export function encodeSegments(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}
