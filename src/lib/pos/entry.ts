import type { Sellable } from './types';

/**
 * The barcode / SKU box.
 *
 * A scanner "types" the code and presses Enter; staff may also type or paste one. The box accepts a
 * bare code ("ESSAGER-1M-AUX"), a quantity before it ("3x ESSAGER-1M-AUX", "3 * ESSAGER-1M-AUX") or
 * after it with an asterisk ("ESSAGER-1M-AUX*3"). The whole text is tried as a code first, so a code
 * that happens to look like a quantity pattern still works.
 */

export const normaliseCode = (value: string): string => value.trim().toLowerCase();

/** The same code with separators removed, so "essager 1m aux" finds "ESSAGER-1M-AUX". */
const looseCode = (value: string): string => normaliseCode(value).replace(/[\s\-_./]+/g, '');

export type CodeIndex = {
  exact: Map<string, Sellable>;
  loose: Map<string, Sellable>;
};

/** SKUs are unique per variant; a bundle's SKU is looked up the same way. */
export function buildCodeIndex(sellables: readonly Sellable[]): CodeIndex {
  const exact = new Map<string, Sellable>();
  const loose = new Map<string, Sellable>();
  const ambiguous = new Set<string>();
  for (const sellable of sellables) {
    if (!sellable.sku) continue;
    exact.set(normaliseCode(sellable.sku), sellable);
    const key = looseCode(sellable.sku);
    if (loose.has(key)) ambiguous.add(key);
    else loose.set(key, sellable);
  }
  // A loose key shared by two SKUs would be a guess: leave it out and let exact matching decide.
  for (const key of ambiguous) loose.delete(key);
  return { exact, loose };
}

export type EntryCandidate = { token: string; quantity: number };

/** The readings of the typed text, most literal first. */
export function entryCandidates(raw: string): EntryCandidate[] {
  const text = raw.trim();
  if (!text) return [];
  const candidates: EntryCandidate[] = [{ token: text, quantity: 1 }];
  const leading = /^(\d{1,3})\s*[x*]\s*(.+)$/i.exec(text);
  if (leading?.[2]) candidates.push({ token: leading[2].trim(), quantity: Number(leading[1]) });
  const trailing = /^(.+?)\s*\*\s*(\d{1,3})$/.exec(text);
  if (trailing?.[1])
    candidates.push({ token: trailing[1].trim(), quantity: Number(trailing[2]) });
  return candidates.filter((candidate) => candidate.quantity >= 1);
}

export type EntryMatch = { sellable: Sellable; quantity: number };

/** Find what the text names by code, or null (the caller then falls back to a name search). */
export function resolveEntry(raw: string, index: CodeIndex): EntryMatch | null {
  for (const { token, quantity } of entryCandidates(raw)) {
    const hit = index.exact.get(normaliseCode(token)) ?? index.loose.get(looseCode(token));
    if (hit) return { sellable: hit, quantity };
  }
  return null;
}
