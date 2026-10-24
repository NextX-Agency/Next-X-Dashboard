'use client';

import { MessageCircle, Minus, Package, Plus, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RateMicros } from '@/lib/fx';
import { firstPickupDay, sameDayPickupAllowed } from '@/lib/pickup-dates';
import {
  applyStoreCartQuote,
  type StoreCartQuoteLine,
  storeCartCount,
  storeCartSubtotal,
} from '@/lib/store-cart';
import { quoteRetryDelayMs } from '@/lib/store-cart-quote-retry';
import {
  cartOrderMessage,
  customerMoney,
  enquiryMessage,
  variantLabel,
} from '@/lib/store-messages';
import { plural } from '@/lib/store-money';
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';
import { useStoreCart } from './store-cart-provider';

type PickupLocation = { id: string; name: string };

/**
 * What the server said about the variants in the cart. It does not depend on quantities, so a quantity
 * change is checked against it on the spot and only a change of products asks the server again.
 */
type CartQuoteState =
  | { variantKey: string; status: 'error' }
  | {
      status: 'ready';
      /** Every variant this answer was asked about. A quote still holds after one of them is removed. */
      variantIds: string[];
      items: StoreCartQuoteLine[];
      unavailableVariantIds: string[];
    };

function quoteCovers(quote: CartQuoteState | null, variantIds: string[]) {
  return quote?.status === 'ready' && variantIds.every((id) => quote.variantIds.includes(id));
}

/** How often the page asks again while it stays open, so a price or stock change shows before ordering. */
const QUOTE_REFRESH_MS = 60_000;

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
  return 'mt-1.5 h-11 w-full rounded-tile border border-line bg-raised px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
}

/** How long a removed line fades out before it leaves the list (matches `.nx-leave`). */
const LEAVE_MS = 200;

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function StoreCartCheckout({
  businessName,
  whatsapp,
  locations,
  fallbackLocation,
  srdRate,
  storefrontSlug,
  sameDayPickupEnabled = false,
  pickupCutoffTime = null,
}: {
  businessName: string;
  whatsapp: string | null;
  locations: PickupLocation[];
  fallbackLocation: string | null;
  srdRate?: RateMicros;
  storefrontSlug: string | null;
  /** The shop's same-day rule (Settings): today is offered only while it is open. */
  sameDayPickupEnabled?: boolean;
  pickupCutoffTime?: string | null;
}) {
  const { lines, ready, setQuantity, removeLine, clear } = useStoreCart();
  const [cartQuote, setCartQuote] = useState<CartQuoteState | null>(null);
  const [quoteTick, setQuoteTick] = useState(0);
  // True while the server has asked us to slow down (429). The last good answer stays on screen.
  const [quoteWaiting, setQuoteWaiting] = useState(false);
  const quoteWaitingRef = useRef(false);
  const rateLimitStreak = useRef(0);
  const [announcement, setAnnouncement] = useState('');
  // The line that is fading out; it is removed from the cart when the fade ends.
  const [leaving, setLeaving] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [pickupLocationId, setPickupLocationId] = useState(locations[0]?.id ?? '');
  const [pickupDate, setPickupDate] = useState<'today' | 'tomorrow' | 'custom'>(() =>
    firstPickupDay({ sameDayPickupEnabled, pickupCutoffTime }),
  );
  const [customDate, setCustomDate] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const variantKey = useMemo(
    () =>
      JSON.stringify(
        lines
          .map((line) => line.variantId)
          .slice()
          .sort(),
      ),
    [lines],
  );
  const readyCartQuote =
    cartQuote?.status === 'ready' &&
    quoteCovers(
      cartQuote,
      lines.map((line) => line.variantId),
    )
      ? cartQuote
      : null;
  const quoteReady = readyCartQuote !== null;
  const quoteError =
    !quoteReady && cartQuote?.status === 'error' && cartQuote.variantKey === variantKey;

  const refreshed = useMemo(
    () =>
      readyCartQuote
        ? applyStoreCartQuote(lines, readyCartQuote.items, readyCartQuote.unavailableVariantIds)
        : null,
    [lines, readyCartQuote],
  );
  const displayLines = refreshed?.lines ?? lines;
  const unavailableIds = refreshed?.unavailableVariantIds ?? [];
  const currencyMismatch =
    quoteReady && displayLines.some((line) => line.currency !== displayLines[0]?.currency);
  const stockIssue =
    quoteReady &&
    displayLines.some((line) => line.available === 0 || line.quantity > line.available);
  const itemCount = storeCartCount(lines);
  const whatsappNumber = whatsappDigits(whatsapp);
  const selectedLocation = locations.find((location) => location.id === pickupLocationId);
  // Re-read each render: a cart left open past the cutoff must not send "today".
  const todayAllowed = sameDayPickupAllowed({ sameDayPickupEnabled, pickupCutoffTime });
  const effectivePickup = pickupDate === 'today' && !todayAllowed ? 'tomorrow' : pickupDate;
  const requestedPickupDate =
    effectivePickup === 'today'
      ? paramariboDate()
      : effectivePickup === 'tomorrow'
        ? paramariboDate(1)
        : customDate;
  const formReady =
    (locations.length === 0 || Boolean(selectedLocation)) && Boolean(requestedPickupDate);

  // Ask the server about the products in the cart: when they change, and again every minute or when the
  // customer comes back to the tab, so the figures they send are the ones the shop shows now.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `quoteTick` is the trigger that asks again.
  useEffect(() => {
    if (!ready || variantKey === '[]') return;

    const controller = new AbortController();
    let retryTimer: number | undefined;
    const setWaiting = (value: boolean) => {
      quoteWaitingRef.current = value;
      setQuoteWaiting(value);
    };
    const timeout = window.setTimeout(() => {
      const items = linesRef.current.map(({ variantId, quantity }) => ({
        variantId,
        quantity,
      }));
      void fetch('/api/v1/storefront/cart/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted) return;
          if (response.status === 429) {
            // Slow down, not broken: keep whatever answer the cart already has, say so quietly, and
            // ask again after the time the server named. After a few in a row, hand the choice back.
            rateLimitStreak.current += 1;
            const delay = quoteRetryDelayMs({
              retryAfter: response.headers.get('Retry-After'),
              attempt: rateLimitStreak.current,
            });
            if (delay === null) {
              rateLimitStreak.current = 0;
              setWaiting(false);
              setCartQuote((previous) =>
                quoteCovers(previous, JSON.parse(variantKey) as string[])
                  ? previous
                  : { variantKey, status: 'error' },
              );
              return;
            }
            setWaiting(true);
            retryTimer = window.setTimeout(() => setQuoteTick((tick) => tick + 1), delay);
            return;
          }
          if (!response.ok) throw new Error('Cart quote could not be refreshed.');
          const payload = (await response.json()) as {
            items: StoreCartQuoteLine[];
            unavailableVariantIds: string[];
          };
          rateLimitStreak.current = 0;
          setWaiting(false);
          setCartQuote({
            status: 'ready',
            variantIds: JSON.parse(variantKey) as string[],
            items: payload.items,
            unavailableVariantIds: payload.unavailableVariantIds,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          rateLimitStreak.current = 0;
          setWaiting(false);
          // A failed background refresh keeps the last good answer for these products; only a cart
          // with no answer at all shows the error.
          setCartQuote((previous) =>
            quoteCovers(previous, JSON.parse(variantKey) as string[])
              ? previous
              : { variantKey, status: 'error' },
          );
        });
    }, 150);

    return () => {
      window.clearTimeout(timeout);
      window.clearTimeout(retryTimer);
      controller.abort();
    };
  }, [quoteTick, ready, variantKey]);

  useEffect(() => {
    if (!ready) return;
    const refresh = () => {
      // While the server has asked for a pause, the scheduled retry is the only thing that asks.
      if (quoteWaitingRef.current) return;
      if (document.visibilityState === 'visible') setQuoteTick((tick) => tick + 1);
    };
    const interval = window.setInterval(refresh, QUOTE_REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [ready]);

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
  const questionUrl = whatsappNumber
    ? whatsappLink(whatsappNumber, enquiryMessage(businessName))
    : null;

  // After something leaves the page, keyboard and screen reader users start again from the heading.
  const settleFocus = useCallback(() => headingRef.current?.focus(), []);

  function changeQuantity(name: string, variantId: string, quantity: number) {
    setQuantity(variantId, quantity);
    setAnnouncement(`${name}: quantity ${quantity}.`);
  }

  function removeItem(name: string, variantId: string) {
    const finish = () => {
      removeLine(variantId);
      setLeaving(null);
      setAnnouncement(`${name} removed from your cart.`);
      settleFocus();
    };
    // A short fade first, unless the visitor asked for less motion.
    if (leaving || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (!leaving) finish();
      return;
    }
    setLeaving(variantId);
    window.setTimeout(finish, LEAVE_MS);
  }

  function emptyCart() {
    clear();
    setAnnouncement('Your cart is empty.');
    settleFocus();
  }

  /** One press: drop what is sold out or no longer listed, lower the rest to what is in stock. */
  function matchStock() {
    for (const line of displayLines) {
      if (line.available === 0) removeLine(line.variantId);
      else if (line.quantity > line.available) setQuantity(line.variantId, line.available);
    }
    setAnnouncement('Your cart now matches what is in stock.');
    settleFocus();
  }

  if (!ready) {
    return (
      <div className="mx-auto min-h-[70svh] w-full max-w-[1320px] px-4 py-16 lg:px-8">
        <p role="status" className="nx-label text-ink-3">
          Loading your cart…
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-[70svh] w-full max-w-[1320px] content-start gap-10 px-4 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-8 lg:pt-14 lg:pb-28">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <section aria-labelledby="cart-heading" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="nx-label text-ink-3">
              {lines.length ? plural(itemCount, 'item') : 'Your order'}
            </p>
            <h1
              id="cart-heading"
              ref={headingRef}
              tabIndex={-1}
              className="nx-display mt-2 text-[clamp(36px,5vw,64px)] text-ink focus:outline-none"
            >
              Cart
            </h1>
          </div>
          {lines.length ? (
            <button
              type="button"
              onClick={emptyCart}
              className={`nx-btn nx-btn-line nx-btn-sm ${focusRing}`}
            >
              <Trash2 aria-hidden="true" />
              Empty cart
            </button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="mt-8 border-line border-y py-14">
            <h2 className="nx-display text-[28px] text-ink">Your cart is empty</h2>
            <p className="mt-2 max-w-[46ch] text-[15px] text-ink-2 leading-relaxed">
              Add products in the shop. The cart turns them into one WhatsApp message for NextX.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
                Go to the shop
              </Link>
              {questionUrl ? (
                <a
                  href={questionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nx-btn nx-btn-line"
                >
                  <MessageCircle aria-hidden="true" />
                  Ask on WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <p className="mt-4 max-w-[60ch] text-[14px] text-ink-2 leading-relaxed">
              An order is final only once NextX confirms price and stock on WhatsApp.
            </p>
            <div className="mt-6 divide-y divide-line border-line border-y">
              {displayLines.map((line, lineIndex) => {
                const label = variantLabel(line.variantName);
                const fullName = `${line.productName}${label ? `, ${label}` : ''}`;
                const gone = quoteReady && unavailableIds.includes(line.variantId);
                const soldOut = quoteReady && (gone || line.available === 0);
                const overStock = quoteReady && !soldOut && line.quantity > line.available;
                const lineProblem = soldOut || overStock;
                const noteId = `cart-note-${line.variantId}`;
                return (
                  <article
                    key={line.variantId}
                    className={`nx-enter grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-5${
                      leaving === line.variantId ? ' nx-leave' : ''
                    }`}
                    style={{ '--i': Math.min(lineIndex, 4) } as CSSProperties}
                  >
                    <div className="col-span-3 flex min-w-0 items-start gap-4">
                      <div className="relative size-[72px] shrink-0 overflow-hidden rounded-[12px] bg-sunken">
                        {line.imageUrl ? (
                          <Image
                            src={line.imageUrl}
                            alt=""
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
                        <Link
                          href={
                            storefrontProductPath(storefrontSlug, line.productSlug) as never
                          }
                          className={`text-[16px] font-semibold text-ink hover:text-accent ${focusRing}`}
                        >
                          {line.productName}
                        </Link>
                        <p className="mt-0.5 text-[12px] text-ink-3">
                          {[label, line.sku].filter(Boolean).join(' · ')}
                        </p>
                        <p className="mt-2 text-[13px] tabular text-ink-2">
                          {!quoteReady
                            ? 'Checking the current price…'
                            : gone
                              ? 'No longer listed'
                              : `${customerMoney(line.priceCents, line.currency, srdRate)} each`}
                        </p>
                        {lineProblem ? (
                          <p
                            id={noteId}
                            className="mt-1 text-[13px] font-medium text-[#b42d22]"
                          >
                            {soldOut
                              ? gone
                                ? 'No longer available from NextX. Remove it to continue.'
                                : 'Sold out. Remove it to continue.'
                              : `Only ${line.available} in stock. Lower the quantity to continue.`}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center border border-ink">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${fullName}`}
                        className={`grid size-11 place-items-center text-ink nx-press hover:bg-hover disabled:opacity-35 sm:size-9 ${focusRing}`}
                        disabled={line.quantity <= 1}
                        onClick={() =>
                          changeQuantity(fullName, line.variantId, line.quantity - 1)
                        }
                      >
                        <Minus aria-hidden="true" className="size-4" />
                      </button>
                      <span className="min-w-8 text-center text-[14px] tabular text-ink">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${fullName}`}
                        className={`grid size-11 place-items-center text-ink nx-press hover:bg-hover disabled:opacity-35 sm:size-9 ${focusRing}`}
                        disabled={
                          !quoteReady ||
                          line.quantity >= line.available ||
                          line.quantity >= 9999
                        }
                        onClick={() =>
                          changeQuantity(fullName, line.variantId, line.quantity + 1)
                        }
                      >
                        <Plus aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                    <p className="text-right text-[15px] font-semibold tabular text-ink">
                      {quoteReady && !lineProblem
                        ? customerMoney(
                            storeCartSubtotal([line], line.currency),
                            line.currency,
                            srdRate,
                          )
                        : '—'}
                    </p>
                    <button
                      type="button"
                      aria-label={`Remove ${fullName} from the cart`}
                      className={`grid size-11 place-items-center nx-press text-ink-2 hover:text-[#b42d22] ${focusRing}`}
                      onClick={() => removeItem(fullName, line.variantId)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {lines.length ? (
        <aside
          aria-labelledby="cart-summary-heading"
          className="h-fit border-ink border-t-2 bg-raised p-5 sm:p-6 lg:sticky lg:top-24"
        >
          <h2 id="cart-summary-heading" className="nx-display text-[24px] text-ink">
            Send the order
          </h2>

          <div className="mt-5 space-y-2 border-line border-y py-4">
            {quoteReady && !stockIssue ? (
              totals.map(({ currency, amount }) => (
                <div key={currency} className="flex items-baseline justify-between gap-4">
                  <span className="text-[13px] text-ink-2">Estimated total</span>
                  <span className="text-[20px] font-semibold tabular text-ink">
                    {customerMoney(amount, currency, srdRate)}
                  </span>
                </div>
              ))
            ) : quoteReady ? (
              <p className="text-[13px] text-ink-2">
                The total shows once every item is in stock.
              </p>
            ) : (
              <p className="text-[13px] text-ink-2">
                The total shows once prices have been checked.
              </p>
            )}
          </div>

          {quoteWaiting && !quoteError ? (
            <p className="mt-3 text-[13px] text-ink-2" role="status">
              Checking prices again in a moment.
              {quoteReady ? ' The figures below are from the last check.' : ''}
            </p>
          ) : quoteReady ? (
            <p className="mt-3 text-[13px] text-ink-2" role="status">
              Price and stock just checked. Nothing is reserved until NextX confirms your order.
            </p>
          ) : quoteError ? (
            <div
              className="mt-3 bg-[#fbe9e6] px-3 py-3 text-[13px] text-[#b42d22]"
              role="alert"
            >
              <p>Price and stock could not be checked. Try again before you send the order.</p>
              <button
                type="button"
                onClick={() => setQuoteTick((tick) => tick + 1)}
                className={`mt-2 min-h-11 font-semibold underline underline-offset-2 ${focusRing}`}
              >
                Check again
              </button>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-ink-2" role="status">
              Checking price and stock…
            </p>
          )}

          {stockIssue ? (
            <div
              className="mt-3 bg-[#fbe9e6] px-3 py-3 text-[13px] text-[#b42d22]"
              role="alert"
            >
              <p>Some items are sold out or above what is in stock.</p>
              <button
                type="button"
                onClick={matchStock}
                className={`mt-2 min-h-11 font-semibold underline underline-offset-2 ${focusRing}`}
              >
                Update the cart to match stock
              </button>
            </div>
          ) : null}
          {currencyMismatch ? (
            <p className="mt-3 bg-[#fbe9e6] px-3 py-3 text-[13px] text-[#b42d22]" role="alert">
              The cart mixes currencies. Empty it and add the products again.
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
                placeholder="Optional"
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
                placeholder="Optional"
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
                <p
                  id="cart-pickup-location"
                  className="mt-1.5 min-h-11 border border-line bg-sunken px-3 py-2.5 text-[14px] text-ink-2"
                >
                  {fallbackLocation ?? 'NextX confirms the pickup location on WhatsApp'}
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
                    aria-pressed={effectivePickup === value}
                    disabled={value === 'today' && !todayAllowed}
                    title={
                      value === 'today' && !todayAllowed
                        ? 'Same-day pickup is not available right now'
                        : undefined
                    }
                    onClick={() => setPickupDate(value)}
                    className={`min-h-11 px-2 font-medium transition-colors ${focusRing} disabled:cursor-not-allowed disabled:opacity-40 ${effectivePickup === value ? 'bg-cta text-cta-fg' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {value === 'custom'
                      ? 'Pick a date'
                      : value === 'today'
                        ? 'Today'
                        : 'Tomorrow'}
                  </button>
                ))}
              </div>
              {effectivePickup === 'custom' ? (
                <input
                  aria-label="Other pickup date"
                  type="date"
                  min={todayAllowed ? paramariboDate() : paramariboDate(1)}
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
                className="mt-1.5 w-full resize-y rounded-tile border border-line bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="mt-5">
            {orderUrl ? (
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="nx-btn nx-btn-primary h-12 w-full text-[15px]"
              >
                <MessageCircle aria-hidden="true" />
                Send order via WhatsApp
              </a>
            ) : (
              <button
                type="button"
                disabled
                className="nx-btn nx-btn-primary h-12 w-full text-[15px]"
              >
                {!whatsappNumber
                  ? 'Ordering is unavailable right now'
                  : quoteError
                    ? 'Price and stock not checked'
                    : !quoteReady
                      ? 'Checking price and stock…'
                      : stockIssue
                        ? 'Adjust unavailable items'
                        : currencyMismatch
                          ? 'Empty the cart and start again'
                          : 'Choose a pickup date'}
              </button>
            )}

            <ol className="mt-6 space-y-3 border-line border-t pt-5 text-[13px] text-ink-2 leading-relaxed">
              <li className="flex gap-3">
                <span aria-hidden="true" className="tabular font-semibold text-ink">
                  01
                </span>
                <span>WhatsApp opens with your order written out. Press send there.</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="tabular font-semibold text-ink">
                  02
                </span>
                <span>{businessName} replies to confirm price, stock and pickup.</span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden="true" className="tabular font-semibold text-ink">
                  03
                </span>
                <span>The order is final only after that confirmation.</span>
              </li>
            </ol>
            <p className="mt-5 text-[12px] text-ink-3 leading-relaxed">
              The cart stays on this device until you empty it.
            </p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
