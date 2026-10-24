import { describe, expect, it } from 'vitest';
import { addToCart, emptyCart } from '@/lib/pos/cart';
import {
  loadCart,
  loadList,
  loadParked,
  MAX_PARKED,
  POS_KEYS,
  parkCart,
  parseCart,
  pushRecent,
  removeParked,
  resumeParked,
  type StorageLike,
  saveCart,
  saveList,
  saveParked,
  toggleFavourite,
} from '@/lib/pos/storage';

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

let counter = 0;
const id = () => `id-${++counter}`;
const item = (key: string) => ({ key });

function cartWith(...keys: string[]) {
  let cart = emptyCart('SRD', id);
  for (const key of keys) cart = addToCart(cart, item(key), 1, id).cart;
  return cart;
}

describe('the cart survives a refresh', () => {
  it('round-trips a cart through storage', () => {
    const storage = new FakeStorage();
    let cart = cartWith('v:a', 'v:b');
    cart = { ...cart, customerId: 'c1', discount: { mode: 'percent', value: '5' }, note: 'x' };
    expect(saveCart(storage, cart)).toBe(true);
    expect(loadCart(storage)).toEqual(cart);
  });

  it('keeps the idempotency key, so a retry after a reload is recognised by the server', () => {
    const storage = new FakeStorage();
    const cart = cartWith('v:a');
    saveCart(storage, cart);
    expect(loadCart(storage)?.idempotencyKey).toBe(cart.idempotencyKey);
  });

  it('returns null for nothing, junk or a cart of an unknown shape', () => {
    const storage = new FakeStorage();
    expect(loadCart(storage)).toBeNull();
    storage.setItem(POS_KEYS.cart, '{not json');
    expect(loadCart(storage)).toBeNull();
    storage.setItem(POS_KEYS.cart, JSON.stringify({ currency: 'EUR', lines: [] }));
    expect(loadCart(storage)).toBeNull();
    storage.setItem(POS_KEYS.cart, JSON.stringify([1, 2]));
    expect(loadCart(storage)).toBeNull();
  });

  it('drops a damaged line but keeps the rest', () => {
    const parsed = parseCart({
      currency: 'USD',
      lines: [
        { key: 'l1', sellableKey: 'v:a', quantity: 2, overrideCents: null, note: '' },
        { key: 'l2', sellableKey: 'v:b', quantity: -3, overrideCents: null, note: '' },
        { key: 'l3', quantity: 1 },
      ],
    });
    expect(parsed?.lines.map((line) => line.key)).toEqual(['l1']);
  });

  it('works with no storage at all (a private window)', () => {
    expect(loadCart(null)).toBeNull();
    expect(saveCart(null, cartWith('v:a'))).toBe(false);
  });

  it('does not throw when the storage refuses a write or a read', () => {
    const broken: StorageLike = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {},
    };
    expect(loadCart(broken)).toBeNull();
    expect(saveCart(broken, cartWith('v:a'))).toBe(false);
    expect(loadParked(broken)).toEqual([]);
  });
});

describe('parked carts', () => {
  const meta = (label: string) => ({ label, now: 1_000, units: 1, totalCents: 500 });

  it('parks the cart under a label, newest first', () => {
    let result = parkCart([], cartWith('v:a'), meta('Anna'), id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result = parkCart(result.parked, cartWith('v:b'), meta('Ben'), id);
    if (!result.ok) return;
    expect(result.parked.map((entry) => entry.label)).toEqual(['Ben', 'Anna']);
  });

  it('will not park an empty cart', () => {
    expect(parkCart([], emptyCart('SRD', id), meta('x'), id)).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('holds at most ten', () => {
    let parked = [] as ReturnType<typeof removeParked>;
    for (let i = 0; i < MAX_PARKED; i++) {
      const result = parkCart(parked, cartWith('v:a'), meta(`Cart ${i}`), id);
      if (!result.ok) throw new Error('should fit');
      parked = result.parked;
    }
    expect(parked).toHaveLength(10);
    expect(parkCart(parked, cartWith('v:a'), meta('one too many'), id)).toEqual({
      ok: false,
      reason: 'full',
    });
  });

  it('gives a blank label a name and trims a long one', () => {
    const result = parkCart([], cartWith('v:a'), meta('   '), id);
    if (!result.ok) throw new Error('should park');
    expect(result.parked[0]?.label).toBe('Parked cart');
    const long = parkCart([], cartWith('v:a'), meta('x'.repeat(100)), id);
    if (!long.ok) throw new Error('should park');
    expect(long.parked[0]?.label).toHaveLength(40);
  });

  it('survives storage', () => {
    const storage = new FakeStorage();
    const result = parkCart([], cartWith('v:a', 'v:b'), meta('Anna'), id);
    if (!result.ok) throw new Error('should park');
    saveParked(storage, result.parked);
    const loaded = loadParked(storage);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.label).toBe('Anna');
    expect(loaded[0]?.cart.lines).toHaveLength(2);
  });

  it('resumes into an empty cart by simply taking it off the list', () => {
    const result = parkCart([], cartWith('v:a'), meta('Anna'), id);
    if (!result.ok) throw new Error('should park');
    const entry = result.parked[0];
    const resumed = resumeParked(
      result.parked,
      entry?.id ?? '',
      emptyCart('SRD', id),
      { ...meta('x') },
      id,
    );
    expect(resumed?.parked).toEqual([]);
    expect(resumed?.cart.lines).toHaveLength(1);
  });

  it('swaps with the cart in progress, so nothing is lost', () => {
    const first = parkCart([], cartWith('v:a'), meta('Anna'), id);
    if (!first.ok) throw new Error('should park');
    const current = cartWith('v:b');
    const resumed = resumeParked(
      first.parked,
      first.parked[0]?.id ?? '',
      current,
      meta('Walk-in 10:40'),
      id,
    );
    expect(resumed?.cart.lines[0]?.sellableKey).toBe('v:a');
    expect(resumed?.parked).toHaveLength(1);
    expect(resumed?.parked[0]?.label).toBe('Walk-in 10:40');
    expect(resumed?.parked[0]?.cart.lines[0]?.sellableKey).toBe('v:b');
  });

  it('answers null for an unknown id, and deletes by id', () => {
    const first = parkCart([], cartWith('v:a'), meta('Anna'), id);
    if (!first.ok) throw new Error('should park');
    expect(resumeParked(first.parked, 'nope', emptyCart('SRD', id), meta('x'), id)).toBeNull();
    expect(removeParked(first.parked, first.parked[0]?.id ?? '')).toEqual([]);
  });
});

describe('recent and favourites', () => {
  it('puts the latest first, once, up to the cap', () => {
    let recent: string[] = [];
    for (const key of ['a', 'b', 'c', 'a']) recent = pushRecent(recent, key, 3);
    expect(recent).toEqual(['a', 'c', 'b']);
    recent = pushRecent(recent, 'd', 3);
    expect(recent).toEqual(['d', 'a', 'c']);
  });

  it('toggles a favourite on and off', () => {
    let favourites = toggleFavourite([], 'p-1');
    favourites = toggleFavourite(favourites, 'p-2');
    expect(favourites).toEqual(['p-2', 'p-1']);
    expect(toggleFavourite(favourites, 'p-1')).toEqual(['p-2']);
  });

  it('stores lists and ignores anything that is not a list of strings', () => {
    const storage = new FakeStorage();
    saveList(storage, POS_KEYS.recent, ['a', 'b']);
    expect(loadList(storage, POS_KEYS.recent)).toEqual(['a', 'b']);
    storage.setItem(POS_KEYS.favourites, JSON.stringify({ not: 'a list' }));
    expect(loadList(storage, POS_KEYS.favourites)).toEqual([]);
    storage.setItem(POS_KEYS.favourites, JSON.stringify(['ok', 3, null]));
    expect(loadList(storage, POS_KEYS.favourites)).toEqual(['ok']);
  });
});
