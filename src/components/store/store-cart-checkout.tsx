'use client';

import { MessageCircle, Minus, Package, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { RateMicros } from '@/lib/fx';
import {
  applyStoreCartQuote,
  type StoreCartLine,
  type StoreCartQuoteLine,
  storeCartSubtotal,
} from '@/lib/store-cart';
import { cartOrderMessage, customerMoney, variantLabel } from '@/lib/store-messages';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';
import { useStoreCart } from './store-cart-provider';

type PickupLocation = { id: string; name: string };
type CartQuoteState =
  | { requestKey: string; status: 'error' }
  | {
      requestKey: string;
      status: 'ready';
      lines: StoreCartLine[];
      unavailableVariantIds: string[];
    };

function paramariboDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Paramaribo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day') + offsetDays));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function fieldClassName() {
  return 'mt-1.5 h-11 w-full rounded-tile border border-line bg-raised px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none';
}

export function StoreCartCheckout({
  businessName,
  whatsapp,
  locations,
  fallbackLocation,
  srdRate,
  storefrontSlug,
}: {
  businessName: string;
  whatsapp: string | null;
  locations: PickupLocation[];
  fallbackLocation: string | null;
  srdRate?: RateMicros;
  storefrontSlug: string | null;
}) {
  const { lines, ready, setQuantity, removeLine, clear } = useStoreCart();
  const [cartQuote, setCartQuote] = useState<CartQuoteState | null>(null);
  const [quoteRetry, setQuoteRetry] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState(locations[0]?.id ?? '');
  const [pickupDate, setPickupDate] = useState<'today' | 'tomorrow' | 'custom'>('today');
  const [customDate, setCustomDate] = useState('');
  const quoteRequestItems = useMemo(
    () => lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
    [lines],
  );
  const quoteRequestKey = JSON.stringify(quoteRequestItems);
  const quoteAttemptKey = `${quoteRequestKey}:${quoteRetry}`;
  const currentCartQuote = cartQuote?.requestKey === quoteAttemptKey ? cartQuote : null;
  const readyCartQuote = currentCartQuote?.status === 'ready' ? currentCartQuote : null;
  const quoteReady = readyCartQuote !== null;
  const quoteError = currentCartQuote?.status === 'error';
  const displayLines = readyCartQuote?.lines ?? lines;
  const currencyMismatch =
    quoteReady && displayLines.some((line) => line.currency !== displayLines[0]?.currency);
  const stockIssue =
    quoteReady &&
    displayLines.some((line) => line.available === 0 || line.quantity > line.available);
  const whatsappNumber = whatsappDigits(whatsapp);
  const selectedLocation = locations.find((location) => location.id === pickupLocationId);
  const requestedPickupDate =
    pickupDate === 'today'
      ? paramariboDate()
      : pickupDate === 'tomorrow'
        ? paramariboDate(1)
        : customDate;
  const formReady =
    (locations.length === 0 || Boolean(selectedLocation)) && Boolean(requestedPickupDate);

  useEffect(() => {
    if (!ready || lines.length === 0) return;

    const requestKey = quoteAttemptKey;
    const controller = new AbortController();

    const timeout = window.setTimeout(() => {
      void fetch('/api/v1/storefront/cart/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: quoteRequestItems }),
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('Cart quote could not be refreshed.');
          const payload = (await response.json()) as {
            items: StoreCartQuoteLine[];
            unavailableVariantIds: string[];
          };
          const refreshed = applyStoreCartQuote(
            lines,
            payload.items,
            payload.unavailableVariantIds,
          );
          setCartQuote({ requestKey, status: 'ready', ...refreshed });
        })
        .catch(() => {
          if (!controller.signal.aborted) setCartQuote({ requestKey, status: 'error' });
        });
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [lines, quoteAttemptKey, quoteRequestItems, ready]);

  const totals = useMemo(() => {
    const currencies = [...new Set(displayLines.map((line) => line.currency))];
    return currencies.map((currency) => ({
      currency,
      amount: storeCartSubtotal(displayLines, currency),
    }));
  }, [displayLines]);

  const whatsappMessage = useMemo(() => {
    if (!lines.length || !quoteReady || !formReady || stockIssue || currencyMismatch)
      return null;
    return cartOrderMessage({
      businessName,
      lines: displayLines,
      srdRate,
      customerName,
      customerPhone,
      pickupLocation: selectedLocation?.name ?? fallbackLocation ?? 'Please confirm with me',
      pickupDate: requestedPickupDate,
      notes,
    });
  }, [
    businessName,
    currencyMismatch,
    customerName,
    customerPhone,
    fallbackLocation,
    formReady,
    displayLines,
    lines.length,
    notes,
    quoteReady,
    requestedPickupDate,
    srdRate,
    selectedLocation,
    stockIssue,
  ]);
  const orderUrl =
    whatsappMessage && whatsappNumber ? whatsappLink(whatsappNumber, whatsappMessage) : null;

  if (!ready) {
    return (
      <div
        className="mx-auto min-h-[70svh] w-full max-w-[1320px] px-4 py-16 lg:px-8"
        aria-live="polite"
      >
        <p className="nx-label text-ink-3">Loading your cart…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[70svh] w-full max-w-[1320px] content-start gap-10 px-4 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-8 lg:pt-14 lg:pb-28">
      <section aria-labelledby="cart-heading" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="nx-label text-ink-3">Your order</p>
            <h1
              id="cart-heading"
              className="nx-display mt-2 text-[clamp(36px,5vw,64px)] text-ink"
            >
              Cart
            </h1>
          </div>
          {lines.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <Trash2 aria-hidden="true" />
              Empty cart
            </Button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="mt-8 flex flex-col items-start gap-4 border-line border-y py-14">
            <ShoppingBag aria-hidden="true" className="size-8 text-ink-3" />
            <div>
              <h2 className="nx-display text-[28px] text-ink">Your cart is empty</h2>
              <p className="mt-2 max-w-[46ch] text-[15px] text-ink-2">
                Add products to prepare an order for WhatsApp.
              </p>
            </div>
            <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
              Browse products
            </Link>
          </div>
        ) : (
          <div className="mt-8 divide-y divide-line border-line border-y">
            {displayLines.map((line) => {
              const quoteUnavailable =
                quoteReady && readyCartQuote.unavailableVariantIds.includes(line.variantId);
              const overStock =
                quoteReady &&
                (quoteUnavailable || line.available === 0 || line.quantity > line.available);
              return (
                <article
                  key={line.variantId}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-5 sm:flex sm:flex-wrap sm:gap-x-5"
                >
                  <div className="col-span-3 flex min-w-0 items-start gap-4 sm:flex-1">
                    <div className="relative size-[72px] shrink-0 overflow-hidden rounded-[12px] bg-sunken">
                      {line.imageUrl ? (
                        <Image
                          src={line.imageUrl}
                          alt={`${line.productName}${variantLabel(line.variantName) ? ` – ${variantLabel(line.variantName)}` : ''}`}
                          fill
                          sizes="72px"
                          className="object-contain p-1.5 mix-blend-multiply"
                        />
                      ) : (
                        <div className="grid size-full place-items-center">
                          <Package aria-hidden="true" className="size-6 text-ink-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <a
                        href={storefrontProductPath(storefrontSlug, line.productSlug)}
                        className="text-[16px] font-semibold text-ink hover:text-accent"
                      >
                        {line.productName}
                      </a>
                      <p className="mt-0.5 text-[12px] text-ink-3">
                        {[variantLabel(line.variantName), line.sku].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-2 text-[13px] tabular text-ink-2">
                        {!quoteReady
                          ? 'The current price appears once we have checked it.'
                          : quoteUnavailable
                            ? 'No price is available for this product right now.'
                            : `${customerMoney(line.priceCents, line.currency, srdRate)} each`}
                      </p>
                      {overStock ? (
                        <p className="mt-1 text-[12px] text-negative">
                          {line.available === 0
                            ? 'This product is no longer available. Remove it to continue.'
                            : `Only ${line.available} available. Lower the quantity to continue.`}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center border border-ink">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${line.productName}`}
                      className="grid size-11 place-items-center text-ink hover:bg-hover disabled:opacity-35 sm:size-9"
                      disabled={line.quantity <= 1}
                      onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                    >
                      <Minus aria-hidden="true" className="size-4" />
                    </button>
                    <span className="min-w-7 text-center text-[13px] tabular text-ink">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${line.productName}`}
                      className="grid size-11 place-items-center text-ink hover:bg-hover disabled:opacity-35 sm:size-9"
                      disabled={
                        !quoteReady || line.quantity >= line.available || line.quantity >= 9999
                      }
                      onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <p className="text-right text-[15px] font-semibold tabular text-ink sm:w-28">
                    {quoteReady && !overStock
                      ? customerMoney(
                          storeCartSubtotal([line], line.currency),
                          line.currency,
                          srdRate,
                        )
                      : '—'}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${line.productName}`}
                    onClick={() => removeLine(line.variantId)}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {lines.length ? (
        <aside className="h-fit border-ink border-t-2 bg-raised p-5 sm:p-6 lg:sticky lg:top-24">
          <h2 className="nx-display text-[24px] text-ink">Order via WhatsApp</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Send your list to {businessName}. The team confirms stock and the final price.
          </p>

          <div className="mt-5 space-y-2 border-line border-y py-4">
            {quoteReady && !stockIssue ? (
              totals.map(({ currency, amount }) => (
                <div key={currency} className="flex items-baseline justify-between gap-4">
                  <span className="text-[12px] text-ink-3">Estimated total</span>
                  <span className="text-[18px] font-semibold tabular text-ink">
                    {customerMoney(amount, currency, srdRate)}
                  </span>
                </div>
              ))
            ) : quoteReady ? (
              <p className="text-[12px] text-ink-3">
                Lower or remove unavailable quantities to see a total.
              </p>
            ) : (
              <p className="text-[12px] text-ink-3">
                The total appears once current prices have been checked.
              </p>
            )}
          </div>

          {quoteReady ? (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Price and stock just checked. Stock is only reserved once the shop confirms your
              order.
            </p>
          ) : quoteError ? (
            <div
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              <p>We could not check price and stock. Try again before you send your order.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 text-negative"
                onClick={() => setQuoteRetry((retry) => retry + 1)}
              >
                Check again
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Checking price and stock…
            </p>
          )}

          {stockIssue ? (
            <p
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              Adjust or remove unavailable items before you order.
            </p>
          ) : null}
          {currencyMismatch ? (
            <p
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              Your cart contains different currencies. Empty it and add the products again.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="cart-customer-name" className="text-[13px] font-medium text-ink">
                Name
              </label>
              <input
                id="cart-customer-name"
                autoComplete="name"
                maxLength={120}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className={fieldClassName()}
                placeholder="Your name"
              />
            </div>
            <div>
              <label htmlFor="cart-customer-phone" className="text-[13px] font-medium text-ink">
                Phone
              </label>
              <input
                id="cart-customer-phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className={fieldClassName()}
                placeholder="Your WhatsApp number"
              />
            </div>
            <div>
              <label
                htmlFor="cart-pickup-location"
                className="text-[13px] font-medium text-ink"
              >
                Pickup location
              </label>
              {locations.length ? (
                <select
                  id="cart-pickup-location"
                  value={pickupLocationId}
                  onChange={(event) => setPickupLocationId(event.target.value)}
                  className={fieldClassName()}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="mt-1.5 min-h-11 border border-line bg-sunken px-3 py-2.5 text-[14px] text-ink-2">
                  {fallbackLocation ?? 'Confirm the pickup location with the shop'}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="text-[13px] font-medium text-ink">
                Preferred pickup date
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-1 bg-sunken p-1 text-[13px]">
                {(['today', 'tomorrow', 'custom'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pickupDate === value}
                    onClick={() => setPickupDate(value)}
                    className={`px-2 py-2.5 font-medium transition-colors ${pickupDate === value ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {value === 'custom'
                      ? 'Pick a date'
                      : value === 'today'
                        ? 'Today'
                        : 'Tomorrow'}
                  </button>
                ))}
              </div>
              {pickupDate === 'custom' ? (
                <input
                  aria-label="Other pickup date"
                  type="date"
                  min={paramariboDate()}
                  value={customDate}
                  onChange={(event) => setCustomDate(event.target.value)}
                  className={fieldClassName()}
                  required
                />
              ) : null}
            </fieldset>
            <div>
              <label htmlFor="cart-customer-notes" className="text-[13px] font-medium text-ink">
                Notes
              </label>
              <textarea
                id="cart-customer-notes"
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1.5 w-full resize-y rounded-tile border border-line bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
                placeholder="Anything the shop should know?"
              />
            </div>
          </div>

          <div className="mt-4">
            {orderUrl ? (
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-primary h-12 w-full text-[15px]"
              >
                <MessageCircle />
                Send order via WhatsApp
              </a>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="lg"
                disabled
                className="h-12 w-full rounded-tile"
              >
                {!whatsappNumber
                  ? 'WhatsApp number not available'
                  : quoteError
                    ? 'Price and stock check failed'
                    : !quoteReady
                      ? 'Checking price and stock…'
                      : stockIssue
                        ? 'Adjust unavailable items'
                        : currencyMismatch
                          ? 'Empty the cart and try again'
                          : 'Choose a pickup date'}
              </Button>
            )}
            <div className="mt-4 rounded-tile bg-sunken p-4 text-[13px] text-ink-2 leading-relaxed">
              <h3 className="font-bold text-[13px] text-ink">What happens next</h3>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>WhatsApp opens with your order written out. Press send there.</li>
                <li>{businessName} replies to confirm price, stock and pickup.</li>
                <li>Your order is only final once {businessName} has confirmed it.</li>
              </ol>
            </div>
            <p className="mt-3 text-center text-[12px] text-ink-3">
              Your cart is saved on this device until you empty it.
            </p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
