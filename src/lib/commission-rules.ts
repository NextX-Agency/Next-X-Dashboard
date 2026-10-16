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
      categoryId: line.bundle ? line.categoryId : line.categoryId,
      basisCents: 0,
    };
    group.basisCents += basisCents;
    groups.set(groupKey, group);
  });

  const drafts: CommissionDraft[] = [];
  for (const [groupKey, group] of groups) {
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
