'use client';

import { ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { RestockRequestForm } from '@/components/forms/restock-request-form';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { Button } from '@/components/ui/button';
import { fromBase } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import { useStoreCart } from './store-cart-provider';

type Variant = {
  id: string;
  name: string;
  sku: string;
  listPriceCents: number;
  priceCurrency: 'USD' | 'SRD';
  onHand: number;
};

/** Variant selection is intentionally local UI state; price and availability
 * remain from the server's public catalog read model. */
export function ProductOrderPanel({
  productId,
  productSlug,
  productName,
  variants,
  srdRate,
  whatsapp,
  restockNotificationsEnabled,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  variants: Variant[];
  srdRate?: number;
  whatsapp: string | null | undefined;
  restockNotificationsEnabled: boolean;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState('');
  const { lines, ready, addLine } = useStoreCart();
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  if (!variant) return null;
  const inStock = variant.onHand > 0;
  const cartQuantity = lines.find((item) => item.variantId === variant.id)?.quantity ?? 0;
  const canAdd = ready && inStock && cartQuantity + quantity <= variant.onHand;
  const price =
    variant.priceCurrency === 'SRD'
      ? `${formatMoney(variant.listPriceCents, 'SRD', { bare: true })} SRD`
      : srdRate && srdRate > 0
        ? `${formatMoney(fromBase(variant.listPriceCents, srdRate), 'SRD', { bare: true })} SRD`
        : formatMoney(variant.listPriceCents, 'USD');
  return (
    <>
      <StorePrice
        amountCents={variant.listPriceCents}
        currency={variant.priceCurrency}
        srdRate={srdRate}
        size="xl"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {variants.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setVariantId(item.id);
              setQuantity(1);
              setCartMessage('');
            }}
            className={`rounded-control border px-3 py-1.5 text-[12px] ${item.id === variant.id ? 'border-accent bg-accent-muted text-ink' : 'border-line text-ink-3'}`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-ink-3">
        {inStock ? `${variant.onHand} available in Paramaribo` : 'This option is sold out'}
      </p>
      <div className="mt-3">
        {inStock ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="store-cart-quantity">
              Quantity
            </label>
            <input
              id="store-cart-quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={variant.onHand}
              value={quantity}
              onChange={(event) => {
                const nextQuantity = Number.parseInt(event.target.value, 10);
                setQuantity(
                  Number.isFinite(nextQuantity)
                    ? Math.max(1, Math.min(variant.onHand, nextQuantity))
                    : 1,
                );
                setCartMessage('');
              }}
              className="h-9 w-16 rounded-control border border-line bg-base px-2 text-center text-[13px] tabular text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button
              type="button"
              variant="primary"
              size="lg"
              disabled={!canAdd}
              className="h-11 rounded-full px-5 text-[14px]"
              onClick={() => {
                const added = addLine({
                  productId,
                  productSlug,
                  productName,
                  variantId: variant.id,
                  variantName: variant.name,
                  sku: variant.sku,
                  quantity,
                  priceCents: variant.listPriceCents,
                  currency: variant.priceCurrency,
                  available: variant.onHand,
                });
                setCartMessage(
                  added
                    ? `${quantity} ${variant.name} added to your cart.`
                    : 'Your cart quantity now matches the available stock.',
                );
              }}
            >
              <ShoppingBag aria-hidden="true" />
              Add to cart
            </Button>
            <WhatsAppCta
              number={whatsapp}
              message={`Hi NextX, I’d like to ${inStock ? 'order' : 'ask about restocking'} the ${productName} – ${variant.name}${variant.sku ? ` (SKU ${variant.sku})` : ''}. I saw it listed for ${price}${inStock ? ' and currently in stock' : ''}.`}
              label="Ask on WhatsApp"
              className="h-11 rounded-full px-6 text-[14px]"
            />
          </div>
        ) : (
          <WhatsAppCta
            number={whatsapp}
            message={`Hi NextX, I’d like to ask about restocking the ${productName} – ${variant.name}${variant.sku ? ` (SKU ${variant.sku})` : ''}. I saw it listed for ${price}.`}
            label="Ask about restock"
            className="h-11 rounded-full px-6 text-[14px]"
          />
        )}
        <p aria-live="polite" className="mt-2 min-h-4 text-[12px] text-ink-3">
          {cartMessage ||
            (inStock && cartQuantity >= variant.onHand
              ? 'Your cart already contains all available stock for this option.'
              : '')}
        </p>
      </div>
      {!inStock && restockNotificationsEnabled ? (
        <section className="mt-4 border-t border-line-subtle pt-4">
          <h2 className="text-[14px] font-semibold text-ink">Notify me when it’s back</h2>
          <p className="mt-1 text-[12px] text-ink-3">
            We’ll keep your request for the NextX team. Nothing is sent automatically.
          </p>
          <RestockRequestForm productId={productId} variantId={variant.id} />
        </section>
      ) : null}
    </>
  );
}
