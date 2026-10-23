import { describe, expect, it } from 'vitest';
import { STORE_DESCRIPTION, storefrontDescription } from '@/lib/store-copy';

describe('STORE_DESCRIPTION', () => {
  it('says what is sold, where, and how an order works, without filler', () => {
    expect(STORE_DESCRIPTION).toMatch(/in-ear monitors/i);
    expect(STORE_DESCRIPTION).toMatch(/Paramaribo/);
    expect(STORE_DESCRIPTION).toMatch(/WhatsApp/);
    expect(STORE_DESCRIPTION).toMatch(/SRD/);
    expect(STORE_DESCRIPTION).not.toMatch(
      /welcome|seamless|premium|elevate|curated|discover|unlock|!/i,
    );
    expect(STORE_DESCRIPTION.length).toBeLessThanOrEqual(160);
  });
});

describe('storefrontDescription', () => {
  it('ignores the generic legacy description and falls back to reviewed copy', () => {
    const legacy =
      'Bij ons bestelt u met vertrouwen, dankzij een zorgvuldig geselecteerd assortiment premium producten, hoge kwaliteit.';

    expect(storefrontDescription(legacy, null)).toBe(STORE_DESCRIPTION);
  });

  it('keeps a description an owner wrote', () => {
    expect(storefrontDescription('Audio uit Commewijne.', null)).toBe('Audio uit Commewijne.');
  });

  it('skips empty candidates and uses the next real one', () => {
    expect(storefrontDescription(undefined, '  ', 'Tweede keuze.')).toBe('Tweede keuze.');
  });
});
