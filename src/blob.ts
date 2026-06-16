// A blob is treated as binary if a NUL byte appears within the first 8000 bytes
// — the same heuristic git itself uses for diff/textconv decisions.
export function isBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return true;
  }
  return false;
}
