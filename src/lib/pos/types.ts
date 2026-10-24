import type { Cents } from '@/lib/money';

/**
 * What the counter screen knows about a thing it can sell.
 *
 * A variant (one exact option of a product) or a bundle. Both reduce to the same shape so the grid,
 * the cart and the margin check do not care which one they hold. Prices here are USD list prices
 * (the catalogue's base currency); the cart converts them to the sale's currency.
 */
export type PosImage = { url: string; alt: string | null };

export type SellableComponent = {
  variantId: string;
  /** Units of this component in one bundle. */
  quantity: number;
  label: string;
};

export type Sellable = {
  /** `v:<variantId>` or `b:<bundleId>`: stable across reloads, used by the cart and by localStorage. */
  key: string;
  kind: 'variant' | 'bundle';
  /** For a bundle, its first component (the sale schema wants a variant id on every line). */
  variantId: string;
  bundleId: string | null;
  /** Groups the options of one product; a bundle is its own group. */
  productId: string;
  name: string;
  /** The exact option ("Black", "3.5mm"), null for a single-option product. */
  option: string | null;
  sku: string;
  brand: string | null;
  category: string | null;
  model: string | null;
  /** Option values, kept only for search. */
  attributes: string[];
  listPriceCents: Cents;
  /** Units on hand (a bundle: how many complete bundles can be made). */
  onHand: number;
  /** Units promised to open orders. */
  reserved: number;
  /** Total cost of the units on hand, USD cents. */
  valueCents: Cents;
  referenceCostCents: Cents;
  /** Bundles: landed cost of one bundle (sum of the component costs), USD cents. */
  bundleCostCents: Cents;
  image: PosImage | null;
  components: SellableComponent[];
};

export type PosProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  model: string | null;
  sellables: Sellable[];
  image: PosImage | null;
  onHand: number;
  minPriceCents: Cents;
  maxPriceCents: Cents;
};

export type PosCustomer = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
};
