import { describe, expect, it } from 'vitest';
import { likeContains } from '@/lib/like';

describe('likeContains', () => {
  it('wraps the query for a contains search', () => {
    expect(likeContains('zsn')).toBe('%zsn%');
    expect(likeContains('  KZ  ')).toBe('%KZ%');
  });

  it('escapes the wildcards so special characters search for themselves', () => {
    expect(likeContains('50%')).toBe('%50\\%%');
    expect(likeContains('a_b')).toBe('%a\\_b%');
    expect(likeContains('c:\\x')).toBe('%c:\\\\x%');
  });

  it('leaves other punctuation alone', () => {
    expect(likeContains('Aux(3.5mm)')).toBe('%Aux(3.5mm)%');
    expect(likeContains("O'Neil & co")).toBe("%O'Neil & co%");
  });
});
