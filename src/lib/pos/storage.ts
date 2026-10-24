import { type Cart, type CartLine, emptyCart, type IdFactory, newUuid } from './cart';

/**
 * What the counter remembers on this device: the cart in progress, parked carts, recently sold items
 * and favourites. All of it lives in localStorage, never on the server, so a refresh or a dropped
 * connection loses nothing and another counter's tablet is unaffected.
 *
 * Storage can be missing (private window), full or blocked, so every call is wrapped and falls back
 * to "nothing remembered". The functions take the storage as an argument so the tests use a fake.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const POS_KEYS = {
  cart: 'nextx.pos.cart.v1',
  parked: 'nextx.pos.parked.v1',
  recent: 'nextx.pos.recent.v1',
  favourites: 'nextx.pos.favourites.v1',
  currency: 'nextx.pos.currency.v1',
} as const;

export const MAX_PARKED = 10;
export const MAX_RECENT = 12;
export const MAX_FAVOURITES = 24;

function read(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** localStorage when the browser allows it, else null. Call from an effect, never during render. */
export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null;

function parseLine(value: unknown): CartLine | null {
  if (!isRecord(value)) return null;
  const { key, sellableKey, quantity, overrideCents, note } = value;
  if (typeof key !== 'string' || typeof sellableKey !== 'string') return null;
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) return null;
  if (overrideCents !== null && !(typeof overrideCents === 'number' && overrideCents >= 0)) {
    return null;
  }
  return {
    key,
    sellableKey,
    quantity,
    overrideCents: overrideCents as number | null,
    note: typeof note === 'string' ? note : '',
  };
}

/** A stored cart, checked field by field: a hand-edited or old value yields null, never a crash. */
export function parseCart(value: unknown, newId?: IdFactory): Cart | null {
  if (!isRecord(value)) return null;
  const currency = value.currency === 'SRD' || value.currency === 'USD' ? value.currency : null;
  if (!currency || !Array.isArray(value.lines)) return null;
  const lines = value.lines.map(parseLine).filter((line): line is CartLine => line !== null);
  const base = emptyCart(currency, newId);
  const discount = isRecord(value.discount) ? value.discount : null;
  return {
    ...base,
    lines,
    discount:
      discount &&
      (discount.mode === 'amount' || discount.mode === 'percent') &&
      typeof discount.value === 'string'
        ? { mode: discount.mode, value: discount.value }
        : null,
    discountReason: typeof value.discountReason === 'string' ? value.discountReason : '',
    customerId: stringOrNull(value.customerId),
    sellerId: stringOrNull(value.sellerId),
    walletId: stringOrNull(value.walletId),
    note: typeof value.note === 'string' ? value.note : '',
    idempotencyKey: stringOrNull(value.idempotencyKey) ?? base.idempotencyKey,
  };
}

export const loadCart = (storage: StorageLike | null, newId?: IdFactory): Cart | null =>
  parseCart(read(storage, POS_KEYS.cart), newId);

export const saveCart = (storage: StorageLike | null, cart: Cart): boolean =>
  write(storage, POS_KEYS.cart, cart);

/* ── Parked carts ────────────────────────────────────────────────────────── */

export type ParkedCart = {
  id: string;
  label: string;
  /** Epoch milliseconds. */
  savedAt: number;
  /** What the list shows without needing the catalogue. */
  summary: { units: number; totalCents: number; currency: 'SRD' | 'USD' };
  cart: Cart;
};

export function loadParked(storage: StorageLike | null, newId?: IdFactory): ParkedCart[] {
  const raw = read(storage, POS_KEYS.parked);
  if (!Array.isArray(raw)) return [];
  const parked: ParkedCart[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    const cart = parseCart(item.cart, newId);
    if (!cart || cart.lines.length === 0) continue;
    const summary = isRecord(item.summary) ? item.summary : {};
    parked.push({
      id: item.id,
      label: typeof item.label === 'string' && item.label ? item.label : 'Parked cart',
      savedAt: typeof item.savedAt === 'number' ? item.savedAt : 0,
      summary: {
        units: typeof summary.units === 'number' ? summary.units : 0,
        totalCents: typeof summary.totalCents === 'number' ? summary.totalCents : 0,
        currency: cart.currency,
      },
      cart,
    });
  }
  return parked.slice(0, MAX_PARKED);
}

export const saveParked = (
  storage: StorageLike | null,
  parked: readonly ParkedCart[],
): boolean => write(storage, POS_KEYS.parked, parked);

export type ParkResult =
  | { ok: true; parked: ParkedCart[] }
  | { ok: false; reason: 'full' | 'empty' };

/** Set the current cart aside under a label. Newest first. At most `MAX_PARKED`. */
export function parkCart(
  parked: readonly ParkedCart[],
  cart: Cart,
  input: { label: string; now: number; units: number; totalCents: number },
  newId: IdFactory = newUuid,
): ParkResult {
  if (cart.lines.length === 0) return { ok: false, reason: 'empty' };
  if (parked.length >= MAX_PARKED) return { ok: false, reason: 'full' };
  const entry: ParkedCart = {
    id: newId(),
    label: input.label.trim().slice(0, 40) || 'Parked cart',
    savedAt: input.now,
    summary: { units: input.units, totalCents: input.totalCents, currency: cart.currency },
    cart,
  };
  return { ok: true, parked: [entry, ...parked] };
}

export type ResumeResult = { cart: Cart; parked: ParkedCart[] } | null;

/**
 * Bring a parked cart back. If something is in the cart now it takes the resumed cart's place in the
 * list (a swap), so nothing is lost and the list never grows past the limit.
 */
export function resumeParked(
  parked: readonly ParkedCart[],
  id: string,
  current: Cart,
  input: { now: number; units: number; totalCents: number; label: string },
  newId: IdFactory = newUuid,
): ResumeResult {
  const target = parked.find((entry) => entry.id === id);
  if (!target) return null;
  const rest = parked.filter((entry) => entry.id !== id);
  if (current.lines.length === 0) return { cart: target.cart, parked: rest };
  const swapped: ParkedCart = {
    id: newId(),
    label: input.label.trim().slice(0, 40) || 'Parked cart',
    savedAt: input.now,
    summary: { units: input.units, totalCents: input.totalCents, currency: current.currency },
    cart: current,
  };
  return { cart: target.cart, parked: [swapped, ...rest] };
}

export const removeParked = (parked: readonly ParkedCart[], id: string): ParkedCart[] =>
  parked.filter((entry) => entry.id !== id);

/* ── Recent and favourites ───────────────────────────────────────────────── */

export function loadList(storage: StorageLike | null, key: string): string[] {
  const raw = read(storage, key);
  return Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : [];
}

export const saveList = (storage: StorageLike | null, key: string, list: readonly string[]) =>
  write(storage, key, list);

/** Most recent first, no duplicates, capped. */
export function pushRecent(list: readonly string[], key: string, max = MAX_RECENT): string[] {
  return [key, ...list.filter((item) => item !== key)].slice(0, max);
}

export function toggleFavourite(
  list: readonly string[],
  key: string,
  max = MAX_FAVOURITES,
): string[] {
  return list.includes(key)
    ? list.filter((item) => item !== key)
    : [key, ...list].slice(0, max);
}
