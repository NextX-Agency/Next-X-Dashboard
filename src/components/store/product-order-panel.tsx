'use client';

import { Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RestockRequestForm } from '@/components/forms/restock-request-form';
import { StockPill } from '@/components/store/stock-pill';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { cn } from '@/lib/cn';
import { fromBase } from '@/lib/fx';
import { productOrderMessage, productRestockMessage } from '@/lib/store-messages';
import { CART_PATH } from '@/lib/storefront-domain';
import { useStoreCart } from './store-cart-provider';
import { formatSrd } from './store-price';

type Variant = {
  id: string;
  name: string;
  sku: string;
  listPriceCents: number;
  priceCurrency: 'USD' | 'SRD';
  onHand: number;
};

/** A variant called only "Standard"/"Default" tells the customer nothing. */
const MEANINGLESS_VARIANT = /^(standaard|standard|default|std)$/i; // 'standaard' = legacy imported name

/**
 * Price, stock, variant, quantity and the two ways to order. Variant selection is local UI state; price
 * and availability come from the server's public catalog read model. On phones the add-to-cart button
 * lives in a bar fixed to the bottom of the screen, so the buy action never scrolls away.
 */
export function ProductOrderPanel({
  productId,
  productSlug,
  productName,
  businessName,
  variants,
  srdRate,
  whatsapp,
  restockNotificationsEnabled,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  businessName: string;
  variants: Variant[];
  srdRate?: number;
  whatsapp: string | null | undefined;
  restockNotificationsEnabled: boolean;
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? '');
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState('');
  const [added, setAdded] = useState(false);
  const { lines, ready, addLine } = useStoreCart();
  const variant = variants.find((item) => item.id === variantId) ?? variants[0];
  if (!variant) return null;
  const inStock = variant.onHand > 0;
  const cartQuantity = lines.find((item) => item.variantId === variant.id)?.quantity ?? 0;
  const canAdd = ready && inStock && cartQuantity + quantity <= variant.onHand;
  const showVariants = variants.length > 1;
  const price =
    variant.priceCurrency === 'SRD'
      ? formatSrd(variant.listPriceCents)
      : srdRate && srdRate > 0
        ? formatSrd(fromBase(variant.listPriceCents, srdRate))
        : `US$${(variant.listPriceCents / 100).toFixed(2)}`;
  const messageInput = {
    businessName,
    productName,
    variantName: showVariants ? variant.name : null,
    sku: variant.sku,
    price,
  };

  function setQty(next: number) {
    setQuantity(Math.max(1, Math.min(variant?.onHand ?? 1, next)));
    setCartMessage('');
    setAdded(false);
  }

  function addToCart() {
    if (!variant) return;
    const ok = addLine({
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
    setAdded(ok);
    setCartMessage(
      ok
        ? `${quantity} × ${productName} added to your cart.`
        : 'Your cart already holds all available stock.',
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StorePrice
          amountCents={variant.listPriceCents}
          currency={variant.priceCurrency}
          srdRate={srdRate}
          size="xl"
        />
        <StockPill onHand={variant.onHand} />
      </div>

      {showVariants ? (
        <fieldset className="mt-6">
          <legend className="font-semibold text-[13px] text-ink-3">Option</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {variants.map((item) => {
              const selected = item.id === variant.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setVariantId(item.id);
                    setQuantity(1);
                    setCartMessage('');
                    setAdded(false);
                  }}
                  className={cn(
                    'min-h-11 rounded-[10px] border px-4 font-semibold text-[14px] transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected
                      ? 'border-night bg-night text-night-ink'
                      : 'border-line-strong text-ink hover:border-ink',
                    item.onHand <= 0 && !selected && 'text-ink-3',
                  )}
                >
                  {MEANINGLESS_VARIANT.test(item.name.trim())
                    ? item.sku || item.name
                    : item.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-6 space-y-3">
        {inStock ? (
          <div className="flex gap-3">
            <div className="flex h-12 shrink-0 items-stretch rounded-[12px] border border-line-strong focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQty(quantity - 1)}
                className="grid w-11 place-items-center rounded-l-[12px] hover:bg-hover disabled:opacity-35"
              >
                <Minus className="size-4" />
              </button>
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
                  const next = Number.parseInt(event.target.value, 10);
                  setQty(Number.isFinite(next) ? next : 1);
                }}
                className="tabular w-10 border-0 bg-transparent text-center font-bold text-[15px] text-ink [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={quantity >= variant.onHand}
                onClick={() => setQty(quantity + 1)}
                className="grid w-11 place-items-center rounded-r-[12px] hover:bg-hover disabled:opacity-35"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <button
              type="button"
              disabled={!canAdd}
              onClick={addToCart}
              className="nx-btn nx-btn-primary h-12 flex-1 max-sm:hidden"
            >
              <ShoppingBag aria-hidden="true" />
              Add to cart
            </button>
          </div>
        ) : null}

        {inStock ? (
          <WhatsAppCta
            number={whatsapp}
            message={productOrderMessage(messageInput)}
            label="Order via WhatsApp"
            className="h-12 w-full"
          />
        ) : (
          <WhatsAppCta
            number={whatsapp}
            message={productRestockMessage(messageInput)}
            label="Ask when it is back"
            tone="primary"
            className="h-12 w-full"
          />
        )}

        {added ? (
          <Link
            href={CART_PATH as never}
            className="inline-block font-bold text-[14px] text-ink underline underline-offset-4"
          >
            Go to cart
          </Link>
        ) : null}
        <p aria-live="polite" className="min-h-5 text-[13px] text-ink-2">
          {cartMessage ||
            (inStock && cartQuantity >= variant.onHand
              ? 'Your cart already holds all available stock of this product.'
              : '')}
        </p>
      </div>

      {!inStock && restockNotificationsEnabled ? (
        <section className="mt-2 border-line border-t pt-5">
          <h2 className="font-bold text-[15px]">Tell me when it is back in stock</h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Your request goes to the NextX team. Nothing is sent automatically.
          </p>
          <RestockRequestForm productId={productId} variantId={variant.id} />
        </section>
      ) : null}

      {/* Phone: the buy action stays on screen. */}
      {inStock ? (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-line border-t bg-base p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:hidden">
          <div className="min-w-0">
            <p className="tabular font-extrabold text-[20px] leading-none">{price}</p>
            <p className="mt-1 text-[12px] text-ink-3">
              {quantity} {quantity === 1 ? 'item' : 'items'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canAdd}
            onClick={addToCart}
            className="nx-btn nx-btn-primary h-12 flex-1"
          >
            <ShoppingBag aria-hidden="true" />
            Add to cart
          </button>
        </div>
      ) : null}
    </div>
  );
}
