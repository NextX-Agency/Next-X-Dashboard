import { describe, expect, it } from 'vitest';
import { AUDIO_DESCRIPTION, storefrontDescription } from '@/lib/store-copy';

describe('storefrontDescription', () => {
  it('ignores the generic legacy description and falls back to reviewed copy', () => {
    const legacy =
      'Bij ons bestelt u met vertrouwen, dankzij een zorgvuldig geselecteerd assortiment premium producten, hoge kwaliteit.';

    expect(storefrontDescription(legacy, null)).toBe(AUDIO_DESCRIPTION);
  });

  it('keeps a description an owner wrote', () => {
    expect(storefrontDescription('Audio uit Commewijne.', null)).toBe('Audio uit Commewijne.');
  });

  it('skips empty candidates and uses the next real one', () => {
    expect(storefrontDescription(undefined, '  ', 'Tweede keuze.')).toBe('Tweede keuze.');
  });
});
