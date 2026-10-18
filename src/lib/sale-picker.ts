import type { SaleVariantOption } from '@/server/queries/pickers';
import { variantLabel } from './store-messages';

/**
 * Pure helpers behind the visual sale picker: group variants under their product, search, filter.
 * Kept free of React so the rules (what matches a search, what "in stock" means) are unit-tested.
 */

export type PickerStockFilter = 'all' | 'in-stock' | 'out';

export type PickerProduct = {
  productId: string;
  name: string;
  brandName: string | null;
  categoryName: string | null;
  modelNumber: string | null;
  variants: SaleVariantOption[];
  /** Photograph of the representative (first active in-stock) variant, else the first variant. */
  image: SaleVariantOption['image'];
  onHand: number;
  minPriceCents: number;
  maxPriceCents: number;
};

/** What the staff member reads for a variant: its name, or its structured options, or nothing. */
export function optionLabel(variant: Pick<SaleVariantOption, 'variantName' | 'attributes'>) {
  const named = variantLabel(variant.variantName);
  if (named) return named;
  const values = Object.values(variant.attributes).filter(Boolean);
  return values.length ? values.join(' · ') : null;
}

export function groupByProduct(variants: readonly SaleVariantOption[]): PickerProduct[] {
  const groups = new Map<string, SaleVariantOption[]>();
  for (const variant of variants) {
    const key = variant.productId || variant.productName;
    const list = groups.get(key) ?? [];
    list.push(variant);
    groups.set(key, list);
  }
  return [...groups.entries()].map(([productId, list]) => {
    const first = list[0] as SaleVariantOption;
    const sellable = list.filter((variant) => variant.isActive);
    const shown = sellable.length ? sellable : list;
    const lead =
      shown.find((variant) => variant.onHand > 0 && variant.image) ??
      shown.find((v) => v.image) ??
      first;
    const prices = shown.map((variant) => variant.listPriceCents);
    return {
      productId,
      name: first.productName,
      brandName: first.brandName,
      categoryName: first.categoryName,
      modelNumber: first.modelNumber,
      variants: list,
      image: lead.image,
      onHand: shown.reduce((sum, variant) => sum + Math.max(variant.onHand, 0), 0),
      minPriceCents: Math.min(...prices),
      maxPriceCents: Math.max(...prices),
    };
  });
}

const norm = (value: string | null | undefined) => (value ?? '').toLowerCase();

/** Every word the person typed must appear somewhere on the product or one of its variants. */
export function matchesQuery(product: PickerProduct, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    product.name,
    product.brandName,
    product.categoryName,
    product.modelNumber,
    ...product.variants.flatMap((variant) => [
      variant.sku,
      variant.variantName,
      ...Object.values(variant.attributes),
    ]),
  ]
    .map(norm)
    .join(' \n ');
  return words.every((word) => haystack.includes(word));
}

export function filterProducts(
  products: readonly PickerProduct[],
  filters: { query: string; category: string | null; stock: PickerStockFilter },
): PickerProduct[] {
  return products.filter((product) => {
    if (filters.category && product.categoryName !== filters.category) return false;
    if (filters.stock === 'in-stock' && product.onHand <= 0) return false;
    if (filters.stock === 'out' && product.onHand > 0) return false;
    return matchesQuery(product, filters.query);
  });
}

export function stockLabel(onHand: number): {
  text: string;
  tone: 'ok' | 'low' | 'out' | 'over';
} {
  if (onHand < 0) return { text: `${onHand} (oversold)`, tone: 'over' };
  if (onHand === 0) return { text: 'Out of stock', tone: 'out' };
  if (onHand <= 3) return { text: `${onHand} left`, tone: 'low' };
  return { text: `${onHand} in stock`, tone: 'ok' };
}
