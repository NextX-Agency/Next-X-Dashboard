import { likeContains } from '@/lib/like';

/**
 * How a shopper's words become a catalogue search. Plain `ILIKE '%whole phrase%'` made "kz pro 2" miss
 * "KZ ZSN Pro 2" and "zs 10" miss "ZS10", so the phrase is split into words that must ALL match
 * somewhere in the product, and a spacing-and-punctuation-insensitive form is tried as well.
 */
export type SearchTerms = {
  /** `%word%` patterns, wildcards escaped. Every one must match. */
  patterns: string[];
  /** The words as typed, lower-cased, for ranking. */
  words: string[];
  /** Letters and digits only ("ZS-10 pro" gives "zs10pro"), or null when too short to be useful. */
  compact: string | null;
  /** The whole phrase, trimmed and lower-cased. */
  phrase: string;
  /** `phrase%` for "starts with", wildcards escaped. */
  prefix: string;
};

const MAX_WORDS = 6;
const MAX_WORD_LENGTH = 40;

export function searchTerms(query: string | undefined | null): SearchTerms | null {
  const phrase = (query ?? '').trim().toLowerCase().slice(0, 120);
  if (!phrase) return null;
  const words = phrase
    .split(/[\s,;]+/)
    .map((word) => word.slice(0, MAX_WORD_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  if (!words.length) return null;
  const compact = phrase.replace(/[^a-z0-9]/g, '');
  return {
    patterns: words.map((word) => likeContains(word)),
    words,
    compact: compact.length >= 3 ? compact : null,
    phrase,
    prefix: `${likeContains(phrase).slice(1, -1)}%`,
  };
}

/** Edit distance (insert, delete, replace, or swap two neighbours) with an early exit past `limit`. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) row.push(i === 0 ? j : 0);
    rows.push(row);
  }
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        (rows[i - 1]?.[j] ?? 0) + 1,
        (rows[i]?.[j - 1] ?? 0) + 1,
        (rows[i - 1]?.[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      }
      (rows[i] as number[])[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
  }
  return rows[a.length]?.[b.length] ?? limit + 1;
}

/**
 * A corrected phrase for a search that found nothing, built from words the catalogue really uses
 * (product names, brands, models). A word that already appears in the vocabulary is left alone; one
 * that does not is replaced by the closest word within a small edit distance. Returns null when
 * nothing needed fixing or nothing close enough exists. No search service, just the words we have.
 */
export function didYouMean(query: string, vocabulary: readonly string[]): string | null {
  const terms = searchTerms(query);
  if (!terms) return null;
  const words = [...new Set(vocabulary.map((word) => word.toLowerCase()))];
  const known = new Set(words);
  let changed = false;
  const corrected = terms.words.map((word) => {
    if (known.has(word) || words.some((candidate) => candidate.includes(word))) return word;
    if (word.length < 3) return word;
    const limit = word.length <= 4 ? 1 : 2;
    let best: { word: string; distance: number } | null = null;
    for (const candidate of words) {
      const distance = editDistance(word, candidate, limit);
      if (distance <= limit && (!best || distance < best.distance))
        best = { word: candidate, distance };
    }
    if (!best) return word;
    changed = true;
    return best.word;
  });
  return changed ? corrected.join(' ') : null;
}

/** Individual words of public names, brands and models, ready for `didYouMean`. */
export function vocabularyFrom(texts: readonly (string | null | undefined)[]): string[] {
  const words = new Set<string>();
  for (const text of texts) {
    for (const word of (text ?? '').toLowerCase().split(/[^a-z0-9]+/)) {
      if (word.length >= 2) words.add(word);
    }
  }
  return [...words];
}
