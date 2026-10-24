'use client';

import {
  AlertTriangle,
  ChevronRight,
  Minus,
  PauseCircle,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { RateMicros } from '@/lib/fx';
import type { CurrencyCode } from '@/lib/money';
import { parseMoney, toDecimalString } from '@/lib/money';
import type { Cart, CartTotals, DiscountInput, PricedLine } from '@/lib/pos/cart';
import { formatPos } from '@/lib/pos/format';
import { lineMargin, marginMessage } from '@/lib/pos/margin';
import type { PosCustomer } from '@/lib/pos/types';
import { ProductPhoto } from './pos-image';

const inputClass =
  'h-11 min-w-0 rounded-control border border-line bg-raised px-3 text-[16px] text-ink outline-none placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';

const iconButton =
  'grid size-11 shrink-0 place-items-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:opacity-40';

/* ── One line ────────────────────────────────────────────────────────────── */

function QuantityControl({
  name,
  value,
  onChange,
}: {
  name: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isFinite(parsed) && parsed >= 1) onChange(parsed);
  }

  return (
    <div className="inline-flex items-center rounded-control border border-line bg-raised">
      <button
        type="button"
        aria-label={`Fewer ${name}`}
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
        className={cn(iconButton, 'rounded-r-none')}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <input
        aria-label={`Quantity of ${name}`}
        inputMode="numeric"
        autoComplete="off"
        value={draft ?? String(value)}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 5))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
        className="tabular h-11 w-12 min-w-0 bg-transparent text-center text-[16px] text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      />
      <button
        type="button"
        aria-label={`More ${name}`}
        onClick={() => onChange(value + 1)}
        className={cn(iconButton, 'rounded-l-none')}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

function PriceControl({
  name,
  currency,
  unitCents,
  custom,
  onChange,
}: {
  name: string;
  currency: CurrencyCode;
  unitCents: number;
  custom: boolean;
  onChange: (cents: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function start() {
    setDraft(unitCents > 0 ? toDecimalString(unitCents) : '');
    setProblem(null);
    setEditing(true);
  }

  function commit() {
    let cents: number;
    try {
      cents = draft.trim() === '' ? 0 : parseMoney(draft);
    } catch {
      cents = 0;
    }
    if (cents <= 0) {
      setProblem('Enter a price above zero.');
      return;
    }
    onChange(cents);
    setEditing(false);
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={start}
          aria-label={`Change price of ${name}, now ${formatPos(unitCents, currency)}`}
          className="-mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 text-[13px] text-ink-2 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="tabular">{formatPos(unitCents, currency)}</span>
          <span className="text-ink-4">each</span>
          <Pencil aria-hidden="true" className="size-3 text-ink-4" />
          {custom ? (
            <span className="rounded-control bg-accent-muted px-1 text-[11px] text-accent">
              custom
            </span>
          ) : null}
        </button>
      </span>
    );
  }

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        commit();
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          // biome-ignore lint/a11y/noAutofocus: the person just chose to edit this price.
          autoFocus
          aria-label={`Price of ${name} in ${currency}`}
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setDraft(event.target.value);
            setProblem(null);
          }}
          className={cn(inputClass, 'tabular w-28 text-right')}
        />
        <Button type="submit" variant="primary" size="sm" className="h-11">
          Set
        </Button>
        {custom ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11"
            onClick={() => {
              onChange(null);
              setEditing(false);
            }}
          >
            List price
          </Button>
        ) : null}
        <button
          type="button"
          aria-label="Cancel price change"
          onClick={() => setEditing(false)}
          className={iconButton}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      {problem ? (
        <p role="alert" className="text-[12px] text-negative">
          {problem}
        </p>
      ) : null}
    </form>
  );
}

function CartLineRow({
  row,
  currency,
  rateMicros,
  fresh,
  stockWarning,
  onQuantity,
  onRemove,
  onOverride,
  onNote,
}: {
  row: PricedLine;
  currency: CurrencyCode;
  rateMicros: RateMicros;
  fresh: boolean;
  stockWarning: string | null;
  onQuantity: (lineKey: string, quantity: number) => void;
  onRemove: (lineKey: string) => void;
  onOverride: (lineKey: string, cents: number | null) => void;
  onNote: (lineKey: string, note: string) => void;
}) {
  const { line, sellable } = row;
  const [noteOpen, setNoteOpen] = useState(line.note !== '');
  const label = sellable.option ? `${sellable.name}, ${sellable.option}` : sellable.name;
  const margin = lineMargin({
    sellable,
    quantity: line.quantity,
    unitPriceCents: row.unitCents,
    currency,
    rateMicros,
  });
  const marginText = marginMessage(margin.level, 'line');

  return (
    <li className={cn('px-3 py-2.5', fresh && 'pos-settle')}>
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 block size-11 shrink-0 overflow-hidden rounded-control bg-white">
          <ProductPhoto
            key={sellable.image?.url ?? 'none'}
            image={sellable.image}
            sizes="44px"
            className="p-0.5"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-[14px] text-ink leading-5">
            {sellable.name}
          </p>
          {sellable.option ? (
            <p className="truncate text-[12px] text-ink-3">{sellable.option}</p>
          ) : null}
          <PriceControl
            name={label}
            currency={currency}
            unitCents={row.unitCents}
            custom={line.overrideCents !== null}
            onChange={(cents) => onOverride(line.key, cents)}
          />
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <p className="tabular font-bold text-[15px] text-ink">
            {formatPos(row.lineCents, currency)}
          </p>
          <button
            type="button"
            aria-label={`Remove ${label} from the cart`}
            onClick={() => onRemove(line.key)}
            className={cn(iconButton, 'mt-0.5 text-ink-3 hover:text-negative')}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-14">
        <QuantityControl
          name={label}
          value={line.quantity}
          onChange={(next) => onQuantity(line.key, next)}
        />
        {noteOpen ? null : (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="inline-flex min-h-11 items-center px-1 text-[13px] text-ink-3 underline-offset-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            Add note
          </button>
        )}
      </div>

      {noteOpen ? (
        <div className="mt-1 pl-14">
          <input
            aria-label={`Note for ${label}`}
            placeholder="Note (serial number, condition)"
            maxLength={200}
            autoComplete="off"
            value={line.note}
            onChange={(event) => onNote(line.key, event.target.value)}
            className={cn(inputClass, 'w-full')}
          />
        </div>
      ) : null}

      {stockWarning || marginText ? (
        <ul className="mt-1.5 flex flex-col gap-1 pl-14">
          {stockWarning ? (
            <li className="flex items-start gap-1.5 text-[12px] text-warning">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {stockWarning}
            </li>
          ) : null}
          {marginText ? (
            <li
              className={cn(
                'flex items-start gap-1.5 text-[12px]',
                margin.level === 'below-cost' ? 'text-negative' : 'text-warning',
              )}
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {marginText}
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

/* ── Discount ────────────────────────────────────────────────────────────── */

function DiscountEditor({
  currency,
  discount,
  reason,
  grossCents,
  discountCents,
  onChange,
}: {
  currency: CurrencyCode;
  discount: DiscountInput | null;
  reason: string;
  grossCents: number;
  discountCents: number;
  onChange: (discount: DiscountInput | null, reason: string) => void;
}) {
  const [open, setOpen] = useState(discount !== null);
  const mode = discount?.mode ?? 'amount';

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={grossCents <= 0}
        className="inline-flex min-h-11 items-center text-[13px] text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
      >
        Add discount
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-control border border-line bg-inset p-2.5">
      <div className="flex items-center justify-between gap-2">
        <fieldset className="inline-flex rounded-control border border-line bg-raised p-0.5">
          <legend className="sr-only">Discount type</legend>
          {(['amount', 'percent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => onChange({ mode: option, value: discount?.value ?? '' }, reason)}
              className={cn(
                'h-11 min-w-20 rounded-[6px] px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                mode === option ? 'bg-accent text-accent-fg' : 'text-ink-2 hover:bg-hover',
              )}
            >
              {option === 'amount' ? currency : '%'}
            </button>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={() => {
            onChange(null, '');
            setOpen(false);
          }}
          className="inline-flex min-h-11 items-center px-1 text-[13px] text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
        >
          Remove discount
        </button>
      </div>
      <div className="flex items-center gap-2">
        <input
          aria-label={mode === 'amount' ? `Discount amount in ${currency}` : 'Discount percent'}
          inputMode="decimal"
          autoComplete="off"
          placeholder={mode === 'amount' ? '0' : '0%'}
          value={discount?.value ?? ''}
          onChange={(event) => onChange({ mode, value: event.target.value }, reason)}
          className={cn(inputClass, 'tabular w-28 text-right')}
        />
        <span className="tabular text-[13px] text-ink-3">
          {discountCents > 0
            ? `takes off ${formatPos(discountCents, currency)}`
            : 'no discount yet'}
        </span>
      </div>
      <input
        aria-label="Reason for the discount (optional)"
        placeholder="Reason (optional)"
        maxLength={120}
        autoComplete="off"
        value={reason}
        onChange={(event) => onChange(discount, event.target.value)}
        className={cn(inputClass, 'w-full')}
      />
    </div>
  );
}

/* ── The cart ───────────────────────────────────────────────────────────── */

export function CartView({
  cart,
  totals,
  rateMicros,
  hasRate,
  rateText,
  rateStale,
  customer,
  sellers,
  freshLineKey,
  lineStockWarnings,
  orderWarnings,
  orderMarginText,
  blocker,
  canCharge,
  chargeHint,
  onClose,
  onQuantity,
  onRemove,
  onOverride,
  onNote,
  onCurrency,
  onCustomer,
  onSeller,
  onDiscount,
  onOrderNote,
  onPark,
  onClear,
  onCharge,
}: {
  cart: Cart;
  totals: CartTotals;
  rateMicros: RateMicros;
  hasRate: boolean;
  rateText: string;
  rateStale: boolean;
  customer: PosCustomer | null;
  sellers: { id: string; label: string; active: boolean }[];
  freshLineKey: string | null;
  lineStockWarnings: ReadonlyMap<string, string>;
  orderWarnings: string[];
  orderMarginText: { text: string; severe: boolean } | null;
  blocker: string | null;
  canCharge: boolean;
  chargeHint: string | null;
  onClose: () => void;
  onQuantity: (lineKey: string, quantity: number) => void;
  onRemove: (lineKey: string) => void;
  onOverride: (lineKey: string, cents: number | null) => void;
  onNote: (lineKey: string, note: string) => void;
  onCurrency: (currency: CurrencyCode) => void;
  onCustomer: () => void;
  onSeller: (id: string | null) => void;
  onDiscount: (discount: DiscountInput | null, reason: string) => void;
  onOrderNote: (note: string) => void;
  onPark: () => void;
  onClear: () => void;
  onCharge: () => void;
}) {
  const { currency } = cart;
  const activeSellers = sellers.filter((seller) => seller.active);
  const empty = totals.lines.length === 0;
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || cart.note !== '';

  return (
    <>
      <header className="shrink-0 border-line-subtle border-b">
        <div className="relative flex items-center justify-between gap-2 px-3 pt-3 pb-1 lg:pt-2.5">
          <span
            aria-hidden="true"
            className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line-strong/60 lg:hidden"
          />
          <h2 className="flex items-baseline gap-2 font-medium text-[16px] text-ink">
            Cart
            <span className="font-normal text-[13px] text-ink-3">
              {totals.units} item{totals.units === 1 ? '' : 's'}
            </span>
          </h2>
          <div className="flex items-center">
            <Button type="button" variant="ghost" size="sm" className="h-11" onClick={onPark}>
              <PauseCircle aria-hidden="true" /> Park
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11"
              disabled={empty}
              onClick={onClear}
            >
              Clear
            </Button>
            <button
              type="button"
              aria-label="Close the cart"
              onClick={onClose}
              className={cn(iconButton, 'lg:hidden')}
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 pt-1 pb-3">
          <button
            type="button"
            onClick={onCustomer}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-control border border-line bg-raised px-3 text-left transition-colors hover:border-line-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <UserRound aria-hidden="true" className="size-4 shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-[14px] text-ink">
                {customer ? customer.name : 'Walk-in customer'}
              </span>
              <span className="block truncate text-[12px] text-ink-3">
                {customer
                  ? (customer.phone ?? customer.code)
                  : 'Tap to choose or add a customer'}
              </span>
            </span>
            <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-4" />
          </button>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <fieldset className="inline-flex rounded-control border border-line bg-raised p-0.5">
              <legend className="sr-only">Sale currency</legend>
              {(['SRD', 'USD'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={currency === option}
                  disabled={option === 'SRD' && !hasRate}
                  onClick={() => onCurrency(option)}
                  className={cn(
                    'h-11 min-w-16 rounded-[6px] px-3 font-medium text-[14px] transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40',
                    currency === option
                      ? 'bg-accent text-accent-fg'
                      : 'text-ink-2 hover:bg-hover',
                  )}
                >
                  {option}
                </button>
              ))}
            </fieldset>
            <p
              className={cn(
                'min-w-0 flex-1 text-[12px]',
                rateStale ? 'text-warning' : 'text-ink-3',
              )}
            >
              {rateText}
            </p>
          </div>

          {activeSellers.length > 0 ? (
            <div className="flex items-center gap-2">
              <label htmlFor="pos-seller" className="shrink-0 text-[12px] text-ink-3">
                Sold by
              </label>
              <select
                id="pos-seller"
                value={cart.sellerId ?? ''}
                onChange={(event) => onSeller(event.target.value || null)}
                className={cn(inputClass, 'h-11 min-w-0 flex-1 appearance-none pr-8')}
              >
                <option value="">No seller (no commission)</option>
                {activeSellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {empty ? (
          <div className="grid h-full min-h-40 place-items-center px-6 py-8 text-center">
            <div>
              <p className="font-medium text-[15px] text-ink">The cart is empty</p>
              <p className="mt-1 text-[13px] text-ink-3">
                Tap a product, or type or scan a SKU in the search box.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {totals.lines.map((row) => (
              <CartLineRow
                key={row.line.key}
                row={row}
                currency={currency}
                rateMicros={rateMicros}
                fresh={freshLineKey === row.line.sellableKey}
                stockWarning={lineStockWarnings.get(row.line.key) ?? null}
                onQuantity={onQuantity}
                onRemove={onRemove}
                onOverride={onOverride}
                onNote={onNote}
              />
            ))}
          </ul>
        )}
        {totals.missing.length > 0 ? (
          <p role="alert" className="px-3 py-2 text-[13px] text-negative">
            {totals.missing.length} item{totals.missing.length === 1 ? ' is' : 's are'} no
            longer sold and left out of the total.
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => {
                for (const line of totals.missing) onRemove(line.key);
              }}
            >
              Remove
            </button>
          </p>
        ) : null}
      </div>

      <footer className="shrink-0 border-line-subtle border-t bg-raised px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {empty ? null : (
          <div className="mb-1 flex flex-col gap-2">
            {showNote ? (
              <div>
                <label className="sr-only" htmlFor="pos-order-note">
                  Note for the whole sale
                </label>
                <input
                  id="pos-order-note"
                  placeholder="Note for the sale (optional)"
                  maxLength={300}
                  autoComplete="off"
                  value={cart.note}
                  onChange={(event) => onOrderNote(event.target.value)}
                  className={cn(inputClass, 'w-full')}
                />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-4">
              <DiscountEditor
                currency={currency}
                discount={cart.discount}
                reason={cart.discountReason}
                grossCents={totals.grossCents}
                discountCents={totals.discountCents}
                onChange={onDiscount}
              />
              {showNote ? null : (
                <button
                  type="button"
                  onClick={() => setNoteOpen(true)}
                  className="inline-flex min-h-11 items-center text-[13px] text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Add note
                </button>
              )}
            </div>
          </div>
        )}

        <dl className="flex flex-col gap-0.5 text-[13px]">
          {totals.discountCents > 0 ? (
            <>
              <div className="flex justify-between text-ink-3">
                <dt>Subtotal</dt>
                <dd className="tabular">{formatPos(totals.grossCents, currency)}</dd>
              </div>
              <div className="flex justify-between text-ink-3">
                <dt>Discount</dt>
                <dd className="tabular">-{formatPos(totals.discountCents, currency)}</dd>
              </div>
            </>
          ) : null}
          <div className="flex items-baseline justify-between">
            <dt className="font-medium text-[15px] text-ink">Total</dt>
            <dd className="tabular font-bold text-[24px] text-ink leading-8">
              {formatPos(totals.totalCents, currency)}
            </dd>
          </div>
        </dl>

        {orderWarnings.length > 0 || orderMarginText ? (
          <ul className="mt-1.5 flex flex-col gap-1">
            {orderWarnings.map((warning) => (
              <li key={warning} className="flex items-start gap-1.5 text-[12px] text-warning">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {warning}
              </li>
            ))}
            {orderMarginText ? (
              <li
                className={cn(
                  'flex items-start gap-1.5 text-[12px]',
                  orderMarginText.severe ? 'text-negative' : 'text-warning',
                )}
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                {orderMarginText.text}
              </li>
            ) : null}
          </ul>
        ) : null}

        <Button
          type="button"
          variant="primary"
          disabled={!canCharge}
          onClick={onCharge}
          className="mt-2.5 h-12 w-full text-[16px] max-sm:h-12"
        >
          {empty ? 'Charge' : `Charge ${formatPos(totals.totalCents, currency)}`}
        </Button>
        <p className="mt-1.5 min-h-4 text-center text-[12px] text-ink-3" aria-live="polite">
          {blocker && !empty ? blocker : chargeHint}
        </p>
      </footer>
    </>
  );
}
