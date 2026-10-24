'use client';

import { Minus, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { QuickPanel } from '@/components/catalog/quick-panel';
import { useCatalogUndo } from '@/components/catalog/use-undo';
import { useMember } from '@/components/providers/member-provider';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatMarginPercent, marginBasisPoints } from '@/lib/catalog-quality';
import { cn } from '@/lib/cn';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import { MAX_COUNTED, parseCounted } from '@/lib/stock-count';
import { setVariantPrices } from '@/server/actions/catalog-bulk';
import { submitStockCount } from '@/server/actions/stock-count';
import type { ProductVariantLite } from '@/server/queries/lists';
import type { LocationOption } from '@/server/queries/pickers';

/**
 * Edit a price or a stock count right from the list row.
 *
 * Tap the figure: on a phone a sheet opens, on a larger screen a popover, with one field per
 * variant (a single field for a one-variant product). Enter saves, Escape closes. The row shows the
 * new figure at once; if the server refuses (a rule, a conflict, a lost connection) the old figure
 * comes back and the reason is written under the field. A saved price can be undone from the toast;
 * a stock count is a ledger movement, so it is corrected by counting again.
 */

const triggerClass = cn(
  'group inline-flex min-h-11 items-center gap-1 rounded-control px-1.5 text-left sm:min-h-0 sm:px-1',
  'tabular transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
);

function tryParse(value: string): number | null {
  const text = value.trim();
  if (!/^\d+([.,]\d{0,2})?$/.test(text) && !/^\d*[.,]\d{1,2}$/.test(text)) return null;
  try {
    return parseMoney(text.replace(',', '.'));
  } catch {
    return null;
  }
}

/* ── Price ───────────────────────────────────────────────────────────────── */

export function InlinePrice({
  productName,
  variants,
  className,
  asButton,
}: {
  productName: string;
  variants: ProductVariantLite[];
  className?: string;
  /** Show a labelled button (for a toolbar) instead of the price itself. */
  asButton?: { label: React.ReactNode; className: string };
}) {
  const canEdit = useMember().role !== 'viewer';
  const router = useRouter();
  const offerUndo = useCatalogUndo();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const active = variants.filter((variant) => variant.isActive);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const current = (variant: ProductVariantLite) => overrides[variant.id] ?? variant.priceCents;
  const prices = active.map(current);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 0;

  const { execute, isPending } = useAction(setVariantPrices, {
    onSuccess({ data }) {
      if (!data) return;
      setOpen(false);
      setError(null);
      const message =
        data.changed === 0 ? 'Price unchanged.' : `Price of ${productName} changed.`;
      if (data.changed > 0) offerUndo(message, data.undo);
      router.refresh();
    },
    onError({ error: actionError, input }) {
      // Roll the row back to what it was and say why.
      setOverrides((existing) => {
        const next = { ...existing };
        for (const change of input.changes) delete next[change.variantId];
        return next;
      });
      const message =
        actionError.serverError ?? 'The price could not be saved. Check it and try again.';
      setError(message);
      toast.error(message);
    },
  });

  if (active.length === 0) return asButton ? null : <span className="text-ink-4">—</span>;

  const label = (
    <span className="inline-flex items-center gap-1">
      {active.length > 1 && low !== high ? <span className="text-ink-4">From </span> : null}
      <span className="text-ink">{formatMoney(low)}</span>
      {canEdit ? (
        <Pencil
          aria-hidden="true"
          className="size-3 text-ink-4 opacity-60 transition-opacity group-hover:opacity-100"
        />
      ) : null}
    </span>
  );

  if (!canEdit)
    return asButton ? null : <span className={cn('tabular', className)}>{label}</span>;

  const rows = active.map((variant) => {
    const text = draft[variant.id] ?? toDecimalString(current(variant));
    const parsed = tryParse(text);
    const margin =
      parsed !== null && parsed > 0 ? marginBasisPoints(parsed, variant.unitCostCents) : null;
    return { variant, text, parsed, margin };
  });
  const invalid = rows.some((row) => row.parsed === null || row.parsed <= 0);
  const changes = rows.filter(
    (row) => row.parsed !== null && row.parsed > 0 && row.parsed !== current(row.variant),
  );

  const submit = () => {
    if (invalid) {
      setError('Enter each price as an amount above zero, like 29.55.');
      return;
    }
    if (changes.length === 0) {
      setOpen(false);
      return;
    }
    setError(null);
    // Optimistic: the row shows the new figure straight away.
    setOverrides((existing) => ({
      ...existing,
      ...Object.fromEntries(changes.map((row) => [row.variant.id, row.parsed as number])),
    }));
    setOpen(false);
    execute({
      changes: changes.map((row) => ({ variantId: row.variant.id, price: row.text })),
    });
  };

  return (
    <QuickPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft({});
          setError(null);
        }
      }}
      title={`Price of ${productName}`}
      description="US$ list price. The shop and new sales use this price."
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Change price of ${productName}`}
          className={asButton ? asButton.className : cn(triggerClass, className)}
        >
          {asButton ? asButton.label : label}
        </button>
      )}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton form={formId} pending={isPending}>
            Save price
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        {rows.map((row) => (
          <div key={row.variant.id}>
            <label
              htmlFor={`${formId}-${row.variant.id}`}
              className="mb-1 block text-[12px] text-ink-3"
            >
              {active.length > 1 ? `${row.variant.name} · ${row.variant.sku}` : 'Price (US$)'}
            </label>
            <Input
              id={`${formId}-${row.variant.id}`}
              numeric
              inputMode="decimal"
              enterKeyHint="done"
              autoComplete="off"
              autoFocus={rows[0] === row}
              value={row.text}
              aria-invalid={row.parsed === null || row.parsed <= 0 ? true : undefined}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) =>
                setDraft((existing) => ({ ...existing, [row.variant.id]: event.target.value }))
              }
            />
            <p
              className={cn(
                'mt-1 text-[12px]',
                row.margin !== null && row.margin < 0 ? 'text-negative' : 'text-ink-4',
              )}
            >
              {row.variant.unitCostCents === null
                ? 'No cost known yet, so no margin.'
                : `Cost ${formatMoney(Math.round(row.variant.unitCostCents))}${
                    row.margin === null
                      ? ''
                      : row.margin < 0
                        ? ` · below cost (${formatMarginPercent(row.margin)})`
                        : ` · margin ${formatMarginPercent(row.margin)}`
                  }`}
            </p>
          </div>
        ))}
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-negative-muted px-3 py-2 text-[13px] text-negative"
          >
            {error}
          </p>
        ) : null}
      </form>
    </QuickPanel>
  );
}

/* ── Stock count ─────────────────────────────────────────────────────────── */

export function InlineStock({
  productName,
  variants,
  locations,
  className,
}: {
  productName: string;
  variants: ProductVariantLite[];
  /** Active locations. With more than one, the count is made at the chosen location. */
  locations: LocationOption[];
  className?: string;
}) {
  const canEdit = useMember().role !== 'viewer';
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [shift, setShift] = useState(0);

  const total = variants.reduce((sum, variant) => sum + variant.onHand, 0) + shift;
  const holdsMost = (variant: ProductVariantLite) =>
    [...variant.locations].sort((a, b) => b.onHand - a.onHand)[0]?.id ?? null;

  const place =
    locationId ??
    (locations.length > 0
      ? (variants.map(holdsMost).find((id) => id !== null) ?? locations[0]?.id ?? null)
      : null);
  const expectedAt = (variant: ProductVariantLite) =>
    place === null
      ? variant.onHand
      : (variant.locations.find((location) => location.id === place)?.onHand ?? 0);

  const { execute, isPending } = useAction(submitStockCount, {
    onSuccess({ data }) {
      if (!data) return;
      setOpen(false);
      setError(null);
      if (data.refused > 0) {
        setShift(0);
        const refused = data.lines.find((line) => line.outcome === 'refused');
        toast.error(refused?.message ?? 'Some counts were refused.');
      } else if (data.posted === 0) {
        setShift(0);
        toast.message('The count matched the books. Nothing to change.');
      } else {
        toast.success(
          `Counted ${productName}: ${data.netUnits > 0 ? '+' : ''}${data.netUnits} ${Math.abs(data.netUnits) === 1 ? 'unit' : 'units'}`,
          { description: 'To correct a count, count again.' },
        );
      }
      setShift(0);
      router.refresh();
    },
    onError({ error: actionError }) {
      setShift(0);
      const message = actionError.serverError ?? 'The count could not be saved. Try again.';
      setError(message);
      setOpen(true);
      toast.error(message);
    },
  });

  if (!canEdit) return <span className={cn('tabular text-ink', className)}>{total}</span>;

  const rows = variants
    .filter((variant) => variant.isActive || variant.onHand !== 0)
    .map((variant) => {
      const expected = expectedAt(variant);
      const text = draft[`${place}-${variant.id}`] ?? String(expected);
      const parsed = parseCounted(text);
      return { variant, expected, text, parsed };
    });
  const invalid = rows.some((row) => !row.parsed.ok);
  const changes = rows.filter((row) => row.parsed.ok && row.parsed.value !== row.expected);

  return (
    <QuickPanel
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setDraft({});
          setError(null);
        }
      }}
      title={`Count ${productName}`}
      description="Type how many are on the shelf. The difference is recorded as a stock count adjustment."
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Count stock of ${productName}, ${total} on hand`}
          className={cn(triggerClass, 'justify-end', className)}
        >
          <span className="text-ink">{total}</span>
          <Pencil
            aria-hidden="true"
            className="size-3 text-ink-4 opacity-60 transition-opacity group-hover:opacity-100"
          />
        </button>
      )}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton form={formId} pending={isPending} disabled={isPending}>
            {changes.length === 0 ? 'Save count' : `Save count (${changes.length})`}
          </SubmitButton>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          if (invalid) {
            setError('Enter a whole number of units, zero or more, for every line.');
            return;
          }
          if (changes.length === 0) {
            setOpen(false);
            return;
          }
          setError(null);
          setShift(
            changes.reduce(
              (sum, row) =>
                sum + ((row.parsed.ok ? row.parsed.value : row.expected) - row.expected),
              0,
            ),
          );
          setOpen(false);
          execute({
            locationId: place,
            lines: rows.map((row) => ({
              variantId: row.variant.id,
              counted: row.parsed.ok ? row.parsed.value : row.expected,
              expected: row.expected,
            })),
          });
        }}
        className="space-y-3"
      >
        {locations.length > 1 ? (
          <div>
            <label htmlFor={`${formId}-place`} className="mb-1 block text-[12px] text-ink-3">
              Counting at
            </label>
            <Select
              id={`${formId}-place`}
              value={place ?? ''}
              onChange={(event) => {
                setLocationId(event.target.value);
                setDraft({});
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {rows.map((row) => (
          <div key={row.variant.id}>
            <label
              htmlFor={`${formId}-${row.variant.id}`}
              className="mb-1 flex items-baseline justify-between gap-2 text-[12px] text-ink-3"
            >
              <span className="min-w-0 truncate">
                {variants.length > 1 ? `${row.variant.name} · ${row.variant.sku}` : 'Counted'}
              </span>
              <span className="tabular shrink-0 text-ink-4">books say {row.expected}</span>
            </label>
            <div className="flex items-center gap-1.5">
              <Stepper
                label="Fewer"
                disabled={!row.parsed.ok || row.parsed.value <= 0}
                onClick={() =>
                  setDraft((existing) => ({
                    ...existing,
                    [`${place}-${row.variant.id}`]: String(
                      Math.max(0, (row.parsed.ok ? row.parsed.value : row.expected) - 1),
                    ),
                  }))
                }
              >
                <Minus aria-hidden="true" className="size-4" />
              </Stepper>
              <Input
                id={`${formId}-${row.variant.id}`}
                numeric
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                autoFocus={rows[0] === row}
                value={row.text}
                aria-invalid={row.parsed.ok ? undefined : true}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  setDraft((existing) => ({
                    ...existing,
                    [`${place}-${row.variant.id}`]: event.target.value,
                  }))
                }
                className="text-center"
              />
              <Stepper
                label="More"
                disabled={row.parsed.ok && row.parsed.value >= MAX_COUNTED}
                onClick={() =>
                  setDraft((existing) => ({
                    ...existing,
                    [`${place}-${row.variant.id}`]: String(
                      (row.parsed.ok ? row.parsed.value : row.expected) + 1,
                    ),
                  }))
                }
              >
                <Plus aria-hidden="true" className="size-4" />
              </Stepper>
            </div>
            {row.parsed.ok && row.parsed.value !== row.expected ? (
              <p className="tabular mt-1 text-[12px] text-ink-3">
                Difference {row.parsed.value - row.expected > 0 ? '+' : ''}
                {row.parsed.value - row.expected}
              </p>
            ) : null}
          </div>
        ))}
        {error ? (
          <p
            role="alert"
            className="rounded-control bg-negative-muted px-3 py-2 text-[13px] text-negative"
          >
            {error}
          </p>
        ) : null}
      </form>
    </QuickPanel>
  );
}

function Stepper({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 shrink-0 place-items-center rounded-control border border-line bg-raised text-ink hover:bg-hover disabled:opacity-40 sm:size-9 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}
