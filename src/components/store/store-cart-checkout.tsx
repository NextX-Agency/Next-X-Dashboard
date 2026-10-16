'use client';

import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { fromBase, type RateMicros } from '@/lib/fx';
import { formatMoney } from '@/lib/money';
import {
  applyStoreCartQuote,
  type StoreCartLine,
  type StoreCartQuoteLine,
  storeCartSubtotal,
} from '@/lib/store-cart';
import { storefrontProductPath } from '@/lib/storefront-domain';
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

function formatPickupDate(value: string) {
  const [year = 0, month = 1, day = 1] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 15));
  return new Intl.DateTimeFormat('nl-SR', {
    timeZone: 'America/Paramaribo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function fieldClassName() {
  return 'mt-1 h-10 w-full rounded-control border border-line bg-base px-3 text-[13px] text-ink placeholder:text-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
}

function formatCustomerMoney(
  amountCents: number,
  currency: 'USD' | 'SRD',
  srdRate?: RateMicros,
) {
  if (currency === 'USD' && srdRate && srdRate > 0) {
    return `${formatMoney(fromBase(amountCents, srdRate), 'SRD', { bare: true })} SRD (${formatMoney(amountCents, 'USD')})`;
  }
  return formatMoney(amountCents, currency);
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
    const message = [
      `Hallo ${businessName}, ik wil graag het volgende bestellen:`,
      '',
      ...displayLines.flatMap((line, index) => [
        `${index + 1}. ${line.productName} — ${line.variantName}${line.sku ? ` (SKU ${line.sku})` : ''}`,
        `   ${line.quantity} × ${formatCustomerMoney(line.priceCents, line.currency, srdRate)} = ${formatCustomerMoney(storeCartSubtotal([line], line.currency), line.currency, srdRate)}`,
      ]),
      '',
      ...totals.map(
        ({ currency, amount }) =>
          `Totaal (indicatief): ${formatCustomerMoney(amount, currency, srdRate)}`,
      ),
      '',
      ...(customerName.trim() ? [`Naam: ${customerName.trim()}`] : []),
      ...(customerPhone.trim() ? [`Telefoon: ${customerPhone.trim()}`] : []),
      `Ophaallocatie: ${selectedLocation?.name ?? fallbackLocation ?? 'Graag met mij afstemmen'}`,
      `Voorkeursdatum: ${formatPickupDate(requestedPickupDate)}`,
      ...(notes.trim() ? [`Opmerking: ${notes.trim()}`] : []),
      '',
      'Graag de actuele voorraad en definitieve prijs bevestigen.',
      'De voorraad is gecontroleerd maar wordt pas na bevestiging door de winkel gereserveerd.',
    ];
    return message.join('\n');
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
    totals,
  ]);
  const orderUrl =
    whatsappMessage && whatsappNumber ? whatsappLink(whatsappNumber, whatsappMessage) : null;

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-12 lg:px-6" aria-live="polite">
        <p className="text-[14px] text-ink-3">Loading your saved cart…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-6">
      <section aria-labelledby="cart-heading" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.08em] text-accent uppercase">
              Your basket
            </p>
            <h1
              id="cart-heading"
              className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-ink"
            >
              Cart
            </h1>
          </div>
          {lines.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <Trash2 aria-hidden="true" />
              Clear cart
            </Button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="mt-6 rounded-card border border-line-subtle bg-white p-8 text-center sm:p-12">
            <ShoppingBag aria-hidden="true" className="mx-auto size-8 text-ink-4" />
            <h2 className="mt-4 text-lg font-semibold text-ink">Your cart is empty</h2>
            <p className="mt-1 text-[13px] text-ink-3">
              Add products from the catalog to prepare a WhatsApp order.
            </p>
            <a
              href="/#catalog"
              className="mt-5 inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13px] font-medium text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Browse products
            </a>
          </div>
        ) : (
          <div className="mt-6 divide-y divide-line-subtle rounded-card border border-line-subtle bg-white">
            {displayLines.map((line) => {
              const quoteUnavailable =
                quoteReady && readyCartQuote.unavailableVariantIds.includes(line.variantId);
              const overStock =
                quoteReady &&
                (quoteUnavailable || line.available === 0 || line.quantity > line.available);
              return (
                <article
                  key={line.variantId}
                  className="flex flex-wrap items-center gap-4 p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={storefrontProductPath(storefrontSlug, line.productSlug)}
                      className="font-semibold text-ink hover:text-accent"
                    >
                      {line.productName}
                    </a>
                    <p className="mt-0.5 text-[12px] text-ink-3">
                      {line.variantName}
                      {line.sku ? ` · ${line.sku}` : ''}
                    </p>
                    <p className="mt-2 text-[13px] tabular text-ink-2">
                      {!quoteReady
                        ? 'Current price will appear after the check.'
                        : quoteUnavailable
                          ? 'No current public price is available for this option.'
                          : `${formatCustomerMoney(line.priceCents, line.currency, srdRate)} each`}
                    </p>
                    {overStock ? (
                      <p className="mt-1 text-[12px] text-negative">
                        {line.available === 0
                          ? 'This option is no longer available. Remove it to continue.'
                          : `Only ${line.available} currently available. Reduce the quantity to continue.`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 rounded-control border border-line p-1">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.productName} quantity`}
                      className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-hover disabled:opacity-40"
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
                      aria-label={`Increase ${line.productName} quantity`}
                      className="grid size-8 place-items-center rounded-control text-ink-3 hover:bg-hover disabled:opacity-40"
                      disabled={
                        !quoteReady || line.quantity >= line.available || line.quantity >= 9999
                      }
                      onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <p className="w-24 text-right text-[14px] font-semibold tabular text-ink">
                    {quoteReady && !overStock
                      ? formatCustomerMoney(
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
        <aside className="h-fit rounded-card border border-line-subtle bg-white p-5 lg:sticky lg:top-6">
          <h2 className="text-[16px] font-semibold text-ink">WhatsApp checkout</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Send your item list to {businessName}. The team will confirm stock and the final
            price.
          </p>

          <div className="mt-4 space-y-2 border-y border-line-subtle py-3">
            {quoteReady && !stockIssue ? (
              totals.map(({ currency, amount }) => (
                <div key={currency} className="flex items-baseline justify-between gap-4">
                  <span className="text-[12px] text-ink-3">Estimated total</span>
                  <span className="text-[15px] font-semibold tabular text-ink">
                    {formatCustomerMoney(amount, currency, srdRate)}
                  </span>
                </div>
              ))
            ) : quoteReady ? (
              <p className="text-[12px] text-ink-3">
                Reduce or remove unavailable quantities to see an estimated total.
              </p>
            ) : (
              <p className="text-[12px] text-ink-3">
                Estimated total will appear after current prices are checked.
              </p>
            )}
          </div>

          {quoteReady ? (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Current price and availability checked just now. Stock is not reserved until the
              store confirms.
            </p>
          ) : quoteError ? (
            <div
              className="mt-3 rounded-control bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              <p>
                Could not check current prices and availability. Retry before sending your
                order.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 text-negative"
                onClick={() => setQuoteRetry((retry) => retry + 1)}
              >
                Retry price and stock check
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Checking current price and availability…
            </p>
          )}

          {stockIssue ? (
            <p
              className="mt-3 rounded-control bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              Update or remove unavailable items before sending this order.
            </p>
          ) : null}
          {currencyMismatch ? (
            <p
              className="mt-3 rounded-control bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              The cart contains different currencies. Clear it and add items from this
              storefront again.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="cart-customer-name"
                className="text-[12px] font-medium text-ink-2"
              >
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
              <label
                htmlFor="cart-customer-phone"
                className="text-[12px] font-medium text-ink-2"
              >
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
                className="text-[12px] font-medium text-ink-2"
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
                <p className="mt-1 min-h-10 rounded-control border border-line bg-sunken px-3 py-2.5 text-[13px] text-ink-2">
                  {fallbackLocation ?? 'Confirm the pickup location with the store'}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="text-[12px] font-medium text-ink-2">
                Preferred pickup date
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-control bg-sunken p-1 text-[12px]">
                {(['today', 'tomorrow', 'custom'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pickupDate === value}
                    onClick={() => setPickupDate(value)}
                    className={`rounded-control px-2 py-2 capitalize transition-colors ${pickupDate === value ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
                  >
                    {value === 'custom' ? 'Choose date' : value}
                  </button>
                ))}
              </div>
              {pickupDate === 'custom' ? (
                <input
                  aria-label="Custom pickup date"
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
              <label
                htmlFor="cart-customer-notes"
                className="text-[12px] font-medium text-ink-2"
              >
                Notes
              </label>
              <textarea
                id="cart-customer-notes"
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1 w-full resize-y rounded-control border border-line bg-base px-3 py-2 text-[13px] text-ink placeholder:text-ink-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                placeholder="Anything the store should know?"
              />
            </div>
          </div>

          <div className="mt-4">
            {orderUrl ? (
              <a
                href={orderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#25D366] px-5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-[0.94] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Send order on WhatsApp
              </a>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="lg"
                disabled
                className="h-11 w-full rounded-full"
              >
                {!whatsappNumber
                  ? 'WhatsApp number unavailable'
                  : quoteError
                    ? 'Price and stock check failed'
                    : !quoteReady
                      ? 'Checking price and availability…'
                      : stockIssue
                        ? 'Update unavailable items'
                        : currencyMismatch
                          ? 'Clear cart and try again'
                          : 'Complete the checkout details'}
              </Button>
            )}
            <p className="mt-2 text-center text-[11px] text-ink-4">
              Your cart stays saved on this device until you clear it.
            </p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
