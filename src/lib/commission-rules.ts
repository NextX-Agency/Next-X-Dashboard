import { mulDivRound } from './money';

export type CommissionLine = {
  id: string;
  categoryId: string | null;
  basisCents: number;
  /** A bundle is paid as one group even when its components use other categories. */
  bundle: boolean;
};

export type CommissionDraft = {
  groupKey: string;
  categoryId: string | null;
  basisCents: number;
  rateBps: number;
  amountCents: number;
};

/** Allocate a document discount to lines deterministically, preserving cents. */
export function allocateCommissionDiscount(
  lines: CommissionLine[],
  discountCents: number,
): number[] {
  const gross = lines.reduce((sum, line) => sum + line.basisCents, 0);
  if (!Number.isSafeInteger(gross) || gross < 0)
    throw new Error('Sale lines have invalid totals.');
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > gross) {
    throw new Error('Sale discount is outside the sale total.');
  }
  if (gross === 0 || discountCents === 0) return lines.map(() => 0);

  const total = BigInt(discountCents);
  const denominator = BigInt(gross);
  const shares = lines.map((line) => {
    const product = total * BigInt(line.basisCents);
    return {
      cents: Number(product / denominator),
      remainder: product % denominator,
      capacity: line.basisCents,
    };
  });
  let remaining = discountCents - shares.reduce((sum, share) => sum + share.cents, 0);
  const priority = shares
    .map((share, index) => ({ index, remainder: share.remainder }))
    .sort((left, right) =>
      left.remainder === right.remainder
        ? left.index - right.index
        : left.remainder > right.remainder
          ? -1
          : 1,
    );
  for (const { index } of priority) {
    if (remaining === 0) break;
    const share = shares[index];
    if (share && share.cents < share.capacity) {
      share.cents += 1;
      remaining -= 1;
    }
  }
  if (remaining !== 0) throw new Error('Sale discount could not be allocated to its lines.');
  return shares.map((share) => share.cents);
}

/** Commission groups after the document discount, before any rate applies. */
export function groupCommissionBases(
  lines: CommissionLine[],
  discountCents: number,
): Map<string, { categoryId: string | null; basisCents: number }> {
  const discountShares = allocateCommissionDiscount(lines, discountCents);
  const groups = new Map<string, { categoryId: string | null; basisCents: number }>();
  lines.forEach((line, index) => {
    if (!Number.isSafeInteger(line.basisCents) || line.basisCents < 0) {
      throw new Error('Sale lines have invalid totals.');
    }
    const basisCents = line.basisCents - (discountShares[index] ?? 0);
    const groupKey = line.bundle
      ? `bundle:${line.id}`
      : `category:${line.categoryId ?? 'none'}`;
    const group = groups.get(groupKey) ?? {
      categoryId: line.categoryId,
      basisCents: 0,
    };
    group.basisCents += basisCents;
    groups.set(groupKey, group);
  });
  return groups;
}

/**
 * Legacy-compatible precedence: category override, then seller default, then
 * location fallback. Rate values are basis points (2.50% = 250).
 */
export function buildCommissionDrafts(input: {
  lines: CommissionLine[];
  discountCents: number;
  categoryRates: Map<string, number>;
  sellerRateBps: number;
  locationRateBps: number;
}): CommissionDraft[] {
  const { lines, discountCents, categoryRates, sellerRateBps, locationRateBps } = input;
  for (const rate of [sellerRateBps, locationRateBps, ...categoryRates.values()]) {
    if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) {
      throw new Error('Commission rates must be between 0% and 100%.');
    }
  }

  const drafts: CommissionDraft[] = [];
  for (const [groupKey, group] of groupCommissionBases(lines, discountCents)) {
    const categoryRate = group.categoryId ? categoryRates.get(group.categoryId) : undefined;
    const rateBps =
      categoryRate !== undefined
        ? categoryRate
        : sellerRateBps > 0
          ? sellerRateBps
          : locationRateBps;
    const amountCents = mulDivRound(group.basisCents, rateBps, 10_000);
    if (amountCents > 0) drafts.push({ groupKey, ...group, rateBps, amountCents });
  }
  return drafts;
}

export type ReturnableCommissionLine = {
  id: string;
  categoryId: string | null;
  unitPriceCents: number;
  quantity: number;
  quantityReturned: number;
  bundle: boolean;
};

/**
 * What an already-frozen commission group is worth once returns are netted out.
 *
 * The rate on a commission row never changes (old rates must not rewrite it),
 * so only the BASIS is recomputed: each line keeps the units not returned, and
 * the document discount shrinks in proportion to the goods that stayed. The
 * result is keyed by group, and a group whose goods all came back is 0.
 */
export function netCommissionBases(input: {
  lines: ReturnableCommissionLine[];
  discountCents: number;
}): Map<string, { categoryId: string | null; basisCents: number }> {
  const gross = input.lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
  const net = input.lines.reduce(
    (sum, line) => sum + line.unitPriceCents * (line.quantity - line.quantityReturned),
    0,
  );
  const discountCents = gross === 0 ? 0 : mulDivRound(input.discountCents, net, gross);
  return groupCommissionBases(
    input.lines.map((line) => ({
      id: line.id,
      categoryId: line.categoryId,
      basisCents: line.unitPriceCents * (line.quantity - line.quantityReturned),
      bundle: line.bundle,
    })),
    Math.min(discountCents, net),
  );
}

/**
 * What the customer actually paid for each line once the document discount is
 * spread over the lines (the same allocation commissions use, so a return's
 * credit and the commission it reduces always agree). Keyed by line id; a line's
 * value is its extended price minus its share of the discount.
 */
export function netLineTotals(
  lines: { id: string; unitPriceCents: number; quantity: number }[],
  discountCents: number,
): Map<string, number> {
  const commissionLines: CommissionLine[] = lines.map((line) => ({
    id: line.id,
    categoryId: null,
    basisCents: line.unitPriceCents * line.quantity,
    bundle: false,
  }));
  const shares = allocateCommissionDiscount(commissionLines, discountCents);
  return new Map(
    commissionLines.map((line, index) => [line.id, line.basisCents - (shares[index] ?? 0)]),
  );
}

export type NettableCommission = {
  id: string;
  groupKey: string;
  rateBps: number;
  amountCents: number;
  status: string;
};

export type NettingDecision =
  | { kind: 'unchanged'; id: string }
  /** The stored group no longer exists among the sale's current groups (a
   *  product changed category since the sale was confirmed). Never zeroed: the
   *  row is left alone and the owner is told to review it. */
  | { kind: 'unmatched'; id: string; groupKey: string }
  | { kind: 'overpaid'; id: string; overpaidCents: number }
  | {
      kind: 'reduce';
      id: string;
      basisCents: number;
      amountCents: number;
      reducedCents: number;
      cancel: boolean;
    };

/**
 * Decide, row by row, what returns do to a sale's frozen commissions.
 *
 * Groups are recomputed from the products' CURRENT categories, so a category
 * edited after the sale can make a stored group key vanish. Treating a missing
 * group as "all goods returned" would cancel an unrelated commission, so a
 * missing key is reported as `unmatched` and left untouched.
 */
export function planCommissionNetting(
  rows: NettableCommission[],
  bases: Map<string, { basisCents: number }>,
): NettingDecision[] {
  const decisions: NettingDecision[] = [];
  for (const row of rows) {
    if (row.status === 'cancelled') continue;
    const group = bases.get(row.groupKey);
    if (!group) {
      decisions.push({ kind: 'unmatched', id: row.id, groupKey: row.groupKey });
      continue;
    }
    const amountCents = mulDivRound(group.basisCents, row.rateBps, 10_000);
    if (amountCents >= row.amountCents) {
      decisions.push({ kind: 'unchanged', id: row.id });
      continue;
    }
    if (row.status === 'paid') {
      decisions.push({
        kind: 'overpaid',
        id: row.id,
        overpaidCents: row.amountCents - amountCents,
      });
      continue;
    }
    decisions.push({
      kind: 'reduce',
      id: row.id,
      basisCents: group.basisCents,
      amountCents,
      reducedCents: row.amountCents - amountCents,
      // The table forbids a zero amount, so a group whose goods all came back
      // is cancelled with its original figures kept as the record of what it was.
      cancel: amountCents === 0,
    });
  }
  return decisions;
}
