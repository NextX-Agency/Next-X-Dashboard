'use client';

import { Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RestockRequestForm } from '@/components/forms/restock-request-form';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { cn } from '@/lib/cn';
import { fromBase } from '@/lib/fx';
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

/** A variant called only "Standaard"/"Default" tells the customer nothing. */
const MEANINGLESS_VARIANT = /^(standaard|standard|default|std)$/i;

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
        : `$${(variant.listPriceCents / 100).toFixed(2)}`;
  const variantLabel = showVariants ? ` – ${variant.name}` : '';
  const skuLabel = variant.sku ? ` (SKU ${variant.sku})` : '';

  function setQty(next: number) {
    setQuantity(Math.max(1, Math.min(variant?.onHand ?? 1, next)));
    setCartMessage('');
    setAdded(false);
  }

  return (
    <div>
      <StorePrice
        amountCents={variant.listPriceCents}
        currency={variant.priceCurrency}
        srdRate={srdRate}
        size="xl"
      />

      {showVariants ? (
        <fieldset className="mt-6">
          <legend className="nx-label text-ink-3">Uitvoering</legend>
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
                    'min-h-11 rounded-tile border px-4 text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected
                      ? 'border-ink bg-ink font-semibold text-base'
                      : 'border-line text-ink-2 hover:border-ink hover:text-ink',
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

      <p className="mt-5 flex items-center gap-2 text-[14px] text-ink-2">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', inStock ? 'bg-store-bright' : 'bg-ink-4')}
        />
        {inStock ? `${variant.onHand} op voorraad` : 'Niet op voorraad'}
      </p>

      <div className="mt-6">
        {inStock ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-12 shrink-0 items-stretch border border-ink">
              <button
                type="button"
                aria-label="Minder"
                disabled={quantity <= 1}
                onClick={() => setQty(quantity - 1)}
                className="grid w-11 place-items-center hover:bg-hover disabled:opacity-35"
              >
                <Minus className="size-4" />
              </button>
              <label className="sr-only" htmlFor="store-cart-quantity">
                Aantal
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
                className="tabular w-12 border-0 bg-transparent text-center text-[15px] font-semibold text-ink [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Meer"
                disabled={quantity >= variant.onHand}
                onClick={() => setQty(quantity + 1)}
                className="grid w-11 place-items-center hover:bg-hover disabled:opacity-35"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <button
              type="button"
              disabled={!canAdd}
              className="nx-btn nx-btn-orange h-12 flex-1 px-6 text-[15px] sm:flex-none sm:min-w-52"
              onClick={() => {
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
                    ? `${quantity} × ${productName} toegevoegd aan je winkelwagen.`
                    : 'Je winkelwagen bevat al alle beschikbare voorraad.',
                );
              }}
            >
              <ShoppingBag aria-hidden="true" />
              In winkelwagen
            </button>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {inStock ? (
            <WhatsAppCta
              number={whatsapp}
              message={`Hallo NextX, ik wil graag de ${productName}${variantLabel}${skuLabel} bestellen. Op de website staat hij voor ${price} en volgens de website is hij op voorraad. Kunnen jullie dit bevestigen?`}
              label="Bestel via WhatsApp"
              className="h-12 px-6"
            />
          ) : (
            <WhatsAppCta
              number={whatsapp}
              message={`Hallo NextX, ik wil graag weten wanneer de ${productName}${variantLabel}${skuLabel} weer op voorraad komt. Op de website staat hij voor ${price}.`}
              label="Vraag naar nieuwe voorraad"
              tone="orange"
              className="h-12 px-6"
            />
          )}
          {added ? (
            <Link
              href={CART_PATH as never}
              className="text-[14px] font-semibold text-ink underline underline-offset-4 hover:text-accent"
            >
              Naar winkelwagen
            </Link>
          ) : null}
        </div>

        <p aria-live="polite" className="mt-3 min-h-5 text-[13px] text-ink-2">
          {cartMessage ||
            (inStock && cartQuantity >= variant.onHand
              ? 'Je winkelwagen bevat al alle beschikbare voorraad van dit product.'
              : '')}
        </p>
      </div>

      {!inStock && restockNotificationsEnabled ? (
        <section className="mt-4 border-line border-t pt-5">
          <h2 className="text-[15px] font-semibold text-ink">
            Laat het me weten als hij terug is
          </h2>
          <p className="mt-1 text-[13px] text-ink-2">
            Je verzoek gaat naar het NextX-team. Er wordt niets automatisch verstuurd.
          </p>
          <RestockRequestForm productId={productId} variantId={variant.id} />
        </section>
      ) : null}
    </div>
  );
}
