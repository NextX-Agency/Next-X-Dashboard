import { describe, expect, it } from 'vitest';
import { publicName, publicParagraphs, publicText } from '@/lib/english-content';
import { dutchWords } from '@/lib/language-audit';
import { priceTierLabels } from '@/lib/price-tiers';
import { STORE_DESCRIPTION, storefrontDescription } from '@/lib/store-copy';

describe('publicText', () => {
  it('shows English for the known legacy Dutch settings', () => {
    expect(publicText('Alleen ophalen')).toBe('Pickup only');
    expect(publicText('Beschikbaar voor ophalen in de winkel.')).toBe(
      'Available for pickup in store.',
    );
  });

  it('ignores whitespace differences when matching', () => {
    expect(publicText('  Alleen   ophalen ')).toBe('Pickup only');
  });

  it('leaves anything the owner has written, and null, untouched', () => {
    expect(publicText('Pickup in Paramaribo, 9 to 5')).toBe('Pickup in Paramaribo, 9 to 5');
    expect(publicText('Alleen ophalen in Wanica')).toBe('Alleen ophalen in Wanica');
    expect(publicText(null)).toBeNull();
    expect(publicText(undefined)).toBeUndefined();
  });
});

describe('publicName', () => {
  it('swaps generic Dutch nouns and nothing else', () => {
    expect(publicName('ESSAGER 1m Aux(3.5mm) to Aux Verlengkabel')).toBe(
      'ESSAGER 1m Aux(3.5mm) to Aux Extension Cable',
    );
    expect(publicName('KZ IEM 3.5mm Kabel')).toBe('KZ IEM 3.5mm Cable');
  });

  it('keeps brands, models and English names exactly', () => {
    for (const name of ['KZ AS16 Pro X', 'M-Vave SWS12 Wireless IEM System', 'KZ Carol']) {
      expect(publicName(name)).toBe(name);
    }
  });
});

describe('publicParagraphs', () => {
  const dutch =
    'Het hoogwaardige, ergonomische ontwerp garandeert langdurig draagcomfort. Daarnaast zorgt de meegeleverde afneembare, verzilverde 0,75 mm 2-pin kabel voor een loepzuivere signaaloverdracht. Een uitstekende keuze voor audiofielen en muzikanten die streven naar compromisloze audioperfectie.';

  it('translates a known legacy paragraph and keeps the rest', () => {
    const result = publicParagraphs(`${dutch}\n\nThis paragraph is already English.`);
    expect(result).toHaveLength(2);
    expect(dutchWords(result.join(' '))).toEqual([]);
    expect(result[1]).toBe('This paragraph is already English.');
  });

  it('adds nothing the original did not say', () => {
    const [english] = publicParagraphs(dutch);
    // 0.75 mm 2-pin, silver-plated, detachable: the specifications survive translation.
    expect(english).toContain('0.75 mm 2-pin');
    expect(english).toContain('silver-plated');
    expect(english).toContain('detachable');
  });

  it('handles empty input', () => {
    expect(publicParagraphs(null)).toEqual([]);
    expect(publicParagraphs('')).toEqual([]);
  });
});

describe('storefront description', () => {
  it('translates the legacy store description and still lets owner text win', () => {
    expect(
      storefrontDescription(
        'In-ear monitors en accessoires. Bestel via WhatsApp; prijzen in SRD.',
      ),
    ).toBe(STORE_DESCRIPTION);
    expect(storefrontDescription('Audio from Paramaribo.')).toBe('Audio from Paramaribo.');
  });

  it('falls back to reviewed English copy', () => {
    expect(dutchWords(STORE_DESCRIPTION)).toEqual([]);
    expect(storefrontDescription(null, undefined)).toBe(STORE_DESCRIPTION);
  });
});

describe('price tier labels', () => {
  it('are English and use English separators', () => {
    const labels = priceTierLabels('SRD');
    expect(labels['under-50']).toBe('Under SRD 500');
    expect(labels['100-250']).toBe('SRD 1,000 – 2,000');
    expect(labels['250-plus']).toBe('SRD 2,000 or more');
    for (const text of [...Object.values(labels), ...Object.values(priceTierLabels('USD'))]) {
      expect(dutchWords(text)).toEqual([]);
    }
  });
});

describe('dutchWords', () => {
  it('flags Dutch and not English, brands or model numbers', () => {
    expect(dutchWords('Bestel via WhatsApp')).toContain('bestel');
    expect(dutchWords('Winkelwagen legen')).toEqual(
      expect.arrayContaining(['winkelwagen', 'legen']),
    );
    expect(dutchWords('Add to cart')).toEqual([]);
    expect(dutchWords('KZ AS16 Pro X wired in-ear monitor, 16 BA drivers')).toEqual([]);
    expect(dutchWords('en-GB')).toEqual([]);
  });
});
