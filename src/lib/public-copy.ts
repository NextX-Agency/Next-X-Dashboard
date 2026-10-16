/**
 * Public product copy from the legacy shop carries U+FFFC object-replacement characters (pasted
 * inline images) that render as boxes and end up in structured data. Strip them at the boundary.
 */
export function cleanPublicCopy(value: string | null | undefined): string | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/\uFFFC/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned === '' ? null : cleaned;
}
