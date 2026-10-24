import { fromBase, type RateMicros, toBase } from '@/lib/fx';
import {
  type Cents,
  type CurrencyCode,
  mulDivRound,
  parseMoney,
  toDecimalString,
} from '@/lib/money';
import { MAX_LINE_QUANTITY } from '@/lib/schemas';
import { estimateCostUsd } from './margin';
import type { Sellable } from './types';

/**
 * The counter's cart: plain data and pure functions.
 *
 * Nothing here knows about React, storage or the server. The screen keeps one `Cart`, every change is
 * a function from cart to cart, and the same functions are what the unit tests exercise. Money is
 * integer cents in the cart's own currency, converted from the USD list price with the exchange rate
 * in force (`@/lib/fx`), exactly as the full sale form does. The server recomputes and books it; this
 * is what the cashier sees before paying.
 */

export type DiscountMode = 'amount' | 'percent';
export type DiscountInput = { mode: DiscountMode; value: string };

export type CartLine = {
  /** Identity of this line inside the cart (stable while quantities and prices change). */
  key: string;
  /** `v:<variantId>` or `b:<bundleId>` (see `Sellable.key`). */
  sellableKey: string;
  quantity: number;
  /** A price the cashier typed, in the cart's currency. Null means "the list price, right now". */
  overrideCents: Cents | null;
  note: string;
};

export type Cart = {
  currency: CurrencyCode;
  lines: CartLine[];
  discount: DiscountInput | null;
  discountReason: string;
  customerId: string | null;
  sellerId: string | null;
  walletId: string | null;
  note: string;
  /** Rotated after every definite outcome, kept across an unknown one (see `pos-app.tsx`). */
  idempotencyKey: string;
};

export type IdFactory = () => string;
/** A v4 UUID. The browser's randomUUID exists only in secure contexts (HTTPS or localhost), so a
 *  counter tablet opened over plain http on the shop network still gets a valid idempotency key. */
export const newUuid: IdFactory = () => {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (crypto?.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  const part = (from: number, to: number) => hex.slice(from, to).join('');
  return `${part(0, 4)}-${part(4, 6)}-${part(6, 8)}-${part(8, 10)}-${part(10, 16)}`;
};
const defaultId = newUuid;

export function emptyCart(currency: CurrencyCode, newId: IdFactory = defaultId): Cart {
  return {
    currency,
    lines: [],
    discount: null,
    discountReason: '',
    customerId: null,
    sellerId: null,
    walletId: null,
    note: '',
    idempotencyKey: newId(),
  };
}

export function isCartEmpty(cart: Cart): boolean {
  return cart.lines.length === 0;
}

/* ── Prices ──────────────────────────────────────────────────────────────── */

/** One whole unit of the currency, in cents. */
const WHOLE = 100;

/**
 * Round to a whole unit. SRD is quoted in whole dollars at the counter: nobody hands over SRD 1,847.25,
 * and a converted list price would otherwise carry cents. USD keeps its cents.
 */
export function roundForCurrency(cents: Cents, currency: CurrencyCode): Cents {
  return currency === 'SRD' ? Math.round(cents / WHOLE) * WHOLE : cents;
}

/** The USD list price shown in the cart's currency. SRD is converted and rounded to a whole dollar. */
export function listPriceIn(
  listPriceUsdCents: Cents,
  currency: CurrencyCode,
  rateMicros: RateMicros,
): Cents {
  if (currency === 'USD') return listPriceUsdCents;
  if (listPriceUsdCents <= 0) return 0;
  // Never round a real price down to nothing.
  return Math.max(WHOLE, roundForCurrency(fromBase(listPriceUsdCents, rateMicros), 'SRD'));
}

export function unitPriceOf(
  line: Pick<CartLine, 'overrideCents'>,
  sellable: Pick<Sellable, 'listPriceCents'>,
  currency: CurrencyCode,
  rateMicros: RateMicros,
): Cents {
  return line.overrideCents ?? listPriceIn(sellable.listPriceCents, currency, rateMicros);
}

/** Carry an amount from one currency to the other at the rate in force. */
export function convertAmount(
  cents: Cents,
  from: CurrencyCode,
  to: CurrencyCode,
  rateMicros: RateMicros,
): Cents {
  if (from === to) return cents;
  return to === 'SRD'
    ? roundForCurrency(fromBase(cents, rateMicros), 'SRD')
    : toBase(cents, rateMicros);
}

/* ── Changing the cart ───────────────────────────────────────────────────── */

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

/** Add units of something. The same item again raises its line instead of repeating it. */
export function addToCart(
  cart: Cart,
  sellable: Pick<Sellable, 'key'>,
  quantity = 1,
  newId: IdFactory = defaultId,
): { cart: Cart; lineKey: string } {
  const existing = cart.lines.find((line) => line.sellableKey === sellable.key);
  if (existing) {
    return {
      lineKey: existing.key,
      cart: {
        ...cart,
        lines: cart.lines.map((line) =>
          line.key === existing.key
            ? { ...line, quantity: clampQuantity(line.quantity + quantity) }
            : line,
        ),
      },
    };
  }
  const line: CartLine = {
    key: newId(),
    sellableKey: sellable.key,
    quantity: clampQuantity(quantity),
    overrideCents: null,
    note: '',
  };
  return { cart: { ...cart, lines: [...cart.lines, line] }, lineKey: line.key };
}

function mapLine(cart: Cart, lineKey: string, change: (line: CartLine) => CartLine): Cart {
  return {
    ...cart,
    lines: cart.lines.map((line) => (line.key === lineKey ? change(line) : line)),
  };
}

export const setQuantity = (cart: Cart, lineKey: string, quantity: number): Cart =>
  mapLine(cart, lineKey, (line) => ({ ...line, quantity: clampQuantity(quantity) }));

export const setOverride = (cart: Cart, lineKey: string, overrideCents: Cents | null): Cart =>
  mapLine(cart, lineKey, (line) => ({ ...line, overrideCents }));

export const setLineNote = (cart: Cart, lineKey: string, note: string): Cart =>
  mapLine(cart, lineKey, (line) => ({ ...line, note: note.slice(0, 200) }));

export function removeLine(
  cart: Cart,
  lineKey: string,
): {
  cart: Cart;
  removed: CartLine | null;
  index: number;
} {
  const index = cart.lines.findIndex((line) => line.key === lineKey);
  if (index < 0) return { cart, removed: null, index: -1 };
  return {
    cart: { ...cart, lines: cart.lines.filter((line) => line.key !== lineKey) },
    removed: cart.lines[index] ?? null,
    index,
  };
}

/** Put a removed line back where it was ("Undo" on the removal toast). */
export function restoreLine(cart: Cart, line: CartLine, index: number): Cart {
  if (cart.lines.some((candidate) => candidate.key === line.key)) return cart;
  const lines = [...cart.lines];
  lines.splice(Math.min(Math.max(index, 0), lines.length), 0, line);
  return { ...cart, lines };
}

/**
 * Change the currency. Typed prices and an amount discount are carried over at the rate, a percent
 * discount is unchanged, and the wallet is cleared (a wallet holds exactly one currency).
 */
export function setCurrency(cart: Cart, currency: CurrencyCode, rateMicros: RateMicros): Cart {
  if (currency === cart.currency) return cart;
  const discount =
    cart.discount?.mode === 'amount'
      ? {
          mode: 'amount' as const,
          value: toDecimalString(
            convertAmount(safeMoney(cart.discount.value), cart.currency, currency, rateMicros),
          ),
        }
      : cart.discount;
  return {
    ...cart,
    currency,
    walletId: null,
    discount,
    lines: cart.lines.map((line) => ({
      ...line,
      overrideCents:
        line.overrideCents === null
          ? null
          : convertAmount(line.overrideCents, cart.currency, currency, rateMicros),
    })),
  };
}

/* ── Discount ────────────────────────────────────────────────────────────── */

function safeMoney(value: string): Cents {
  try {
    return Math.max(0, parseMoney(value.trim() === '' ? '0' : value));
  } catch {
    return 0;
  }
}

/**
 * The order discount in cents of the cart's currency.
 *
 * An amount is taken as typed. A percent is of the gross total, and in SRD the result is rounded to a
 * whole dollar so the total stays a clean number. Never more than the gross total (the server refuses
 * that), never negative, and an unreadable value is no discount at all.
 */
export function discountCents(
  grossCents: Cents,
  discount: DiscountInput | null,
  currency: CurrencyCode,
): Cents {
  if (!discount || grossCents <= 0) return 0;
  const typed = safeMoney(discount.value);
  if (typed <= 0) return 0;
  const raw =
    discount.mode === 'amount'
      ? typed
      : // `typed` has two decimals, so 12.5% arrives as 1250 hundredths of a percent.
        roundForCurrency(mulDivRound(grossCents, Math.min(typed, 10_000), 10_000), currency);
  return Math.min(raw, grossCents);
}

/* ── Totals ──────────────────────────────────────────────────────────────── */

export type PricedLine = {
  line: CartLine;
  sellable: Sellable;
  unitCents: Cents;
  lineCents: Cents;
  /** Estimated cost of goods for the line, USD cents (for the margin warning). */
  costUsdCents: Cents;
};

export type CartTotals = {
  lines: PricedLine[];
  /** Lines whose item is no longer in the catalogue. They are left out of the totals. */
  missing: CartLine[];
  units: number;
  grossCents: Cents;
  discountCents: Cents;
  totalCents: Cents;
  costUsdCents: Cents;
};

export function computeTotals(
  cart: Cart,
  lookup: (sellableKey: string) => Sellable | undefined,
  rateMicros: RateMicros,
): CartTotals {
  const priced: PricedLine[] = [];
  const missing: CartLine[] = [];
  let units = 0;
  let grossCents = 0;
  let costUsdCents = 0;
  for (const line of cart.lines) {
    const sellable = lookup(line.sellableKey);
    if (!sellable) {
      missing.push(line);
      continue;
    }
    const unitCents = unitPriceOf(line, sellable, cart.currency, rateMicros);
    const lineCents = unitCents * line.quantity;
    const lineCost = estimateCostUsd(sellable, line.quantity);
    priced.push({ line, sellable, unitCents, lineCents, costUsdCents: lineCost });
    units += line.quantity;
    grossCents += lineCents;
    costUsdCents += lineCost;
  }
  const discount = discountCents(grossCents, cart.discount, cart.currency);
  return {
    lines: priced,
    missing,
    units,
    grossCents,
    discountCents: discount,
    totalCents: grossCents - discount,
    costUsdCents,
  };
}

/** Drop lines whose item has left the catalogue (restoring a cart saved days ago). */
export function reconcileCart(
  cart: Cart,
  lookup: (sellableKey: string) => Sellable | undefined,
): { cart: Cart; dropped: number } {
  const lines = cart.lines.filter((line) => lookup(line.sellableKey));
  return { cart: { ...cart, lines }, dropped: cart.lines.length - lines.length };
}

/**
 * Same content, same fingerprint: item, quantity, price, currency, customer and discount. It tells
 * "the cart I already tried to charge" from "a different cart" when an earlier attempt never
 * reported back.
 */
export function cartFingerprint(cart: Cart, totals: CartTotals): string {
  return [
    cart.currency,
    cart.customerId ?? '',
    totals.discountCents,
    ...totals.lines.map(
      (row) => `${row.line.sellableKey}:${row.line.quantity}:${row.unitCents}`,
    ),
  ].join('|');
}

/** Text for the sale's notes: per-line notes under the product they belong to, then the order note. */
export function saleNotes(cart: Cart, totals: CartTotals): string | undefined {
  const parts: string[] = [];
  for (const row of totals.lines) {
    const note = row.line.note.trim();
    if (note) parts.push(`${row.sellable.name}: ${note}`);
  }
  const order = cart.note.trim();
  if (order) parts.push(order);
  const joined = parts.join('\n').slice(0, 1800);
  return joined || undefined;
}

/** A line the sale schema would refuse, said in words. Null when the cart can go to the server. */
export function cartBlocker(totals: CartTotals): string | null {
  if (totals.lines.length === 0) return 'Add something to the cart first.';
  if (totals.missing.length > 0)
    return 'An item in the cart is no longer sold. Remove it first.';
  const free = totals.lines.find((row) => row.unitCents <= 0);
  if (free) return `Set a price for ${free.sellable.name}.`;
  if (totals.totalCents <= 0) return 'The total is zero. Check the discount.';
  return null;
}

/**
 * Put the items of `extra` into `base`. Used when a saved cart is restored a moment after the page
 * becomes interactive: anything tapped in that gap is added to the saved cart, never lost.
 */
export function mergeCarts(base: Cart, extra: Cart, newId: IdFactory = defaultId): Cart {
  return extra.lines.reduce(
    (merged, line) => addToCart(merged, { key: line.sellableKey }, line.quantity, newId).cart,
    base,
  );
}
