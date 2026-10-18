import { z } from 'zod';

/**
 * Parsing a list page's `searchParams` into typed, defaulted query state.
 *
 * Every field uses `.catch()` rather than `.parse()`: a hand-edited or
 * stale URL should degrade to the default view, never a 500. Next hands
 * `searchParams` in as `Record<string, string | string[] | undefined>` —
 * `single()` below collapses the rare repeated-key case to its first value
 * rather than erroring.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const page = z.coerce.number().int().min(1).catch(1);
const perPage = z.coerce.number().int().min(1).max(200).catch(50);
const search = z
  .string()
  .trim()
  .max(200)
  .catch('')
  .transform((value) => (value === '' ? undefined : value));
const dir = z.enum(['asc', 'desc']).catch('desc');
/** A calendar day, `YYYY-MM-DD`. Anything else is ignored rather than raising a 500. */
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .catch(undefined);
/** A non-negative decimal amount typed by a person, in whole currency units. */
const amount = z.coerce.number().min(0).max(1_000_000_000).optional().catch(undefined);

/** One shared shape, since every list needs at least these three. */
const base = { q: search, page, perPage };

export const saleQuerySchema = z.object({
  ...base,
  status: z.enum(['draft', 'confirmed', 'void']).optional().catch(undefined),
  from: day,
  to: day,
  seller: z.string().uuid().optional().catch(undefined),
  currency: z.enum(['USD', 'SRD']).optional().catch(undefined),
  payment: z.enum(['paid', 'partly', 'unpaid', 'overdue']).optional().catch(undefined),
  sort: z.enum(['date', 'customer', 'revenue', 'margin']).catch('date'),
  dir,
});
export type SaleQuery = z.infer<typeof saleQuerySchema>;

export const orderQuerySchema = z.object({
  ...base,
  status: z
    .enum(['draft', 'confirmed', 'ready', 'completed', 'cancelled'])
    .optional()
    .catch(undefined),
  source: z.enum(['manual', 'pos', 'web', 'whatsapp', 'messenger']).optional().catch(undefined),
  sort: z.enum(['date', 'customer', 'total']).catch('date'),
  dir,
});
export type OrderQuery = z.infer<typeof orderQuerySchema>;

export const purchaseOrderQuerySchema = z.object({
  ...base,
  status: z
    .enum(['draft', 'ordered', 'shipped', 'received', 'cancelled'])
    .optional()
    .catch(undefined),
  sort: z.enum(['ordered', 'supplier', 'total']).catch('ordered'),
  dir,
});
export type PurchaseOrderQuery = z.infer<typeof purchaseOrderQuerySchema>;

export const productQuerySchema = z.object({
  ...base,
  status: z.enum(['draft', 'active', 'archived']).optional().catch(undefined),
  catalog: z.enum(['published', 'unpublished', 'missing']).optional().catch(undefined),
  stock: z.enum(['out-of-stock', 'low-stock']).optional().catch(undefined),
  featured: z.enum(['yes', 'no']).optional().catch(undefined),
  images: z.enum(['missing', 'has']).optional().catch(undefined),
  options: z.enum(['multiple', 'single']).optional().catch(undefined),
  /** List-price range in US$ (the price the product list shows). */
  minPrice: amount,
  maxPrice: amount,
  brand: z.string().uuid().optional().catch(undefined),
  category: z.string().uuid().optional().catch(undefined),
  sort: z.enum(['name', 'onHand', 'stockValue', 'updated']).catch('name'),
  dir,
});
export type ProductQuery = z.infer<typeof productQuerySchema>;

export const stockQuerySchema = z.object({
  ...base,
  category: z.string().uuid().optional().catch(undefined),
  location: z.string().uuid().optional().catch(undefined),
  /** in: more than zero on hand, low: at or under the alert level, out: none left, over: oversold. */
  state: z.enum(['in', 'low', 'out', 'over']).optional().catch(undefined),
  sort: z.enum(['name', 'onHand', 'value']).catch('name'),
  dir,
});
export type StockQuery = z.infer<typeof stockQuerySchema>;

export const customerQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'orders', 'spent']).catch('spent'),
  dir,
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export const ledgerQuerySchema = z.object({
  ...base,
  category: z
    .enum([
      'owner_contribution',
      'owner_draw',
      'sales_receipt',
      'purchase',
      'shipping',
      'operating',
      'refund',
      'other',
    ])
    .optional()
    .catch(undefined),
  sort: z.enum(['date']).catch('date'),
  dir,
});
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

export const expenseQuerySchema = z.object({
  ...base,
  sort: z.enum(['date', 'amount']).catch('date'),
  dir,
});
export type ExpenseQuery = z.infer<typeof expenseQuerySchema>;

/** Quote requests (F-5) have no sortable columns yet — newest first always. */
export const quoteQuerySchema = z.object({
  ...base,
  status: z.enum(['new', 'contacted', 'converted', 'declined']).optional().catch(undefined),
});
export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

export const categoryQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'products']).catch('name'),
  dir: dir.catch('asc'),
});
export type CategoryQuery = z.infer<typeof categoryQuerySchema>;

export const supplierQuerySchema = z.object({
  ...base,
  sort: z.enum(['name', 'products', 'orders', 'spend']).catch('name'),
  dir: dir.catch('asc'),
});
export type SupplierQuery = z.infer<typeof supplierQuerySchema>;

/** Parse a schema against raw searchParams, single-valuing every key first. */
export function parseListParams<T>(
  schema: { parse: (data: unknown) => T },
  raw: RawSearchParams,
): T {
  const normalised: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) normalised[key] = single(value);
  return schema.parse(normalised);
}
