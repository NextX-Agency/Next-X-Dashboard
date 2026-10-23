import { describe, expect, it } from 'vitest';
import {
  accessoryShelf,
  categoryTiles,
  DEFAULT_HERO_TITLE,
  latestAdditions,
  type MerchProduct,
  ownerHeroCopy,
  pickShowcase,
} from '@/lib/home-merchandising';

const photo = (width: number) => ({
  url: `/p/${width}.jpg`,
  width,
  height: width,
  alt: null,
  blurDataUrl: null,
});

function product(id: string, patch: Partial<MerchProduct> = {}): MerchProduct {
  return {
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    categorySlug: 'in-ear-monitor',
    categoryName: 'In-Ear Monitor',
    brandName: 'KZ',
    onHand: 5,
    minPriceCents: 100_000,
    image: photo(1000),
    featured: false,
    createdAt: `2026-10-${id.padStart(2, '0')}T00:00:00Z`,
    ...patch,
  };
}

describe('pickShowcase', () => {
  it('takes in-stock products with a large photograph, never a weak or sold-out one', () => {
    const picked = pickShowcase([
      product('1', { image: photo(500) }),
      product('2', { onHand: 0 }),
      product('3', { image: null }),
      product('4'),
      product('5'),
    ]);
    expect(picked.map((item) => item.id).sort()).toEqual(['4', '5']);
  });

  it('puts featured first, then the dearest, and prefers different categories', () => {
    const picked = pickShowcase([
      product('1', { minPriceCents: 300_000, categorySlug: 'a' }),
      product('2', { minPriceCents: 290_000, categorySlug: 'a' }),
      product('3', { minPriceCents: 100_000, categorySlug: 'b' }),
      product('4', { minPriceCents: 50_000, categorySlug: 'c', featured: true }),
    ]);
    expect(picked.map((item) => item.id)).toEqual(['4', '1', '3']);
  });

  it('fills from one category when that is all there is', () => {
    const picked = pickShowcase([product('1'), product('2'), product('3'), product('4')]);
    expect(picked).toHaveLength(3);
  });

  it('builds no composition from fewer than two good photographs', () => {
    expect(pickShowcase([product('1')])).toEqual([]);
    expect(pickShowcase([])).toEqual([]);
  });
});

describe('categoryTiles', () => {
  it('shows the lowest price and up to two real photographs, in stock first', () => {
    const tiles = categoryTiles(
      [{ slug: 'in-ear-monitor', name: 'In-Ear Monitor', count: 3 }],
      [
        product('1', { minPriceCents: 300_000, onHand: 0, image: photo(1200) }),
        product('2', { minPriceCents: 150_000 }),
        product('3', { minPriceCents: 200_000, image: photo(900) }),
        product('4', { categorySlug: 'other', minPriceCents: 10_000 }),
      ],
    );
    expect(tiles[0]?.fromCents).toBe(150_000);
    expect(tiles[0]?.images.map((entry) => entry.productName)).toEqual([
      'Product 2',
      'Product 3',
    ]);
  });

  it('keeps a category with no products honest: no price, no photograph', () => {
    const tiles = categoryTiles([{ slug: 'empty', name: 'Empty', count: 0 }], []);
    expect(tiles[0]).toMatchObject({ fromCents: null, images: [] });
  });
});

describe('latestAdditions', () => {
  it('lists the newest in-stock products and skips what is already on the page', () => {
    const items = latestAdditions(
      [product('1'), product('2'), product('3', { onHand: 0 }), product('9'), product('8')],
      new Set(['9']),
      3,
    );
    expect(items.map((item) => item.id)).toEqual(['8', '2', '1']);
  });
});

describe('accessoryShelf', () => {
  it('uses an accessories category with real products, cheapest first', () => {
    const shelf = accessoryShelf(
      [
        product('1', {
          categorySlug: 'in-ear-accessories',
          categoryName: 'In-Ear Accessories',
          minPriceCents: 25_000,
        }),
        product('2', {
          categorySlug: 'in-ear-accessories',
          categoryName: 'In-Ear Accessories',
          minPriceCents: 20_000,
        }),
        product('3', { categorySlug: 'in-ear-monitor' }),
      ],
      new Set(),
    );
    expect(shelf?.category.name).toBe('In-Ear Accessories');
    expect(shelf?.items.map((item) => item.id)).toEqual(['2', '1']);
  });

  it('has no shelf without an accessories category, or with only one product in it', () => {
    expect(accessoryShelf([product('1'), product('2')], new Set())).toBeNull();
    expect(
      accessoryShelf(
        [product('1', { categorySlug: 'accessories', categoryName: 'Accessories' })],
        new Set(),
      ),
    ).toBeNull();
  });
});

describe('ownerHeroCopy', () => {
  it('treats empty text and the known placeholders as unset, so the better default shows', () => {
    expect(ownerHeroCopy(null)).toBeNull();
    expect(ownerHeroCopy('   ')).toBeNull();
    expect(ownerHeroCopy('Welcome To NextX')).toBeNull();
    expect(ownerHeroCopy('  welcome to  NextX ')).toBeNull();
    expect(
      ownerHeroCopy('Browse the range, with real photographs, prices and stock.'),
    ).toBeNull();
    expect(
      ownerHeroCopy('In-ear monitors and accessories. Order via WhatsApp; prices in SRD.'),
    ).toBeNull();
  });

  it('keeps anything the owner actually wrote, exactly as typed', () => {
    expect(ownerHeroCopy('IEMs for stage and studio.')).toBe('IEMs for stage and studio.');
    expect(ownerHeroCopy(' Audio  uit Paramaribo ')).toBe('Audio uit Paramaribo');
  });

  it('has a default headline of its own', () => {
    expect(DEFAULT_HERO_TITLE).not.toMatch(/welcome/i);
  });
});
