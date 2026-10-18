'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ResolvableImage } from '@/lib/product-images';

export type SelectableVariant = {
  id: string;
  name: string;
  sku: string;
  attributes: Record<string, string>;
  listPriceCents: number;
  priceCurrency: 'USD' | 'SRD';
  onHand: number;
  /** Stock per pickup location for this variant only. Empty when pickup is off. */
  locations: { name: string; available: number }[];
};

type ProductSelection = {
  variants: SelectableVariant[];
  images: ResolvableImage[];
  variant: SelectableVariant;
  select: (variantId: string) => void;
};

const Context = createContext<ProductSelection | null>(null);

/**
 * The one place the product page remembers which option is chosen.
 *
 * The gallery, the price and stock, the pickup list, the add-to-cart button and the WhatsApp message
 * all read the same `variant`, so they can never disagree. The choice is mirrored into the address
 * (`?variant=SKU`) so a shared link, a reload or a filtered shop result opens on the same option.
 */
export function ProductSelectionProvider({
  variants,
  images,
  initialVariantId,
  children,
}: {
  variants: SelectableVariant[];
  images: ResolvableImage[];
  initialVariantId: string;
  children: ReactNode;
}) {
  const [variantId, setVariantId] = useState(initialVariantId);
  const variant =
    variants.find((item) => item.id === variantId) ?? (variants[0] as SelectableVariant);

  const select = useCallback((next: string) => setVariantId(next), []);

  useEffect(() => {
    if (variants.length < 2) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('variant') === variant.sku) return;
    url.searchParams.set('variant', variant.sku);
    window.history.replaceState(window.history.state, '', url);
  }, [variant.sku, variants.length]);

  const value = useMemo(
    () => ({ variants, images, variant, select }),
    [variants, images, variant, select],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useProductSelection(): ProductSelection {
  const value = useContext(Context);
  if (!value)
    throw new Error('useProductSelection must be used inside ProductSelectionProvider.');
  return value;
}
