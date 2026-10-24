/**
 * Global search: the shape of a hit, how a typed term is cleaned, and how hits are ranked.
 *
 * The database does the matching (bounded, per kind of record, see `server/queries/search.ts`);
 * this module decides what order a handful of candidates is shown in and how many are kept. It is
 * pure so the ranking is unit tested, and it is imported by the browser as well (for the types and
 * for the recent-search list), so it must never import server code.
 */

export const MIN_TERM_LENGTH = 2;
export const MAX_TERM_LENGTH = 64;
/** Hard cap on what one search may return, whatever the caller asks for. */
export const MAX_TOTAL_HITS = 24;

export type SearchKind =
  | 'product'
  | 'customer'
  | 'sale'
  | 'order'
  | 'invoice'
  | 'purchase_order'
  | 'supplier';

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  /** Second line: brand and SKU, a phone number, a customer and date. */
  subtitle: string | null;
  href: string;
  /** Product photograph (thumbnail address), products only. */
  imageUrl?: string | null;
  /** Staff-only figures, shown at the right edge. */
  priceCents?: number | null;
  onHand?: number | null;
  totalCents?: number | null;
  currency?: 'USD' | 'SRD' | null;
  status?: string | null;
  /** The text that matched, used to rank. Not shown. */
  keys: string[];
};

/** How many hits of each kind are kept, so one noisy kind cannot push out the others. */
export const GROUP_LIMITS: Record<SearchKind, number> = {
  product: 8,
  customer: 4,
  sale: 4,
  order: 4,
  invoice: 3,
  purchase_order: 3,
  supplier: 3,
};

/** Display order of the groups. */
export const GROUP_ORDER: SearchKind[] = [
  'product',
  'order',
  'sale',
  'invoice',
  'customer',
  'supplier',
  'purchase_order',
];

export const GROUP_LABELS: Record<SearchKind, string> = {
  product: 'Products',
  customer: 'Customers',
  sale: 'Sales',
  order: 'Orders',
  invoice: 'Invoices',
  purchase_order: 'Purchase orders',
  supplier: 'Suppliers',
};

/**
 * What a person typed, made safe to search: control characters removed, whitespace collapsed,
 * length bounded. Returns null when it is too short to be worth a database round trip.
 */
export function normaliseTerm(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = Array.from(raw, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? ' ' : char;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  const bounded = cleaned.slice(0, MAX_TERM_LENGTH).trim();
  return bounded.length >= MIN_TERM_LENGTH ? bounded : null;
}

const fold = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * How well one candidate matches a term, 0 for no match. Tiers, best first:
 * exact (100), starts with (80), a word starts with it (60), contains (40). The best tier over all
 * of the candidate's keys wins; a term made of several words must match every word.
 */
export function scoreMatch(term: string, keys: readonly string[]): number {
  const wanted = fold(term).trim();
  if (!wanted) return 0;
  const words = wanted.split(' ').filter(Boolean);
  let best = 0;
  for (const key of keys) {
    const text = fold(key);
    if (!text) continue;
    let score = 0;
    if (text === wanted) score = 100;
    else if (text.startsWith(wanted)) score = 80;
    else if (text.split(/[\s\-_/·.,]+/).some((part) => part.startsWith(wanted))) score = 60;
    else if (text.includes(wanted)) score = 40;
    else if (words.length > 1 && words.every((word) => text.includes(word))) score = 30;
    if (score > best) best = score;
  }
  return best;
}

/** A kind's own weight: ties between kinds go to the thing staff reach for most. */
const KIND_WEIGHT: Record<SearchKind, number> = {
  product: 5,
  order: 4,
  sale: 4,
  invoice: 3,
  customer: 3,
  purchase_order: 2,
  supplier: 2,
};

export type RankedHit = SearchHit & { score: number };

/**
 * Rank candidates for a term: drop non-matches, order by score then kind weight then title, keep at
 * most the group limits and the overall cap. Stable and deterministic.
 */
export function rankHits(
  term: string,
  candidates: readonly SearchHit[],
  options: { total?: number } = {},
): RankedHit[] {
  const total = Math.min(options.total ?? MAX_TOTAL_HITS, MAX_TOTAL_HITS);
  const scored = candidates
    .map((hit) => ({ ...hit, score: scoreMatch(term, hit.keys) }))
    .filter((hit) => hit.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        KIND_WEIGHT[b.kind] - KIND_WEIGHT[a.kind] ||
        a.title.localeCompare(b.title) ||
        a.id.localeCompare(b.id),
    );
  const perKind = new Map<SearchKind, number>();
  const kept: RankedHit[] = [];
  for (const hit of scored) {
    const used = perKind.get(hit.kind) ?? 0;
    if (used >= GROUP_LIMITS[hit.kind]) continue;
    perKind.set(hit.kind, used + 1);
    kept.push(hit);
    if (kept.length >= total) break;
  }
  return kept;
}

/** Hits grouped for display, in `GROUP_ORDER`, each group in rank order. */
export function groupHits(
  hits: readonly RankedHit[],
): { kind: SearchKind; hits: RankedHit[] }[] {
  return GROUP_ORDER.map((kind) => ({
    kind,
    hits: hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length > 0);
}

/* ── Recent searches (kept in this browser only) ─────────────────────────── */

export const MAX_RECENT = 6;

/** Put `term` first, remove its duplicates (ignoring case), keep at most `MAX_RECENT`. */
export function pushRecent(recent: readonly string[], term: string): string[] {
  const clean = normaliseTerm(term);
  if (!clean) return [...recent];
  const key = clean.toLowerCase();
  return [clean, ...recent.filter((item) => item.toLowerCase() !== key)].slice(0, MAX_RECENT);
}

/** What was stored may be anything; keep only usable strings. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => normaliseTerm(item))
      .filter((item): item is string => item !== null)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}
