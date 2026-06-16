// A blob is treated as binary if a NUL byte appears within the first 8000 bytes
// — the same heuristic git itself uses for diff/textconv decisions.
export function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}

export type BlobKind = "text" | "binary" | "image";

// Decide how to render a blob from its bytes and (optional) MIME type:
//  - image/*            -> image
//  - other non-text/*   -> binary (e.g. application/pdf)
//  - text/*             -> text (decoded)
//  - no MIME match      -> isBinary heuristic decides text vs binary
// Text is decoded only when the result is text.
export function classifyBlob(
  bytes: Uint8Array,
  mime: string | undefined,
): { kind: BlobKind; text?: string } {
  if (mime?.startsWith("image/")) return { kind: "image" };
  if (mime && !mime.startsWith("text/")) return { kind: "binary" };
  if (!mime && isBinary(bytes)) return { kind: "binary" };
  return { kind: "text", text: new TextDecoder().decode(bytes) };
}
