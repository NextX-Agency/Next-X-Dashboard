import { type Cents, mulDivRound } from './money';

/**
 * Catalog quality: the plain rules behind "Needs attention" and the saved views of the product
 * list. Kept pure and free of the database so the SQL in `queries/catalog-ops.ts` and these rules
 * can be read side by side, and so the rules are unit tested.
 *
 * Nothing here invents data. Every input is something the database already holds: photographs,
 * cost (landed average once stock was received, else the supplier list cost), category, price,
 * stock on hand and whether the product is published on the shop.
 */

/** The cost to measure margin against: what the units on hand really cost, else the list cost. */
export function unitCostCents(input: {
  onHand: number;
  valueCents: Cents;
  referenceCostCents: Cents;
}): number | null {
  if (input.onHand > 0 && input.valueCents > 0) return input.valueCents / input.onHand;
  if (input.referenceCostCents > 0) return input.referenceCostCents;
  return null;
}

/** Margin on price in basis points (2500 is 25%), or null when price or cost is unknown. */
export function marginBasisPoints(priceCents: Cents, costCents: number | null): number | null {
  if (priceCents <= 0 || costCents === null || costCents <= 0) return null;
  return mulDivRound(priceCents - Math.round(costCents), 10_000, priceCents);
}

export function formatMarginPercent(basisPoints: number | null, digits = 0): string {
  if (basisPoints === null) return '—';
  return `${(basisPoints / 100).toFixed(digits)}%`;
}

export type QualityIssueCode =
  | 'no_price'
  | 'negative_margin'
  | 'no_photo'
  | 'no_cost'
  | 'no_category'
  | 'published_out_of_stock'
  | 'unpublished_with_stock';

export type QualitySubject = {
  status: 'draft' | 'active' | 'archived';
  catalogPublished: boolean;
  imageCount: number;
  categoryId: string | null;
  activeVariantCount: number;
  /** Active variants whose price is zero. */
  variantsWithoutPrice: number;
  /** Active variants with no known cost (see `unitCostCents`). */
  variantsWithoutCost: number;
  /** Lowest margin among active variants that have both a price and a cost, in basis points. */
  lowestMarginBp: number | null;
  /** Units on hand across all active variants and locations. */
  onHand: number;
};

export type QualityIssue = {
  code: QualityIssueCode;
  severity: 'high' | 'medium' | 'low';
  title: string;
  /** One sentence saying what is wrong and what to do about it. */
  detail: string;
  /** Where to fix it, relative to `/items/{id}`. */
  fix: { label: string; hash: string };
};

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** The problems of one product. Archived products are history and have none. */
export function qualityIssues(product: QualitySubject): QualityIssue[] {
  if (product.status === 'archived') return [];
  const issues: QualityIssue[] = [];

  if (product.activeVariantCount > 0 && product.variantsWithoutPrice > 0) {
    issues.push({
      code: 'no_price',
      severity: 'high',
      title: 'No selling price',
      detail: `${product.variantsWithoutPrice} of ${product.activeVariantCount} variants have a price of zero, so they cannot be sold or published.`,
      fix: { label: 'Set the price', hash: '#variants' },
    });
  }
  if (product.lowestMarginBp !== null && product.lowestMarginBp < 0) {
    issues.push({
      code: 'negative_margin',
      severity: 'high',
      title: 'Selling below cost',
      detail:
        'At least one variant sells for less than it costs. Raise the price or check the cost.',
      fix: { label: 'Change the price', hash: '#variants' },
    });
  }
  if (product.imageCount === 0) {
    issues.push({
      code: 'no_photo',
      severity: product.catalogPublished ? 'high' : 'medium',
      title: 'No photo',
      detail: 'Customers and staff cannot see what this is. Add at least one photo.',
      fix: { label: 'Add a photo', hash: '#photos' },
    });
  }
  if (product.activeVariantCount > 0 && product.variantsWithoutCost > 0) {
    issues.push({
      code: 'no_cost',
      severity: 'medium',
      title: 'No cost',
      detail: `${product.variantsWithoutCost} of ${product.activeVariantCount} variants have no cost yet, so profit cannot be worked out. Receive stock on a purchase order or enter the list cost.`,
      fix: { label: 'Enter the cost', hash: '#variants' },
    });
  }
  if (!product.categoryId) {
    issues.push({
      code: 'no_category',
      severity: 'low',
      title: 'No category',
      detail: 'Without a category the product is hard to find in the shop and in reports.',
      fix: { label: 'Choose a category', hash: '#edit' },
    });
  }
  if (product.catalogPublished && product.onHand <= 0) {
    issues.push({
      code: 'published_out_of_stock',
      severity: 'medium',
      title: 'Published but out of stock',
      detail: 'Visitors see it as sold out. Restock it, or unpublish it until stock arrives.',
      fix: { label: 'Review stock', hash: '#stock' },
    });
  }
  if (product.status === 'active' && !product.catalogPublished && product.onHand > 0) {
    issues.push({
      code: 'unpublished_with_stock',
      severity: 'medium',
      title: 'In stock but not on the shop',
      detail: `${product.onHand} on hand and not published, so online customers cannot buy it.`,
      fix: { label: 'Publish it', hash: '#publish' },
    });
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export const ISSUE_LABELS: Record<QualityIssueCode, string> = {
  no_price: 'No price',
  negative_margin: 'Negative margin',
  no_photo: 'No photo',
  no_cost: 'No cost',
  no_category: 'No category',
  published_out_of_stock: 'Published, out of stock',
  unpublished_with_stock: 'In stock, not published',
};

/** How many products carry each problem, for the filter chips on the attention list. */
export function countByIssue(
  rows: readonly { issues: readonly { code: QualityIssueCode }[] }[],
): Record<QualityIssueCode, number> {
  const counts = Object.fromEntries(
    (Object.keys(ISSUE_LABELS) as QualityIssueCode[]).map((code) => [code, 0]),
  ) as Record<QualityIssueCode, number>;
  for (const row of rows) {
    for (const issue of row.issues) counts[issue.code] += 1;
  }
  return counts;
}
