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
    const loaded = parseStoreCart(window.localStorage.getItem(storageKey));
    commit(loaded);
    setLoadedKey(storageKey);
  }, [commit, storageKey]);

  useEffect(() => {
    if (loadedKey !== storageKey) return;
    if (lines.length) window.localStorage.setItem(storageKey, JSON.stringify(lines));
    else window.localStorage.removeItem(storageKey);
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
