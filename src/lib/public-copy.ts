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

/**
 * Short blurb for a product card. Legacy summaries are the full description, which usually opens by
 * repeating the product name ("KZ ZSN Pro 2 is een bedrade hybrid in-ear monitor…"). On a card the name
 * is already the heading, so the echo is dropped and the first sentence is kept.
 */
export function cardSummary(summary: string | null | undefined, name: string): string | null {
  const cleaned = cleanPublicCopy(summary);
  if (cleaned === null) return null;
  const firstParagraph = cleaned.split(/\n{2,}/)[0] ?? cleaned;
  const firstSentence = firstParagraph.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? firstParagraph;
  const lower = firstSentence.toLowerCase();
  const prefix = name.toLowerCase();
  let text = firstSentence;
  if (lower.startsWith(prefix)) {
    const rest = firstSentence.slice(name.length).replace(/^\s*(is|zijn|:|-|–)?\s*/i, '');
    if (rest.length >= 12) text = rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
