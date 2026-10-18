'use client';

import { Check, Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { RestockRequestForm } from '@/components/forms/restock-request-form';
import { StockPill } from '@/components/store/stock-pill';
import { StorePrice } from '@/components/store/store-price';
import { WhatsAppCta } from '@/components/store/whatsapp-cta';
import { cn } from '@/lib/cn';
import { fromBase } from '@/lib/fx';
import { resolveVariantImage } from '@/lib/product-images';
import { colourName, optionLegend, optionName, swatchColour } from '@/lib/product-options';
import { productOrderMessage, productRestockMessage } from '@/lib/store-messages';
import { CART_PATH } from '@/lib/storefront-domain';
import { type SelectableVariant, useProductSelection } from './product-selection';
import { useStoreCart } from './store-cart-provider';
import { formatSrd } from './store-price';

/**
 * Price, stock, variant, quantity and the two ways to order. The chosen option lives in
 * ProductSelectionProvider, shared with the gallery and the pickup list; price and availability come
 * from the server's public catalog read model. On phones the add-to-cart button
 * lives in a bar fixed to the bottom of the screen, so the buy action never scrolls away.
 */
export function ProductOrderPanel({
  productId,
  productSlug,
  productName,
  modelNumber,
  businessName,
  srdRate,
  whatsapp,
  restockNotificationsEnabled,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  /** The manufacturer's model, when the owner entered one. */
  modelNumber?: string | null;
  businessName: string;
  srdRate?: number;
  whatsapp: string | null | undefined;
  restockNotificationsEnabled: boolean;
}) {
  const { variants, images, variant, select } = useProductSelection();
  const [quantity, setQuantity] = useState(1);
  const [cartMessage, setCartMessage] = useState('');
  const [added, setAdded] = useState(false);
  const { lines, ready, addLine } = useStoreCart();
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
    variantName: showVariants ? optionName(variant) : null,
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
      imageUrl: (() => {
        const image = resolveVariantImage(images, variant.id, variants.length).image;
        return image ? (image.thumbUrl ?? image.url) : null;
      })(),
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
      {/* Which exact item this is: the SKU follows the chosen option, like the photograph and price. */}
      <p className="tabular mt-2 text-[13px] text-ink-3">
        {modelNumber ? `Model ${modelNumber} · ` : ''}SKU {variant.sku}
      </p>

      {showVariants ? (
        <VariantSelector
          variants={variants}
          selectedId={variant.id}
          onSelect={(id) => {
            select(id);
            setQuantity(1);
            setCartMessage('');
            setAdded(false);
          }}
        />
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
            <p className="mt-1 truncate text-[12px] text-ink-3">
              {/* The swatches sit below the fold on a phone: name the option being added. */}
              {showVariants ? (
                <span className="font-semibold text-ink">
                  {optionName(variant) ?? variant.sku}
                </span>
              ) : null}
              {showVariants ? ' · ' : null}
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

/**
 * Colours get a labelled swatch; every other kind of option is a readable button. The selected
 * option shows a tick and a heavier outline as well as its colour, and sold-out options say so in
 * words, so nothing is communicated by colour alone.
 */
function VariantSelector({
  variants,
  selectedId,
  onSelect,
}: {
  variants: SelectableVariant[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const legend = optionLegend(variants);
  const selected = variants.find((item) => item.id === selectedId);
  return (
    <fieldset className="mt-6">
      <legend className="font-semibold text-[13px] text-ink-3">
        {legend}
        {selected ? (
          <span className="ml-1.5 text-ink">{optionName(selected) ?? selected.sku}</span>
        ) : null}
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {variants.map((item) => {
          const isSelected = item.id === selectedId;
          const label = optionName(item) ?? item.sku ?? item.name;
          const swatch = swatchColour(colourName(item.attributes));
          const soldOut = item.onHand <= 0;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${label}${soldOut ? ', sold out' : ''}`}
              onClick={() => onSelect(item.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-[10px] border px-3.5 font-semibold text-[14px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                isSelected
                  ? 'border-night bg-night text-night-ink'
                  : 'border-line-strong text-ink hover:border-ink',
                soldOut && !isSelected && 'text-ink-3',
              )}
            >
              {swatch ? (
                <span
                  aria-hidden="true"
                  className="grid size-5 shrink-0 place-items-center rounded-full border border-black/25"
                  style={{ backgroundColor: swatch }}
                >
                  {isSelected ? (
                    <Check
                      className="size-3"
                      style={{ color: isLight(swatch) ? '#16181b' : '#ffffff' }}
                    />
                  ) : null}
                </span>
              ) : isSelected ? (
                <Check aria-hidden="true" className="size-4 shrink-0" />
              ) : null}
              <span>{label}</span>
              {soldOut ? (
                <span aria-hidden="true" className="font-medium text-[12px] opacity-70">
                  Sold out
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Pick a tick colour that stays visible on the swatch. */
function isLight(hex: string): boolean {
  const value = Number.parseInt(hex.slice(1), 16);
  const luma = 0.2126 * (value >> 16) + 0.7152 * ((value >> 8) & 255) + 0.0722 * (value & 255);
  return luma > 150;
}
