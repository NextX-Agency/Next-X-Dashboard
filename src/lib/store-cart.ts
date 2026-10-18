import type { CurrencyCode } from '@/lib/money';

export type StoreCartLine = {
  productId: string;
  productSlug: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  quantity: number;
  priceCents: number;
  currency: CurrencyCode;
  available: number;
  /** The photograph of this exact option, so the cart shows what was chosen. Optional: older carts have none. */
  imageUrl?: string | null;
};

export type StoreCartLineInput = Omit<StoreCartLine, 'quantity'> & { quantity?: number };
export type StoreCartQuoteLine = Omit<StoreCartLine, 'quantity'>;

function boundedString(value: unknown, maxLength = 180): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/** The cache is untrusted input: only site-relative or https image addresses are kept. */
function isImageUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 600 &&
    ((value.startsWith('/') && !value.startsWith('//')) || value.startsWith('https://'))
  );
}

export function isStoreCartLine(value: unknown): value is StoreCartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Partial<StoreCartLine>;
  return (
    boundedString(line.productId, 80) &&
    boundedString(line.productSlug, 180) &&
    boundedString(line.productName) &&
    boundedString(line.variantId, 80) &&
    boundedString(line.variantName) &&
    typeof line.sku === 'string' &&
    line.sku.length <= 120 &&
    Number.isSafeInteger(line.quantity) &&
    Number(line.quantity) > 0 &&
    Number(line.quantity) <= 9999 &&
    Number.isSafeInteger(line.priceCents) &&
    Number(line.priceCents) >= 0 &&
    (line.currency === 'USD' || line.currency === 'SRD') &&
    Number.isSafeInteger(line.available) &&
    Number(line.available) >= 0 &&
    (line.imageUrl === undefined || line.imageUrl === null || isImageUrl(line.imageUrl))
  );
}

/** Parse the browser cache as untrusted input. Invalid and duplicate variants are dropped. */
export function parseStoreCart(raw: string | null): StoreCartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((item): item is StoreCartLine => {
        if (!isStoreCartLine(item) || seen.has(item.variantId)) return false;
        seen.add(item.variantId);
        return true;
      })
      .slice(0, 100);
  } catch {
    return [];
  }
}

export function addStoreCartLine(
  lines: StoreCartLine[],
  input: StoreCartLineInput,
): { lines: StoreCartLine[]; added: boolean } {
  const quantity = input.quantity ?? 1;
  if (
    !isStoreCartLine({ ...input, quantity }) ||
    quantity > input.available ||
    input.available <= 0
  ) {
    return { lines, added: false };
  }

  const index = lines.findIndex((line) => line.variantId === input.variantId);
  if (index < 0) return { lines: [...lines, { ...input, quantity }], added: true };

  const existing = lines[index];
  if (!existing) return { lines, added: false };
  const refreshed = { ...input, quantity: existing.quantity };
  const nextQuantity = existing.quantity + quantity;
  const next = [...lines];
  next[index] = refreshed;
  if (nextQuantity > input.available) return { lines: next, added: false };
  next[index] = { ...refreshed, quantity: nextQuantity };
  return { lines: next, added: true };
}

export function updateStoreCartQuantity(
  lines: StoreCartLine[],
  variantId: string,
  quantity: number,
): StoreCartLine[] {
  if (!Number.isSafeInteger(quantity)) return lines;
  if (quantity <= 0) return lines.filter((line) => line.variantId !== variantId);
  return lines.flatMap((line) => {
    if (line.variantId !== variantId) return [line];
    const nextQuantity = Math.min(quantity, 9999);
    return nextQuantity > 0 ? [{ ...line, quantity: nextQuantity }] : [];
  });
}

export function storeCartCount(lines: StoreCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function storeCartSubtotal(lines: StoreCartLine[], currency: CurrencyCode): number {
  const total = lines.reduce(
    (sum, line) =>
      sum + (line.currency === currency ? BigInt(line.priceCents) * BigInt(line.quantity) : 0n),
    0n,
  );
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Store cart subtotal exceeds the safe integer range.');
  }
  return Number(total);
}

/** Replace cached product facts with an authoritative storefront quote while
 * preserving the customer's requested quantities. Missing variants become
 * unavailable and must be removed before checkout can continue. */
export function applyStoreCartQuote(
  lines: StoreCartLine[],
  quoteItems: StoreCartQuoteLine[],
  unavailableVariantIds: string[] = [],
): { lines: StoreCartLine[]; unavailableVariantIds: string[] } {
  const quotesByVariantId = new Map(quoteItems.map((item) => [item.variantId, item]));
  const unavailable = new Set(unavailableVariantIds);
  const refreshedLines = lines.map((line) => {
    const quote = quotesByVariantId.get(line.variantId);
    if (!quote || unavailable.has(line.variantId)) {
      unavailable.add(line.variantId);
      return { ...line, available: 0 };
    }

    return {
      ...line,
      ...quote,
      quantity: line.quantity,
    };
  });

  return {
    lines: refreshedLines,
    unavailableVariantIds: lines
      .filter((line) => unavailable.has(line.variantId))
      .map((line) => line.variantId),
  };
}
