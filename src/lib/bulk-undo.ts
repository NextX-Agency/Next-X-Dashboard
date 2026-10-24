/**
 * Undo for catalog changes.
 *
 * A bulk action returns exactly what it changed (the value before and the value after, per item).
 * The browser keeps that for about 30 seconds behind an "Undo" button on the toast. Pressing it
 * sends the inverse back to the server, which restores an item ONLY if it still holds the value the
 * action wrote ("expect"). If somebody changed it in the meantime it is left alone and reported, so
 * an undo can never overwrite newer work. Pure functions, unit tested.
 */

export const UNDO_WINDOW_MS = 30_000;

export type ProductFields = {
  status?: 'draft' | 'active' | 'archived';
  catalogPublished?: boolean;
  categoryId?: string | null;
};

export type ProductChange = {
  id: string;
  name: string;
  before: ProductFields;
  after: ProductFields;
};

export type PriceTarget = { kind: 'list' } | { kind: 'priceList'; priceListId: string };

export type PriceRecord = {
  variantId: string;
  label: string;
  target: PriceTarget;
  fromCents: number;
  toCents: number;
};

export type RestoreProductItem = {
  id: string;
  restore: ProductFields;
  expect: ProductFields;
};

export type RestorePriceItem = {
  variantId: string;
  target: PriceTarget;
  restoreCents: number;
  expectCents: number;
};

export type UndoPlan = {
  products: RestoreProductItem[];
  prices: RestorePriceItem[];
};

/** The inverse of a set of product changes. Fields a change did not touch are not restored. */
export function inverseProductChanges(changes: readonly ProductChange[]): RestoreProductItem[] {
  return changes.map((change) => ({
    id: change.id,
    restore: { ...change.before },
    expect: { ...change.after },
  }));
}

/** The inverse of a set of price changes. */
export function inversePriceChanges(changes: readonly PriceRecord[]): RestorePriceItem[] {
  return changes.map((change) => ({
    variantId: change.variantId,
    target: change.target,
    restoreCents: change.fromCents,
    expectCents: change.toCents,
  }));
}

export function buildUndoPlan(input: {
  products?: readonly ProductChange[];
  prices?: readonly PriceRecord[];
}): UndoPlan | null {
  const products = inverseProductChanges(input.products ?? []);
  const prices = inversePriceChanges(input.prices ?? []);
  return products.length + prices.length === 0 ? null : { products, prices };
}

/** True when every field named in `expect` still has that value on `current`. */
export function matchesExpectation(current: ProductFields, expect: ProductFields): boolean {
  return (
    (expect.status === undefined || current.status === expect.status) &&
    (expect.catalogPublished === undefined ||
      current.catalogPublished === expect.catalogPublished) &&
    (expect.categoryId === undefined || current.categoryId === expect.categoryId)
  );
}

/** Seconds left to undo, never negative. */
export function undoSecondsLeft(createdAt: number, now: number): number {
  return Math.max(0, Math.ceil((createdAt + UNDO_WINDOW_MS - now) / 1000));
}

export type ItemResult = {
  id: string;
  name: string;
  outcome: 'changed' | 'unchanged' | 'skipped';
  /** Said in words when the item was skipped or already in the wanted state. */
  message?: string;
};

export function summariseResults(results: readonly ItemResult[]): {
  changed: number;
  unchanged: number;
  skipped: number;
} {
  const summary = { changed: 0, unchanged: 0, skipped: 0 };
  for (const result of results) summary[result.outcome] += 1;
  return summary;
}

/** "12 updated, 2 skipped" for a toast or a live region. */
export function describeResults(results: readonly ItemResult[], verb = 'updated'): string {
  const { changed, unchanged, skipped } = summariseResults(results);
  const parts = [`${changed} ${verb}`];
  if (unchanged > 0) parts.push(`${unchanged} already that way`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.join(', ');
}
