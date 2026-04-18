/**
 * Pure text replacement helpers used by the /api/files/replace route.
 * Extracted so the literal / case-insensitive search-and-replace can be
 * unit-tested without standing up the Next.js request pipeline.
 */

export function countOccurrences(
  haystack: string,
  needle: string,
  caseSensitive: boolean,
): number {
  if (needle.length === 0) return 0;
  if (caseSensitive) {
    let count = 0;
    let idx = 0;
    while ((idx = haystack.indexOf(needle, idx)) !== -1) {
      count += 1;
      idx += needle.length;
    }
    return count;
  }
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let idx = 0;
  while ((idx = h.indexOf(n, idx)) !== -1) {
    count += 1;
    idx += n.length;
  }
  return count;
}

export function replaceAllLiteral(
  haystack: string,
  needle: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  if (needle.length === 0) return haystack;
  if (caseSensitive) {
    return haystack.split(needle).join(replacement);
  }
  const hLower = haystack.toLowerCase();
  const nLower = needle.toLowerCase();
  let out = '';
  let idx = 0;
  let cursor = 0;
  while ((idx = hLower.indexOf(nLower, cursor)) !== -1) {
    out += haystack.slice(cursor, idx) + replacement;
    cursor = idx + needle.length;
  }
  out += haystack.slice(cursor);
  return out;
}
