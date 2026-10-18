import type { CatalogImage, CatalogListItem } from '@/server/queries/catalog';

/**
 * Which real products the home page puts where. Everything here is derived from the public catalogue:
 * nothing is invented (no "best sellers", no ratings), and a product shown in one section is not repeated
 * in the next, so a small catalogue still reads as several different shelves.
 */
export type MerchProduct = Pick<
  CatalogListItem,
  | 'id'
  | 'name'
  | 'slug'
  | 'categorySlug'
  | 'categoryName'
  | 'brandName'
  | 'onHand'
  | 'minPriceCents'
  | 'image'
  | 'featured'
  | 'createdAt'
>;

/** A photograph this large holds up in the hero's big frame; a 500 px one would blur. */
export const HERO_MIN_IMAGE_WIDTH = 800;

const inStock = (product: MerchProduct) => product.onHand > 0;
const byNewest = (a: MerchProduct, b: MerchProduct) => b.createdAt.localeCompare(a.createdAt);

/**
 * The products shown large in the hero: in stock, with a photograph big enough, featured first, then by
 * price (the range's showpieces), different categories before a second from one. Fewer than two
 * qualifying products means no composition at all, never a hero built from weak pictures.
 */
export function pickShowcase<T extends MerchProduct>(products: readonly T[], count = 3): T[] {
  const eligible = products
    .filter(
      (product) =>
        inStock(product) && product.image && product.image.width >= HERO_MIN_IMAGE_WIDTH,
    )
    .sort(
      (a, b) =>
        Number(b.featured) - Number(a.featured) ||
        b.minPriceCents - a.minPriceCents ||
        byNewest(a, b),
    );
  const picked: T[] = [];
  const seenCategories = new Set<string | null>();
  for (const product of eligible) {
    if (picked.length >= count) break;
    if (seenCategories.has(product.categorySlug)) continue;
    picked.push(product);
    seenCategories.add(product.categorySlug);
  }
  for (const product of eligible) {
    if (picked.length >= count) break;
    if (!picked.includes(product)) picked.push(product);
  }
  return picked.length >= 2 ? picked : [];
}

export type CategoryTile = {
  slug: string;
  name: string;
  count: number;
  /** The lowest public price among the category's products, in the shop currency's cents. */
  fromCents: number | null;
  /** Up to two real photographs of products in the category (in stock first). */
  images: { image: CatalogImage; productName: string }[];
};

export function categoryTiles(
  categories: readonly { slug: string; name: string; count: number }[],
  products: readonly MerchProduct[],
): CategoryTile[] {
  return categories.map((category) => {
    const items = products.filter((product) => product.categorySlug === category.slug);
    const pictured = items
      .filter((product) => product.image)
      .sort(
        (a, b) =>
          Number(inStock(b)) - Number(inStock(a)) ||
          (b.image?.width ?? 0) - (a.image?.width ?? 0) ||
          b.minPriceCents - a.minPriceCents,
      );
    return {
      slug: category.slug,
      name: category.name,
      count: category.count,
      fromCents: items.length
        ? Math.min(...items.map((product) => product.minPriceCents))
        : null,
      images: pictured
        .slice(0, 2)
        .flatMap((product) =>
          product.image ? [{ image: product.image, productName: product.name }] : [],
        ),
    };
  });
}

/** The most recently added products, in stock first, leaving out anything already shown. */
export function latestAdditions<T extends MerchProduct>(
  products: readonly T[],
  exclude: ReadonlySet<string>,
  count = 4,
): T[] {
  return products
    .filter((product) => !exclude.has(product.id))
    .sort((a, b) => Number(inStock(b)) - Number(inStock(a)) || byNewest(a, b))
    .slice(0, count);
}

/** Products from an accessories category (when there is one with real products), cheapest first. */
export function accessoryShelf<T extends MerchProduct>(
  products: readonly T[],
  exclude: ReadonlySet<string>,
  count = 4,
): { category: { slug: string; name: string }; items: T[] } | null {
  const candidates = products.filter(
    (product) =>
      product.categorySlug &&
      /accessor/i.test(`${product.categorySlug} ${product.categoryName ?? ''}`) &&
      !exclude.has(product.id),
  );
  const first = candidates[0];
  if (!first?.categorySlug) return null;
  const items = candidates
    .filter((product) => product.categorySlug === first.categorySlug)
    .sort(
      (a, b) => Number(inStock(b)) - Number(inStock(a)) || a.minPriceCents - b.minPriceCents,
    )
    .slice(0, count);
  return items.length >= 2
    ? {
        category: { slug: first.categorySlug, name: first.categoryName ?? 'Accessories' },
        items,
      }
    : null;
}
