import { describe, expect, it } from 'vitest';
import { cardSummary, cleanPublicCopy } from '@/lib/public-copy';

const OBJECT_REPLACEMENT = String.fromCharCode(0xfffc);

describe('cleanPublicCopy', () => {
  it('removes object-replacement characters and the whitespace they leave behind', () => {
    const legacy = `Rijk geluid.  ${OBJECT_REPLACEMENT}\n\n\n\nAfneembare kabel.  ${OBJECT_REPLACEMENT}`;

    expect(cleanPublicCopy(legacy)).toBe('Rijk geluid.\n\nAfneembare kabel.');
  });

  it('returns null for missing or empty copy', () => {
    expect(cleanPublicCopy(null)).toBeNull();
    expect(cleanPublicCopy(undefined)).toBeNull();
    expect(cleanPublicCopy(`  ${OBJECT_REPLACEMENT} \n`)).toBeNull();
  });

  it('leaves clean copy unchanged', () => {
    expect(cleanPublicCopy('Betaalbare in-ear monitor.')).toBe('Betaalbare in-ear monitor.');
  });
});

describe('cardSummary', () => {
  it('drops the product name echo and keeps the first sentence', () => {
    expect(
      cardSummary(
        'KZ ZSN Pro 2 is een bedrade hybrid in-ear monitor met een rijk geluid. Tweede zin.',
        'KZ ZSN Pro 2',
      ),
    ).toBe('Een bedrade hybrid in-ear monitor met een rijk geluid.');
    expect(
      cardSummary(
        'ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel is ideaal om je apparaat te verbinden.',
        'ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel',
      ),
    ).toBe('Ideaal om je apparaat te verbinden.');
  });

  it('keeps copy that does not start with the name, and caps long text', () => {
    expect(cardSummary('Betaalbare in-ear monitor.', 'KZ Vader')).toBe(
      'Betaalbare in-ear monitor.',
    );
    const long = `Een ${'zeer '.repeat(60)}lange zin.`;
    expect((cardSummary(long, 'X') ?? '').length).toBeLessThanOrEqual(160);
    expect(cardSummary(null, 'X')).toBeNull();
  });
});
