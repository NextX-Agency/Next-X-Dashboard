import { describe, expect, it } from 'vitest';
import {
  GROUP_LIMITS,
  groupHits,
  MAX_TERM_LENGTH,
  MAX_TOTAL_HITS,
  normaliseTerm,
  parseRecent,
  pushRecent,
  rankHits,
  type SearchHit,
  scoreMatch,
} from '@/lib/search-rank';

const hit = (
  partial: Partial<SearchHit> & Pick<SearchHit, 'kind' | 'id' | 'title'>,
): SearchHit => ({
  subtitle: null,
  href: `/x/${partial.id}`,
  keys: [partial.title],
  ...partial,
});

describe('normaliseTerm', () => {
  it('collapses whitespace, strips control characters and bounds the length', () => {
    expect(normaliseTerm('  kz   duo ')).toBe('kz duo');
    expect(normaliseTerm('a\u0000b\tc')).toBe('a b c');
    expect(normaliseTerm('x'.repeat(500))?.length).toBe(MAX_TERM_LENGTH);
  });
  it('refuses a term that is empty or too short to search', () => {
    expect(normaliseTerm('')).toBeNull();
    expect(normaliseTerm(' a ')).toBeNull();
    expect(normaliseTerm(null)).toBeNull();
    expect(normaliseTerm('ab')).toBe('ab');
  });
});

describe('scoreMatch', () => {
  it('ranks exact above prefix above word-start above contains', () => {
    const exact = scoreMatch('kz', ['KZ']);
    const prefix = scoreMatch('kz', ['KZ Duo']);
    const word = scoreMatch('duo', ['KZ Duo']);
    const contains = scoreMatch('uo', ['KZ Duo']);
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(0);
  });
  it('is not thrown by case or accents, and finds nothing when nothing matches', () => {
    expect(scoreMatch('cafe', ['Café Noir'])).toBeGreaterThan(0);
    expect(scoreMatch('zzz', ['KZ Duo'])).toBe(0);
  });
  it('needs every word of a multi-word term', () => {
    expect(scoreMatch('duo kz', ['KZ Duo (price fixture)'])).toBeGreaterThan(0);
    expect(scoreMatch('duo zzz', ['KZ Duo'])).toBe(0);
  });
});

describe('rankHits', () => {
  it('puts the exact match first, then orders ties by kind and title', () => {
    const ranked = rankHits('v001', [
      hit({ kind: 'customer', id: 'c', title: 'V001 Trading' }),
      hit({ kind: 'sale', id: 's', title: 'V001' }),
      hit({ kind: 'sale', id: 's2', title: 'V0010' }),
    ]);
    expect(ranked.map((row) => row.id)).toEqual(['s', 's2', 'c']);
  });
  it('drops candidates that do not match', () => {
    expect(rankHits('kz', [hit({ kind: 'product', id: '1', title: 'Essager' })])).toEqual([]);
  });
  it('keeps at most the per-kind limit and the overall cap', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      hit({ kind: 'product', id: `p${index}`, title: `KZ ${String(index).padStart(2, '0')}` }),
    );
    const ranked = rankHits('kz', many);
    expect(ranked).toHaveLength(GROUP_LIMITS.product);
    const mixed = (['customer', 'sale', 'order', 'supplier', 'product'] as const).flatMap(
      (kind) =>
        Array.from({ length: 10 }, (_, index) =>
          hit({ kind, id: `${kind}${index}`, title: `KZ ${kind} ${index}` }),
        ),
    );
    expect(rankHits('kz', mixed, { total: 100 }).length).toBeLessThanOrEqual(MAX_TOTAL_HITS);
  });
  it('is stable: the same input gives the same order', () => {
    const input = [
      hit({ kind: 'product', id: 'b', title: 'KZ B' }),
      hit({ kind: 'product', id: 'a', title: 'KZ A' }),
    ];
    expect(rankHits('kz', input).map((row) => row.id)).toEqual(['a', 'b']);
    expect(rankHits('kz', [...input].reverse()).map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('groupHits', () => {
  it('groups in display order and omits empty groups', () => {
    const ranked = rankHits('ab', [
      hit({ kind: 'customer', id: 'c', title: 'Abe' }),
      hit({ kind: 'product', id: 'p', title: 'Abc' }),
    ]);
    expect(groupHits(ranked).map((group) => group.kind)).toEqual(['product', 'customer']);
  });
});

describe('recent searches', () => {
  it('puts the newest first, removes duplicates ignoring case, and keeps six', () => {
    let recent: string[] = [];
    for (const term of ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'TWO']) {
      recent = pushRecent(recent, term);
    }
    expect(recent[0]).toBe('TWO');
    expect(recent).toHaveLength(6);
    expect(recent.filter((term) => term.toLowerCase() === 'two')).toHaveLength(1);
  });
  it('ignores a term too short to keep', () => {
    expect(pushRecent(['kz'], 'a')).toEqual(['kz']);
  });
  it('reads whatever was stored without failing', () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent('not json')).toEqual([]);
    expect(parseRecent('{"a":1}')).toEqual([]);
    expect(parseRecent('["kz duo", 5, "", " x "]')).toEqual(['kz duo']);
  });
});
