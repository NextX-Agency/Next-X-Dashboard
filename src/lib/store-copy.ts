/**
 * Reviewed storefront copy. Customer-facing text is Dutch, and every claim here is something the
 * operation can back up: what is sold, how orders are placed, and in which currency.
 */
export const AUDIO_DESCRIPTION =
  'In-ear monitors, oordopjes en audio-accessoires. Bestel via WhatsApp; prijzen in SRD.';

/**
 * The imported legacy shop description is generic marketing ("zorgvuldig geselecteerd assortiment
 * premium producten, hoge kwaliteit, betrouwbare service…") that says nothing about the products.
 * It is treated as unset so the reviewed copy shows, while a description an owner writes later wins.
 */
const LEGACY_BOILERPLATE = /zorgvuldig geselecteerd assortiment premium producten/i;

export function storefrontDescription(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const text = candidate?.trim();
    if (text && !LEGACY_BOILERPLATE.test(text)) return text;
  }
  return AUDIO_DESCRIPTION;
}
