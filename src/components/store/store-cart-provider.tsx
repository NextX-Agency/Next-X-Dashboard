'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  addStoreCartLine,
  parseStoreCart,
  type StoreCartLine,
  type StoreCartLineInput,
  storeCartCount,
  updateStoreCartQuantity,
} from '@/lib/store-cart';

const STORAGE_PREFIX = 'nextly-store-cart:v1:';

type StoreCartContextValue = {
  lines: StoreCartLine[];
  count: number;
  ready: boolean;
  addLine: (line: StoreCartLineInput) => boolean;
  setQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
};

/**
 * Browser storage can be missing or throw (private windows, blocked site data, a full quota). The cart
 * then works for the visit and simply is not remembered; it must never crash the page.
 */
function readStoredCart(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredCart(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not remembered on this device; the cart in memory is still correct.
  }
}

const StoreCartContext = createContext<StoreCartContextValue | null>(null);

export function StoreCartProvider({
  storageScope,
  children,
}: {
  storageScope: string;
  children: ReactNode;
}) {
  const storageKey = `${STORAGE_PREFIX}${storageScope}`;
  const [lines, setLines] = useState<StoreCartLine[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const linesRef = useRef<StoreCartLine[]>([]);

  const commit = useCallback((next: StoreCartLine[]) => {
    linesRef.current = next;
    setLines(next);
  }, []);

  useEffect(() => {
    const loaded = parseStoreCart(readStoredCart(storageKey));
    commit(loaded);
    setLoadedKey(storageKey);
  }, [commit, storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    writeStoredCart(storageKey, lines.length ? JSON.stringify(lines) : null);
  }, [lines, loadedKey, storageKey]);

  useEffect(() => {
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key === null) {
        commit([]);
      } else if (event.key === storageKey) {
        commit(parseStoreCart(event.newValue));
      }
    };
    window.addEventListener('storage', syncOtherTab);
    return () => window.removeEventListener('storage', syncOtherTab);
  }, [commit, storageKey]);

  const addLine = useCallback(
    (line: StoreCartLineInput) => {
      const result = addStoreCartLine(linesRef.current, line);
      if (result.lines !== linesRef.current) commit(result.lines);
      return result.added;
    },
    [commit],
  );
  const setQuantity = useCallback(
    (variantId: string, quantity: number) => {
      commit(updateStoreCartQuantity(linesRef.current, variantId, quantity));
    },
    [commit],
  );
  const removeLine = useCallback(
    (variantId: string) => setQuantity(variantId, 0),
    [setQuantity],
  );
  const clear = useCallback(() => commit([]), [commit]);

  const value = useMemo(
    () => ({
      lines,
      count: storeCartCount(lines),
      ready: loadedKey === storageKey,
      addLine,
      setQuantity,
      removeLine,
      clear,
    }),
    [addLine, clear, lines, loadedKey, removeLine, setQuantity, storageKey],
  );

  return <StoreCartContext.Provider value={value}>{children}</StoreCartContext.Provider>;
}

export function useStoreCart() {
  const value = useContext(StoreCartContext);
  if (!value) throw new Error('useStoreCart must be used inside StoreCartProvider.');
  return value;
}
