'use client';

import { MessageCircle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Link from 'next/link';
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
import { SHOP_PATH, storefrontProductPath } from '@/lib/storefront-domain';
import { whatsappDigits, whatsappLink } from '@/lib/whatsapp';
import { useStoreCart } from './store-cart-provider';
import { formatSrd } from './store-price';

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

/** A single-variant product carries the placeholder variant name "Default"; never show it. */
function variantLabel(name: string): string | null {
  const trimmed = name.trim();
  // "Standaard" / "Default" says nothing to a customer; the SKU beside it is enough.
  return trimmed && !/^(default|standaard|standard|std)$/i.test(trimmed) ? trimmed : null;
}

function fieldClassName() {
  return 'mt-1.5 h-11 w-full rounded-tile border border-line bg-raised px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none';
}

function formatCustomerMoney(
  amountCents: number,
  currency: 'USD' | 'SRD',
  srdRate?: RateMicros,
) {
  if (currency === 'USD' && srdRate && srdRate > 0) {
    return `${formatSrd(fromBase(amountCents, srdRate))} (${formatMoney(amountCents, 'USD')})`;
  }
  return currency === 'SRD' ? formatSrd(amountCents) : formatMoney(amountCents, currency);
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
        `${index + 1}. ${line.productName}${variantLabel(line.variantName) ? ` — ${variantLabel(line.variantName)}` : ''}${line.sku ? ` (SKU ${line.sku})` : ''}`,
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
      <div className="mx-auto w-full max-w-[1320px] px-4 py-16 lg:px-8" aria-live="polite">
        <p className="nx-label text-ink-3">Je winkelwagen wordt geladen…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-4 pt-10 pb-20 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-14 lg:px-8 lg:pt-14 lg:pb-28">
      <section aria-labelledby="cart-heading" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="nx-label text-ink-3">Je bestelling</p>
            <h1
              id="cart-heading"
              className="nx-display mt-2 text-[clamp(36px,5vw,64px)] text-ink"
            >
              Winkelwagen
            </h1>
          </div>
          {lines.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              <Trash2 aria-hidden="true" />
              Winkelwagen legen
            </Button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="mt-8 flex flex-col items-start gap-4 border-line border-y py-14">
            <ShoppingBag aria-hidden="true" className="size-8 text-ink-3" />
            <div>
              <h2 className="nx-display text-[28px] text-ink">Je winkelwagen is leeg</h2>
              <p className="mt-2 max-w-[46ch] text-[15px] text-ink-2">
                Voeg producten toe om een bestelling voor te bereiden via WhatsApp.
              </p>
            </div>
            <Link href={SHOP_PATH as never} className="nx-btn nx-btn-primary">
              Bekijk producten
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
                  className="flex flex-wrap items-center gap-x-5 gap-y-3 py-5"
                >
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
                        ? 'De actuele prijs verschijnt na de controle.'
                        : quoteUnavailable
                          ? 'Voor dit product is nu geen prijs beschikbaar.'
                          : `${formatCustomerMoney(line.priceCents, line.currency, srdRate)} per stuk`}
                    </p>
                    {overStock ? (
                      <p className="mt-1 text-[12px] text-negative">
                        {line.available === 0
                          ? 'Dit product is niet meer beschikbaar. Verwijder het om door te gaan.'
                          : `Er zijn nog maar ${line.available} beschikbaar. Verlaag het aantal om door te gaan.`}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center border border-ink">
                    <button
                      type="button"
                      aria-label={`Aantal van ${line.productName} verlagen`}
                      className="grid size-9 place-items-center text-ink hover:bg-hover disabled:opacity-35"
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
                      aria-label={`Aantal van ${line.productName} verhogen`}
                      className="grid size-9 place-items-center text-ink hover:bg-hover disabled:opacity-35"
                      disabled={
                        !quoteReady || line.quantity >= line.available || line.quantity >= 9999
                      }
                      onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                  <p className="w-28 text-right text-[15px] font-semibold tabular text-ink">
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
                    aria-label={`${line.productName} verwijderen`}
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
          <h2 className="nx-display text-[24px] text-ink">Bestellen via WhatsApp</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
            Stuur je lijst naar {businessName}. Het team bevestigt de voorraad en de definitieve
            prijs.
          </p>

          <div className="mt-5 space-y-2 border-line border-y py-4">
            {quoteReady && !stockIssue ? (
              totals.map(({ currency, amount }) => (
                <div key={currency} className="flex items-baseline justify-between gap-4">
                  <span className="text-[12px] text-ink-3">Totaal (indicatief)</span>
                  <span className="text-[18px] font-semibold tabular text-ink">
                    {formatCustomerMoney(amount, currency, srdRate)}
                  </span>
                </div>
              ))
            ) : quoteReady ? (
              <p className="text-[12px] text-ink-3">
                Verlaag of verwijder niet-beschikbare aantallen om een totaal te zien.
              </p>
            ) : (
              <p className="text-[12px] text-ink-3">
                Het totaal verschijnt zodra de actuele prijzen zijn gecontroleerd.
              </p>
            )}
          </div>

          {quoteReady ? (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Prijs en voorraad zojuist gecontroleerd. De voorraad wordt pas gereserveerd als de
              winkel je bestelling bevestigt.
            </p>
          ) : quoteError ? (
            <div
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              <p>
                Prijs en voorraad konden niet worden gecontroleerd. Probeer het opnieuw voordat
                je je bestelling verstuurt.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 text-negative"
                onClick={() => setQuoteRetry((retry) => retry + 1)}
              >
                Opnieuw controleren
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-3" role="status">
              Prijs en voorraad worden gecontroleerd…
            </p>
          )}

          {stockIssue ? (
            <p
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              Pas niet-beschikbare artikelen aan of verwijder ze voordat je bestelt.
            </p>
          ) : null}
          {currencyMismatch ? (
            <p
              className="mt-3 bg-negative-muted px-3 py-2 text-[12px] text-negative"
              role="alert"
            >
              De winkelwagen bevat verschillende valuta. Leeg hem en voeg de producten opnieuw
              toe.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="cart-customer-name" className="text-[13px] font-medium text-ink">
                Naam
              </label>
              <input
                id="cart-customer-name"
                autoComplete="name"
                maxLength={120}
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className={fieldClassName()}
                placeholder="Je naam"
              />
            </div>
            <div>
              <label htmlFor="cart-customer-phone" className="text-[13px] font-medium text-ink">
                Telefoon
              </label>
              <input
                id="cart-customer-phone"
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className={fieldClassName()}
                placeholder="Je WhatsApp-nummer"
              />
            </div>
            <div>
              <label
                htmlFor="cart-pickup-location"
                className="text-[13px] font-medium text-ink"
              >
                Ophaallocatie
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
                  {fallbackLocation ?? 'Bevestig de ophaallocatie met de winkel'}
                </p>
              )}
            </div>
            <fieldset>
              <legend className="text-[13px] font-medium text-ink">Gewenste ophaaldatum</legend>
              <div className="mt-2 grid grid-cols-3 gap-1 bg-sunken p-1 text-[13px]">
                {(['today', 'tomorrow', 'custom'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={pickupDate === value}
                    onClick={() => setPickupDate(value)}
                    className={`px-2 py-2.5 font-medium transition-colors ${pickupDate === value ? 'bg-ink text-on-ink' : 'text-ink-2 hover:text-ink'}`}
                  >
                    {value === 'custom'
                      ? 'Kies datum'
                      : value === 'today'
                        ? 'Vandaag'
                        : 'Morgen'}
                  </button>
                ))}
              </div>
              {pickupDate === 'custom' ? (
                <input
                  aria-label="Andere ophaaldatum"
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
                Opmerking
              </label>
              <textarea
                id="cart-customer-notes"
                maxLength={500}
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="mt-1.5 w-full resize-y rounded-tile border border-line bg-raised px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none"
                placeholder="Is er iets wat de winkel moet weten?"
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
                Verstuur bestelling via WhatsApp
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
                  ? 'WhatsApp-nummer niet beschikbaar'
                  : quoteError
                    ? 'Controle van prijs en voorraad mislukt'
                    : !quoteReady
                      ? 'Prijs en voorraad worden gecontroleerd…'
                      : stockIssue
                        ? 'Pas niet-beschikbare artikelen aan'
                        : currencyMismatch
                          ? 'Leeg de winkelwagen en probeer opnieuw'
                          : 'Vul je gegevens in'}
              </Button>
            )}
            <p className="mt-2 text-center text-[12px] text-ink-3">
              Je winkelwagen blijft op dit apparaat bewaard tot je hem leegt.
            </p>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
