import { describe, expect, it } from 'vitest';
import {
  filterProducts,
  groupByProduct,
  matchesQuery,
  optionLabel,
  stockLabel,
} from '@/lib/sale-picker';
import type { SaleVariantOption } from '@/server/queries/pickers';

const variant = (patch: Partial<SaleVariantOption>): SaleVariantOption => ({
  id: 'v',
  sku: 'SKU',
  productName: 'Product',
  variantName: 'Standaard',
  listPriceCents: 1000,
  referenceCostCents: 0,
  weightGrams: 0,
  onHand: 1,
  valueCents: 0,
  unitCostCents: null,
  isActive: true,
  productId: 'p',
  brandName: null,
  categoryName: null,
  modelNumber: null,
  attributes: {},
  siblingCount: 1,
  image: null,
  locations: [],
  ...patch,
});

const iem = [
  variant({
    id: 'b',
    sku: 'KZ-IEM-BLK',
    productName: 'KZ Test IEM',
    variantName: 'Black',
    productId: 'iem',
    brandName: 'KZ',
    categoryName: 'In-Ear Monitor',
    modelNumber: 'KZT-1',
    attributes: { colour: 'Black' },
    onHand: 3,
    listPriceCents: 3000,
    image: { url: '/black.jpg', alt: null },
  }),
  variant({
    id: 's',
    sku: 'KZ-IEM-SLV',
    productName: 'KZ Test IEM',
    variantName: 'Silver',
    productId: 'iem',
    brandName: 'KZ',
    categoryName: 'In-Ear Monitor',
    modelNumber: 'KZT-1',
    attributes: { colour: 'Silver' },
    onHand: 0,
    listPriceCents: 3200,
  }),
];
const cable = [
  variant({
    id: 'c',
    sku: 'ES-1M',
    productName: 'ESSAGER 1m Aux',
    productId: 'cable',
    brandName: 'ESSAGER',
    categoryName: 'Accessories',
    onHand: 10,
    listPriceCents: 649,
  }),
];

describe('groupByProduct', () => {
  const groups = groupByProduct([...iem, ...cable]);

  it('groups variants under one product with the price range and total stock', () => {
    expect(groups).toHaveLength(2);
    const group = groups.find((entry) => entry.productId === 'iem');
    expect(group?.variants).toHaveLength(2);
    expect(group?.minPriceCents).toBe(3000);
    expect(group?.maxPriceCents).toBe(3200);
    expect(group?.onHand).toBe(3);
  });

  it('leads with a photographed in-stock variant', () => {
    expect(groups.find((entry) => entry.productId === 'iem')?.image?.url).toBe('/black.jpg');
  });

  it('ignores oversold stock when summing availability', () => {
    const [group] = groupByProduct([variant({ productId: 'x', onHand: -2 })]);
    expect(group?.onHand).toBe(0);
  });

  it('ranges over the number a purchase order shows (cost), not the list price', () => {
    const costed = [
      variant({ id: 'a', productId: 'p', referenceCostCents: 1500, listPriceCents: 3000 }),
      variant({ id: 'b', productId: 'p', referenceCostCents: 1600, listPriceCents: 3400 }),
    ];
    const [group] = groupByProduct(costed, (entry) => entry.referenceCostCents);
    expect(group?.minPriceCents).toBe(1500);
    expect(group?.maxPriceCents).toBe(1600);
  });
});

describe('search and filters', () => {
  const groups = groupByProduct([...iem, ...cable]);

  it('matches name, brand, model, SKU and option values, every word required', () => {
    const iemGroup = groups[0];
    if (!iemGroup) throw new Error('fixture');
    expect(matchesQuery(iemGroup, 'kz')).toBe(true);
    expect(matchesQuery(iemGroup, 'KZT-1')).toBe(true);
    expect(matchesQuery(iemGroup, 'blk')).toBe(true);
    expect(matchesQuery(iemGroup, 'silver kz')).toBe(true);
    expect(matchesQuery(iemGroup, 'silver essager')).toBe(false);
    expect(matchesQuery(iemGroup, '   ')).toBe(true);
  });

  it('filters by category and stock together', () => {
    expect(
      filterProducts(groups, { query: '', category: 'Accessories', stock: 'all' }).map(
        (entry) => entry.productId,
      ),
    ).toEqual(['cable']);
    expect(
      filterProducts(groups, { query: 'silver', category: null, stock: 'in-stock' }).map(
        (entry) => entry.productId,
      ),
    ).toEqual(['iem']);
    expect(filterProducts(groups, { query: '', category: null, stock: 'out' })).toHaveLength(0);
  });
});

describe('labels', () => {
  it('names the option from the variant name, else its attributes', () => {
    expect(optionLabel({ variantName: 'Black', attributes: {} })).toBe('Black');
    expect(
      optionLabel({ variantName: 'Standaard', attributes: { colour: 'Red', size: 'L' } }),
    ).toBe('Red · L');
    expect(optionLabel({ variantName: 'Standaard', attributes: {} })).toBeNull();
  });

  it('describes stock without hiding an oversell', () => {
    expect(stockLabel(10).tone).toBe('ok');
    expect(stockLabel(2).tone).toBe('low');
    expect(stockLabel(0).text).toBe('Out of stock');
    expect(stockLabel(-1)).toEqual({ text: '-1 (oversold)', tone: 'over' });
  });
});
