import type { PosProduct, Sellable } from './types';

/**
 * Pure helpers behind the counter's product grid: group options under their product, search, filter
 * by category, and the stock wording. No React, so the rules are unit-tested.
 */

const norm = (value: string | null | undefined) => (value ?? '').toLowerCase();

/** A single-option product carries a placeholder option name; it tells the cashier nothing. */
export function optionName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim();
  return trimmed && !/^(default|standaard|standard|std)$/i.test(trimmed) ? trimmed : null;
}

/** One product per group; options keep the catalogue order. A bundle is a group of its own. */
export function groupProducts(sellables: readonly Sellable[]): PosProduct[] {
  const groups = new Map<string, Sellable[]>();
  for (const sellable of sellables) {
    const list = groups.get(sellable.productId) ?? [];
    list.push(sellable);
    groups.set(sellable.productId, list);
  }
  return [...groups.entries()].map(([id, list]) => {
    const first = list[0] as Sellable;
    const lead =
      list.find((sellable) => sellable.onHand > 0 && sellable.image) ??
      list.find((sellable) => sellable.image) ??
      first;
    const prices = list.map((sellable) => sellable.listPriceCents);
    return {
      id,
      name: first.name,
      brand: first.brand,
      category: first.category,
      model: first.model,
      sellables: list,
      image: lead.image,
      onHand: list.reduce((sum, sellable) => sum + Math.max(sellable.onHand, 0), 0),
      minPriceCents: Math.min(...prices),
      maxPriceCents: Math.max(...prices),
    };
  });
}

/** Every word typed must appear somewhere on the product, its brand, category, model, SKU or options. */
export function productMatches(product: PosProduct, query: string): boolean {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    product.name,
    product.brand,
    product.category,
    product.model,
    ...product.sellables.flatMap((sellable) => [
      sellable.sku,
      sellable.option,
      ...sellable.attributes,
    ]),
  ]
    .map(norm)
    .join(' \n ');
  return words.every((word) => haystack.includes(word));
}

/** Rank so the product the cashier means is first: an SKU hit, then names starting with the text. */
function rank(product: PosProduct, query: string): number {
  const q = norm(query).trim();
  if (!q) return 3;
  if (product.sellables.some((sellable) => norm(sellable.sku) === q)) return 0;
  if (norm(product.name).startsWith(q)) return 1;
  if (product.sellables.some((sellable) => norm(sellable.sku).startsWith(q))) return 1;
  if (norm(product.name).includes(q)) return 2;
  return 3;
}

export function filterProducts(
  products: readonly PosProduct[],
  filters: { query: string; category: string | null },
): PosProduct[] {
  const matched = products.filter(
    (product) =>
      (!filters.category || product.category === filters.category) &&
      productMatches(product, filters.query),
  );
  if (!filters.query.trim()) return matched;
  return matched
    .map((product, index) => ({ product, index, rank: rank(product, filters.query) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.product);
}

/** Categories that have something to sell, in the order they first appear, with how many products. */
export function categoryChips(
  products: readonly PosProduct[],
): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    if (!product.category) continue;
    counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type StockTone = 'ok' | 'low' | 'out' | 'over';

/** Informative only: the counter never blocks a sale on stock (the server records a shortfall). */
export function stockBadge(onHand: number): { text: string; tone: StockTone } {
  if (onHand < 0) return { text: 'Oversold', tone: 'over' };
  if (onHand === 0) return { text: 'Out of stock', tone: 'out' };
  if (onHand <= 3) return { text: `${onHand} left`, tone: 'low' };
  return { text: `${onHand} in stock`, tone: 'ok' };
}

/** "Black · 3.5mm" or the SKU when the option has no name. */
export function sellableLabel(sellable: Pick<Sellable, 'name' | 'option'>): string {
  return sellable.option ? `${sellable.name} · ${sellable.option}` : sellable.name;
}
