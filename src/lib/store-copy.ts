import { publicText, STORE_DESCRIPTION_TEXT } from '@/lib/english-content';

/**
 * Reviewed storefront copy. Customer-facing text is English, and every claim here is something the
 * operation can back up: what is sold, how orders are placed, and in which currency.
 */
export const STORE_DESCRIPTION = STORE_DESCRIPTION_TEXT;

/**
 * The imported legacy shop description is generic marketing ("zorgvuldig geselecteerd assortiment
 * premium producten, hoge kwaliteit, betrouwbare service…") that says nothing about the products.
 * It is treated as unset so the reviewed copy shows, while a description an owner writes later wins.
 */
const LEGACY_BOILERPLATE = /zorgvuldig geselecteerd assortiment premium producten/i;

export function storefrontDescription(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    const text = publicText(candidate?.trim());
    if (text && !LEGACY_BOILERPLATE.test(text)) return text;
  }
  return STORE_DESCRIPTION;
}
