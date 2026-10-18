import { describe, expect, it } from 'vitest';
import { didYouMean, editDistance, searchTerms, vocabularyFrom } from '@/lib/search-query';

describe('searchTerms', () => {
  it('splits a phrase into words that must all match, with wildcards escaped', () => {
    const terms = searchTerms('  KZ pro 2 ');
    expect(terms?.words).toEqual(['kz', 'pro', '2']);
    expect(terms?.patterns).toEqual(['%kz%', '%pro%', '%2%']);
  });

  it('builds a compact form that ignores spaces and punctuation', () => {
    expect(searchTerms('ZS-10 Pro')?.compact).toBe('zs10pro');
    expect(searchTerms('zs 10')?.compact).toBe('zs10');
    expect(searchTerms('50')?.compact).toBeNull();
  });

  it('escapes special characters so they search for themselves', () => {
    expect(searchTerms('50%')?.patterns).toEqual(['%50\\%%']);
    expect(searchTerms('a_b')?.patterns).toEqual(['%a\\_b%']);
  });

  it('returns null for nothing, bounds the work, and is case-insensitive', () => {
    expect(searchTerms('   ')).toBeNull();
    expect(searchTerms(undefined)).toBeNull();
    expect(searchTerms('a b c d e f g h i j')?.words).toHaveLength(6);
    expect(searchTerms('ZSN')?.words).toEqual(['zsn']);
  });
});

describe('didYouMean', () => {
  const vocabulary = vocabularyFrom([
    'KZ ZSN Pro 2',
    'KZ AS16 Pro X',
    'ESSAGER 1m Aux(3.5mm) to Aux Extension Cable',
    'M-Vave SWS12 Wireless IEM System',
  ]);

  it('corrects a misspelt word using words the catalogue has', () => {
    expect(didYouMean('essgaer cable', vocabulary)).toBe('essager cable');
    expect(didYouMean('wirelss', vocabulary)).toBe('wireless');
    expect(didYouMean('kz zns', vocabulary)).toBe('kz zsn');
  });

  it('leaves a phrase alone when every word is already known or part of one', () => {
    expect(didYouMean('kz pro', vocabulary)).toBeNull();
    expect(didYouMean('as16', vocabulary)).toBeNull();
    expect(didYouMean('zs', vocabulary)).toBeNull();
  });

  it('offers nothing when no catalogue word is close', () => {
    expect(didYouMean('headphones', vocabulary)).toBeNull();
    expect(didYouMean('xyzabc', vocabulary)).toBeNull();
  });
});

describe('editDistance', () => {
  it('counts single edits and stops early', () => {
    expect(editDistance('cable', 'cable')).toBe(0);
    expect(editDistance('cable', 'cables')).toBe(1);
    expect(editDistance('cable', 'cabel')).toBe(1);
    expect(editDistance('a', 'abcdefgh', 2)).toBeGreaterThan(2);
  });
});
