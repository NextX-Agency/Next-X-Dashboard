/**
 * The built-in quick views of the product and inventory lists. Each is a name plus the address
 * parameters the list already understands, so choosing one is just a link and the count on its chip
 * is computed with the very same conditions as the list (see `queries/catalog-ops.ts`).
 */

export type BuiltInView = {
  key: string;
  label: string;
  /** What the view shows, for the tooltip and the accessible name. */
  hint: string;
  params: Record<string, string>;
};

export const PRODUCT_VIEWS: BuiltInView[] = [
  {
    key: 'low',
    label: 'Low stock',
    hint: 'Products with a few units left (at or under the alert level)',
    params: { stock: 'low-stock' },
  },
  {
    key: 'out',
    label: 'Out of stock',
    hint: 'Products with nothing left to sell',
    params: { stock: 'out-of-stock' },
  },
  {
    key: 'unpublished',
    label: 'Not published',
    hint: 'Active products that are not on the shop yet',
    params: { status: 'active', catalog: 'unpublished' },
  },
  {
    key: 'nophoto',
    label: 'No photo',
    hint: 'Products without any photograph',
    params: { images: 'missing' },
  },
  {
    key: 'nocost',
    label: 'No cost',
    hint: 'Products with a variant whose cost is unknown',
    params: { cost: 'missing' },
  },
];

export const STOCK_VIEWS: BuiltInView[] = [
  {
    key: 'low',
    label: 'Low stock',
    hint: 'Variants at or under the alert level',
    params: { state: 'low' },
  },
  {
    key: 'out',
    label: 'Out of stock',
    hint: 'Variants with none left',
    params: { state: 'out' },
  },
  {
    key: 'over',
    label: 'Below zero',
    hint: 'Variants sold beyond what was received',
    params: { state: 'over' },
  },
];
