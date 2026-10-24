/**
 * Turning a validation failure into a sentence a cashier can act on.
 *
 * The sale form validates with the very same schema the server uses, before
 * sending anything. Without this, a bad quantity produced a toast saying
 * "Check the highlighted fields" while nothing on the page was highlighted.
 */

export type FormIssue = { path: readonly PropertyKey[]; message: string };

const FIELD_LABELS: Record<string, string> = {
  quantity: 'Quantity',
  unitPriceCents: 'Unit price',
  variantId: 'Product',
  serials: 'Serial numbers',
  discountCents: 'Discount',
  paidNowCents: 'Deposit',
  soldAt: 'Date',
  walletId: 'Wallet',
  customerId: 'Customer',
  sellerId: 'Seller',
  items: 'Items',
};

/** `Line 2 · Unit price: Must be more than zero` */
export function describeIssue(issue: FormIssue): string {
  const [first, second, third] = issue.path;
  if (first === 'items' && typeof second === 'number') {
    const field = typeof third === 'string' ? (FIELD_LABELS[third] ?? third) : null;
    return `Line ${second + 1}${field ? ` · ${field}` : ''}: ${issue.message}`;
  }
  const label = typeof first === 'string' ? FIELD_LABELS[first] : undefined;
  return label ? `${label}: ${issue.message}` : issue.message;
}

/** De-duplicated, in the order the form shows them. */
export function describeIssues(issues: readonly FormIssue[], limit = 6): string[] {
  const seen = new Set<string>();
  for (const issue of issues) seen.add(describeIssue(issue));
  return [...seen].slice(0, limit);
}
