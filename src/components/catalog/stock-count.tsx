'use client';

import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  ScanLine,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ProductThumb } from '@/components/catalog/product-thumb';
import { useMember } from '@/components/providers/member-provider';
import { ActionBar } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { SubmitButton } from '@/components/ui/submit-button';
import { cn } from '@/lib/cn';
import { formatMoney, parseMoney } from '@/lib/money';
import {
  countDifference,
  describeDifference,
  MAX_COUNTED,
  parseCounted,
  summariseCounts,
} from '@/lib/stock-count';
import { createPurchaseOrder, receivePurchaseOrder } from '@/server/actions/purchase-orders';
import { type StockCountResult, submitStockCount } from '@/server/actions/stock-count';
import type { LocationOption, Option } from '@/server/queries/pickers';
import type { CountVariant } from '@/server/queries/search';

/**
 * The phone-first stock count, and "Receive" for units that just arrived.
 *
 * COUNT: find a product (type, scan with a barcode reader, or use the camera), say how many are on the
 * shelf with the big stepper, and see at once how that differs from what the books say. Nothing is
 * posted until "Post count": then each difference becomes one ordinary adjustment movement through
 * the same rules as a single correction (never below zero; the server's own words if it refuses).
 * Products you did not count are left alone. The list is kept on this device until posted, so
 * closing the tab does not lose a count in progress.
 *
 * RECEIVE: add units at a cost. There is no way to receive stock with a cost that does not leave a
 * trail in the books, so this raises a real purchase order for exactly those lines and receives it
 * straight away (the same two actions as the purchase order screens). It can also record the
 * payment, or leave that for later.
 */

type Line = {
  variant: CountVariant;
  /** What was typed; empty means "not counted yet" and the line is left out of the count. */
  counted: string;
  /** For receive: the unit cost typed, in dollars. */
  cost: string;
};

type Draft = { locationId: string | null; mode: Mode; lines: Line[] };
type Mode = 'count' | 'receive';

const DRAFT_KEY = 'nx:stock-count:draft';

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const draft = value as Partial<Draft>;
    if (!Array.isArray(draft.lines)) return null;
    return {
      locationId: typeof draft.locationId === 'string' ? draft.locationId : null,
      mode: draft.mode === 'receive' ? 'receive' : 'count',
      lines: draft.lines.filter(
        (line): line is Line =>
          Boolean(line) &&
          typeof line.counted === 'string' &&
          typeof line.cost === 'string' &&
          typeof line.variant?.variantId === 'string',
      ),
    };
  } catch {
    return null;
  }
}

export function StockCount({
  locations,
  suppliers,
}: {
  locations: LocationOption[];
  suppliers: Option[];
}) {
  const router = useRouter();
  const { role } = useMember();
  const formId = useId();
  const canWrite = role !== 'viewer';

  const mainId =
    locations.find((location) => location.slug === 'main')?.id ?? locations[0]?.id ?? null;
  const [mode, setMode] = useState<Mode>('count');
  const [locationId, setLocationId] = useState<string | null>(mainId);
  const [lines, setLines] = useState<Line[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CountVariant[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<StockCountResult | null>(null);
  const [received, setReceived] = useState<{
    number: string;
    id: string;
    units: number;
  } | null>(null);
  const [receiveError, setReceiveError] = useState<{
    message: string;
    orderId?: string;
  } | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'card' | 'other'>('cash');
  const [note, setNote] = useState('');

  // Restore a count that was in progress on this device.
  useEffect(() => {
    const draft = readDraft();
    if (draft && draft.lines.length > 0) {
      setLines(draft.lines);
      setMode(draft.mode);
      if (draft.locationId && locations.some((location) => location.id === draft.locationId)) {
        setLocationId(draft.locationId);
      }
    }
    setHydrated(true);
  }, [locations]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (lines.length === 0) window.localStorage.removeItem(DRAFT_KEY);
      else window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ locationId, mode, lines }));
    } catch {
      // Blocked storage: the count simply is not kept between visits.
    }
  }, [hydrated, lines, locationId, mode]);

  /* ── Search ─────────────────────────────────────────────────────────── */

  const runSearch = useCallback(
    async (value: string, signal: AbortSignal): Promise<CountVariant[]> => {
      const params = new URLSearchParams({ q: value });
      if (locationId) params.set('location', locationId);
      const response = await fetch(`/api/search/variants?${params}`, { signal });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Search is unavailable. Try again.');
      }
      const body = (await response.json()) as { variants: CountVariant[] };
      return body.variants;
    },
    [locationId],
  );

  useEffect(() => {
    const value = term.trim();
    if (value.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const mine = ++searchSeq.current;
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await runSearch(value, controller.signal);
        if (mine !== searchSeq.current) return;
        setResults(found);
        setSearchError(null);
      } catch (error) {
        if (controller.signal.aborted || mine !== searchSeq.current) return;
        setSearchError(error instanceof Error ? error.message : 'Search is unavailable.');
      } finally {
        if (mine === searchSeq.current) setSearching(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, runSearch]);

  /** Add a variant to the list, or (when it is already there) count one more of it. */
  const addVariant = useCallback((variant: CountVariant, increment: boolean) => {
    setLines((current) => {
      const existing = current.find((line) => line.variant.variantId === variant.variantId);
      if (existing) {
        const rest = current.filter((line) => line !== existing);
        const parsed = parseCounted(existing.counted);
        const next =
          increment && parsed.ok
            ? String(Math.min(MAX_COUNTED, parsed.value + 1))
            : existing.counted;
        return [{ ...existing, counted: next }, ...rest];
      }
      return [
        {
          variant,
          counted: increment ? '1' : '',
          cost:
            variant.unitCostCents !== null
              ? (variant.unitCostCents / 100).toFixed(2)
              : variant.referenceCostCents > 0
                ? (variant.referenceCostCents / 100).toFixed(2)
                : '',
        },
        ...current,
      ];
    });
    setTerm('');
    setResults([]);
    inputRef.current?.focus();
  }, []);

  /** Enter on an exact SKU or barcode (a reader types the code and presses Enter) counts one. */
  const submitTerm = async () => {
    const value = term.trim();
    if (!value) return;
    const exact = results.find(
      (variant) =>
        variant.sku.toLowerCase() === value.toLowerCase() || variant.barcode === value,
    );
    if (exact) {
      addVariant(exact, mode === 'count');
      return;
    }
    if (results.length === 1 && results[0]) {
      addVariant(results[0], false);
      return;
    }
    // A reader fires faster than the debounce: look the code up now.
    try {
      const controller = new AbortController();
      const found = await runSearch(value, controller.signal);
      const match = found.find(
        (variant) =>
          variant.sku.toLowerCase() === value.toLowerCase() || variant.barcode === value,
      );
      if (match) addVariant(match, mode === 'count');
      else if (found.length === 1 && found[0]) addVariant(found[0], false);
      else setResults(found);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search is unavailable.');
    }
  };

  /* ── Count ──────────────────────────────────────────────────────────── */

  const counted = useMemo(
    () =>
      lines.flatMap((line) => {
        const parsed = parseCounted(line.counted);
        return parsed.ok
          ? [
              {
                variantId: line.variant.variantId,
                expected: line.variant.expected,
                counted: parsed.value,
              },
            ]
          : [];
      }),
    [lines],
  );
  const summary = summariseCounts(counted);
  const invalid = lines.filter(
    (line) => line.counted.trim() !== '' && !parseCounted(line.counted).ok,
  );

  const {
    execute: postCount,
    isPending: posting,
    result: countAction,
  } = useAction(submitStockCount, {
    onSuccess({ data }) {
      if (!data) return;
      setConfirming(false);
      setResult(data);
      if (data.refused === 0) setLines([]);
      else {
        // Keep only the lines the server refused, so they can be fixed and posted again.
        const refused = new Set(
          data.lines.filter((line) => line.outcome === 'refused').map((line) => line.variantId),
        );
        setLines((current) => current.filter((line) => refused.has(line.variant.variantId)));
      }
      router.refresh();
    },
  });

  const setLine = (variantId: string, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) =>
        line.variant.variantId === variantId ? { ...line, ...patch } : line,
      ),
    );
  const removeLine = (variantId: string) =>
    setLines((current) => current.filter((line) => line.variant.variantId !== variantId));

  /* ── Receive ────────────────────────────────────────────────────────── */

  const receivable = lines.map((line) => {
    const qty = parseCounted(line.counted);
    let costCents: number | null = null;
    try {
      costCents = /^\d+([.,]\d{0,2})?$/.test(line.cost.trim())
        ? parseMoney(line.cost.trim().replace(',', '.'))
        : null;
    } catch {
      costCents = null;
    }
    return { line, qty: qty.ok ? qty.value : null, costCents };
  });
  const receiveReady =
    receivable.length > 0 &&
    receivable.every((row) => (row.qty ?? 0) > 0 && row.costCents !== null);
  const receiveUnits = receivable.reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const receiveTotal = receivable.reduce(
    (sum, row) => sum + (row.qty ?? 0) * (row.costCents ?? 0),
    0,
  );

  const createPo = useAction(createPurchaseOrder);
  const receivePo = useAction(receivePurchaseOrder);
  const [receiving, setReceiving] = useState(false);

  const runReceive = async () => {
    setReceiving(true);
    setReceiveError(null);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const created = await createPo.executeAsync({
        supplierId: supplierId || null,
        orderedAt: today,
        expectedAt: '',
        reference: note || undefined,
        notes: 'Quick receive from the stock screen.',
        taxCents: '0',
        cardFeeCents: '0',
        deliveryCents: '0',
        shippingCents: '0',
        shippingTaxCents: '0',
        items: receivable.map((row) => ({
          variantId: row.line.variant.variantId,
          quantity: row.qty ?? 0,
          subtotalCents: (((row.qty ?? 0) * (row.costCents ?? 0)) / 100).toFixed(2),
        })),
      } as Parameters<typeof createPo.executeAsync>[0]);
      if (!created?.data) {
        setReceiveError({
          message: created?.serverError ?? 'The purchase order could not be created.',
        });
        return;
      }
      const done = await receivePo.executeAsync({
        id: created.data.id,
        receivedAt: today,
        postPayment: paidNow,
        paymentMethod: method,
      } as Parameters<typeof receivePo.executeAsync>[0]);
      if (!done?.data) {
        setReceiveError({
          message: `${created.data.number} was created but could not be received: ${done?.serverError ?? 'unknown problem'}.`,
          orderId: created.data.id,
        });
        return;
      }
      setReceived({ number: created.data.number, id: created.data.id, units: receiveUnits });
      setLines([]);
      setConfirming(false);
      toast.success(
        `${receiveUnits} ${receiveUnits === 1 ? 'unit' : 'units'} received on ${created.data.number}`,
      );
      router.refresh();
    } finally {
      setReceiving(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────── */

  if (!canWrite) {
    return (
      <p className="rounded-card border border-line-subtle bg-raised p-6 text-[14px] text-ink-3">
        Your account has read-only access, so it cannot count or receive stock.
      </p>
    );
  }

  const locationName = locations.find((location) => location.id === locationId)?.name ?? null;
  const done = result !== null || received !== null;

  if (done) {
    return (
      <div className="space-y-4" aria-live="polite">
        {result ? <CountResult result={result} /> : null}
        {received ? (
          <div className="rounded-card border border-line-subtle bg-raised p-5">
            <p className="flex items-center gap-2 font-medium text-[15px] text-ink">
              <Check aria-hidden="true" className="size-5 text-positive" />
              {received.units} {received.units === 1 ? 'unit' : 'units'} received
            </p>
            <p className="mt-1 text-[13px] text-ink-3">
              Recorded on purchase order {received.number}, at the cost you entered.
            </p>
            <Button asChild variant="secondary" className="mt-3">
              <Link href={`/purchase-orders/${received.id}` as Route}>
                Open {received.number}
              </Link>
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setResult(null);
              setReceived(null);
              inputRef.current?.focus();
            }}
          >
            {lines.length > 0 ? 'Fix the refused lines' : 'Start another'}
          </Button>
          <Button asChild variant="ghost">
            <Link href="/inventory">Back to inventory</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-28 md:pb-0">
      <div
        role="tablist"
        aria-label="What are you doing"
        className="grid grid-cols-2 gap-1 rounded-control bg-inset p-1"
      >
        {(['count', 'receive'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-1.5 rounded-[6px] text-[14px] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
              mode === value
                ? 'bg-raised text-ink shadow-[var(--nx-shadow-raised)]'
                : 'text-ink-3 hover:text-ink',
            )}
          >
            {value === 'count' ? (
              <ClipboardCheck aria-hidden="true" className="size-4" />
            ) : (
              <PackagePlus aria-hidden="true" className="size-4" />
            )}
            {value === 'count' ? 'Count stock' : 'Receive stock'}
          </button>
        ))}
      </div>

      {locations.length > 1 && mode === 'count' ? (
        <Field label="Counting at" htmlFor={`${formId}-place`}>
          <Select
            id={`${formId}-place`}
            value={locationId ?? ''}
            onChange={(event) => {
              setLocationId(event.target.value);
              // Expected figures belong to the place they were fetched for.
              setLines([]);
              setResults([]);
            }}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="relative">
        <label htmlFor={`${formId}-find`} className="sr-only">
          Find a product by name, SKU or barcode
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-4"
        />
        <input
          id={`${formId}-find`}
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={term}
          placeholder="Name, SKU or scan a barcode"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void submitTerm();
            }
          }}
          className="h-14 w-full rounded-card border border-line bg-raised pr-14 pl-11 text-[16px] text-ink placeholder:text-ink-4 focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        />
        <ScanButton
          onDetected={(code) => {
            setTerm(code);
            setScanning(false);
            void (async () => {
              try {
                const found = await runSearch(code, new AbortController().signal);
                const match =
                  found.find((variant) => variant.barcode === code || variant.sku === code) ??
                  (found.length === 1 ? found[0] : undefined);
                if (match) addVariant(match, mode === 'count');
                else {
                  setResults(found);
                  toast.message(
                    found.length === 0
                      ? `Nothing matches ${code}.`
                      : 'Choose the product below.',
                  );
                }
              } catch (error) {
                setSearchError(
                  error instanceof Error ? error.message : 'Search is unavailable.',
                );
              }
            })();
          }}
          scanning={scanning}
          setScanning={setScanning}
        />
      </div>

      {term.trim().length >= 2 ? (
        <div
          className="overflow-hidden rounded-card border border-line-subtle bg-raised"
          aria-live="polite"
        >
          {searching && results.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 text-[13px] text-ink-3">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Searching
            </p>
          ) : searchError ? (
            <p role="alert" className="px-4 py-4 text-[13px] text-negative">
              {searchError}
            </p>
          ) : results.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-3">
              Nothing matches &ldquo;{term.trim()}&rdquo;. Check the spelling, or try the SKU.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {results.map((variant) => (
                <li key={variant.variantId}>
                  <button
                    type="button"
                    onClick={() => addVariant(variant, false)}
                    className="flex min-h-[72px] w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <ProductThumb
                      src={variant.imageUrl}
                      name={variant.productName}
                      detail={variant.variantName}
                      size="md"
                      decorative
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">
                        {variant.productName}
                      </span>
                      <span className="tabular block truncate text-[12px] text-ink-3">
                        {variant.variantName} · {variant.sku}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-right text-[12px] text-ink-3">
                      {mode === 'count' ? (
                        <>
                          <span className="block text-ink">{variant.expected}</span>books say
                        </>
                      ) : (
                        <>
                          <span className="block text-ink">{variant.expected}</span>on hand
                        </>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {lines.length === 0 ? (
        <div className="rounded-card border border-line-subtle border-dashed bg-raised px-6 py-10 text-center">
          <p className="font-medium text-[14px] text-ink">
            {mode === 'count' ? 'Nothing counted yet' : 'Nothing to receive yet'}
          </p>
          <p className="mx-auto mt-1 max-w-[40ch] text-[13px] text-ink-3">
            {mode === 'count'
              ? 'Search for a product, or scan its barcode. Scanning counts one each time. You choose what to count: products you leave out stay exactly as they are.'
              : 'Search for a product that arrived, then enter how many and what each cost.'}
          </p>
        </div>
      ) : (
        <ul
          className="space-y-2"
          aria-label={mode === 'count' ? 'Products being counted' : 'Products being received'}
        >
          {lines.map((line) => {
            const variant = line.variant;
            const parsed = parseCounted(line.counted);
            const difference = parsed.ok
              ? countDifference(variant.expected, parsed.value)
              : null;
            return (
              <li
                key={variant.variantId}
                className="rounded-card border border-line-subtle bg-raised p-3"
              >
                <div className="flex items-start gap-3">
                  <ProductThumb
                    src={variant.imageUrl}
                    name={variant.productName}
                    detail={variant.variantName}
                    size="md"
                    decorative
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-ink">{variant.productName}</p>
                    <p className="tabular truncate text-[12px] text-ink-3">
                      {variant.variantName} · {variant.sku}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-4">
                      {mode === 'count'
                        ? `Books say ${variant.expected}`
                        : `${variant.expected} on hand now`}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${variant.productName} ${variant.variantName}`}
                    onClick={() => removeLine(variant.variantId)}
                    className="-mt-1 -mr-1 grid size-11 shrink-0 place-items-center rounded-control text-ink-4 hover:bg-hover hover:text-negative focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <BigStep
                    label="One fewer"
                    disabled={!parsed.ok || parsed.value <= 0}
                    onClick={() =>
                      setLine(variant.variantId, {
                        counted: String(Math.max(0, (parsed.ok ? parsed.value : 0) - 1)),
                      })
                    }
                  >
                    <Minus aria-hidden="true" className="size-6" />
                  </BigStep>
                  <input
                    aria-label={`${mode === 'count' ? 'Counted' : 'Received'}: ${variant.productName} ${variant.variantName}`}
                    inputMode="numeric"
                    enterKeyHint="done"
                    autoComplete="off"
                    placeholder="0"
                    value={line.counted}
                    aria-invalid={line.counted.trim() !== '' && !parsed.ok ? true : undefined}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) =>
                      setLine(variant.variantId, { counted: event.target.value })
                    }
                    className="tabular h-14 min-w-0 flex-1 rounded-card border border-line bg-base text-center text-[26px] text-ink focus-visible:border-accent-border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-[invalid=true]:border-negative"
                  />
                  <BigStep
                    label="One more"
                    disabled={parsed.ok && parsed.value >= MAX_COUNTED}
                    onClick={() =>
                      setLine(variant.variantId, {
                        counted: String(
                          Math.min(MAX_COUNTED, (parsed.ok ? parsed.value : 0) + 1),
                        ),
                      })
                    }
                  >
                    <Plus aria-hidden="true" className="size-6" />
                  </BigStep>
                </div>

                {mode === 'count' ? (
                  <p
                    aria-live="polite"
                    className={cn(
                      'mt-2 text-[13px]',
                      difference === null
                        ? 'text-ink-4'
                        : difference === 0
                          ? 'text-positive'
                          : difference > 0
                            ? 'text-info'
                            : 'text-warning',
                    )}
                  >
                    {line.counted.trim() !== '' && !parsed.ok
                      ? 'Whole units only, zero or more.'
                      : difference === null
                        ? 'Not counted yet. It is left out until you enter a number.'
                        : difference === 0
                          ? 'Matches the books.'
                          : difference > 0
                            ? `${describeDifference(difference)}: ${difference} more than the books say.`
                            : `${describeDifference(difference)}: ${-difference} fewer than the books say.`}
                  </p>
                ) : (
                  <div className="mt-3">
                    <label
                      htmlFor={`${formId}-cost-${variant.variantId}`}
                      className="mb-1 block text-[12px] text-ink-3"
                    >
                      Cost per unit (US$)
                    </label>
                    <Input
                      id={`${formId}-cost-${variant.variantId}`}
                      numeric
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.cost}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        setLine(variant.variantId, { cost: event.target.value })
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mode === 'receive' && lines.length > 0 ? (
        <div className="space-y-3 rounded-card border border-line-subtle bg-raised p-3">
          <Field label="Supplier (optional)" htmlFor={`${formId}-supplier`}>
            <Select
              id={`${formId}-supplier`}
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
            >
              <option value="">No supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Reference (optional)"
            htmlFor={`${formId}-ref`}
            hint="An invoice or delivery number"
          >
            <Input
              id={`${formId}-ref`}
              value={note}
              maxLength={100}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={paidNow}
              onChange={(event) => setPaidNow(event.target.checked)}
              className="size-5 accent-[var(--nx-accent)]"
            />
            I paid for these now
          </label>
          {paidNow ? (
            <Field label="Paid by" htmlFor={`${formId}-method`}>
              <Select
                id={`${formId}-method`}
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </Field>
          ) : (
            <p className="text-[12px] text-ink-3">
              The purchase order stays unpaid. Record the payment later from the purchase order.
            </p>
          )}
          {receiveError ? (
            <div
              role="alert"
              className="rounded-control bg-negative-muted px-3 py-2 text-[13px] text-negative"
            >
              {receiveError.message}
              {receiveError.orderId ? (
                <Link
                  href={`/purchase-orders/${receiveError.orderId}` as Route}
                  className="mt-1 block underline"
                >
                  Open the purchase order
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {lines.length > 0 ? (
        <div className="hidden items-center justify-between gap-3 rounded-card border border-line-subtle bg-raised p-4 md:flex">
          <SummaryText
            mode={mode}
            summary={summary}
            receiveUnits={receiveUnits}
            receiveTotal={receiveTotal}
            locationName={locationName}
          />
          <PostButton
            mode={mode}
            disabled={
              mode === 'count' ? summary.lines === 0 || invalid.length > 0 : !receiveReady
            }
            pending={receiving}
            onClick={() => (mode === 'count' ? setConfirming(true) : void runReceive())}
          />
        </div>
      ) : null}

      {lines.length > 0 ? (
        <ActionBar>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <SummaryText
                mode={mode}
                summary={summary}
                receiveUnits={receiveUnits}
                receiveTotal={receiveTotal}
                locationName={locationName}
                compact
              />
            </div>
            <PostButton
              mode={mode}
              disabled={
                mode === 'count' ? summary.lines === 0 || invalid.length > 0 : !receiveReady
              }
              pending={receiving}
              onClick={() => (mode === 'count' ? setConfirming(true) : void runReceive())}
            />
          </div>
        </ActionBar>
      ) : null}

      {confirming ? (
        <Sheet
          open
          onOpenChange={(open) => !open && setConfirming(false)}
          title="Post this count?"
          description={`${summary.changing} ${summary.changing === 1 ? 'product differs' : 'products differ'} from the books${locationName ? ` at ${locationName}` : ''}. Each difference is recorded as a stock count adjustment.`}
          footer={
            <>
              <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                Back
              </Button>
              <SubmitButton form={`${formId}-post`} pending={posting} disabled={posting}>
                Post count
              </SubmitButton>
            </>
          }
        >
          <form
            id={`${formId}-post`}
            onSubmit={(event) => {
              event.preventDefault();
              postCount({
                locationId,
                lines: counted,
              });
            }}
          >
            <ul className="divide-y divide-line-subtle">
              {lines
                .filter((line) => parseCounted(line.counted).ok)
                .map((line) => {
                  const parsed = parseCounted(line.counted);
                  const value = parsed.ok ? parsed.value : 0;
                  const difference = countDifference(line.variant.expected, value);
                  return (
                    <li key={line.variant.variantId} className="flex items-center gap-3 py-2">
                      <ProductThumb
                        src={line.variant.imageUrl}
                        name={line.variant.productName}
                        size="xs"
                        decorative
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                        {line.variant.productName}
                        <span className="text-ink-4"> · {line.variant.variantName}</span>
                      </span>
                      <span className="tabular shrink-0 text-[12px] text-ink-3">
                        {line.variant.expected} to {value}
                      </span>
                      <span
                        className={cn(
                          'tabular w-12 shrink-0 text-right text-[13px]',
                          difference === 0
                            ? 'text-ink-4'
                            : difference > 0
                              ? 'text-info'
                              : 'text-warning',
                        )}
                      >
                        {difference === 0 ? '—' : describeDifference(difference)}
                      </span>
                    </li>
                  );
                })}
            </ul>
            <div className="mt-3">
              <label htmlFor={`${formId}-note`} className="mb-1 block text-[12px] text-ink-3">
                Note (optional)
              </label>
              <Input
                id={`${formId}-note`}
                value={note}
                maxLength={100}
                placeholder="October stocktake"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
            {countAction.serverError ? (
              <p
                role="alert"
                className="mt-3 rounded-control bg-negative-muted px-3 py-2 text-[13px] text-negative"
              >
                {countAction.serverError}
              </p>
            ) : null}
          </form>
        </Sheet>
      ) : null}

      {lines.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Clear this list? Nothing has been posted yet.')) setLines([]);
          }}
          className="inline-flex h-11 items-center gap-1.5 rounded-control px-3 text-[13px] text-ink-3 hover:bg-hover hover:text-ink"
        >
          <X aria-hidden="true" className="size-4" /> Clear the list
        </button>
      ) : null}
    </div>
  );
}

function SummaryText({
  mode,
  summary,
  receiveUnits,
  receiveTotal,
  locationName,
  compact,
}: {
  mode: Mode;
  summary: ReturnType<typeof summariseCounts>;
  receiveUnits: number;
  receiveTotal: number;
  locationName: string | null;
  compact?: boolean;
}) {
  if (mode === 'receive') {
    return (
      <p className="text-[13px] text-ink-2">
        <span className="tabular text-ink">{receiveUnits}</span>{' '}
        {receiveUnits === 1 ? 'unit' : 'units'}
        {' · '}
        <span className="tabular text-ink">{formatMoney(receiveTotal)}</span>
        {compact ? null : ' at the costs entered'}
      </p>
    );
  }
  return (
    <p className="text-[13px] text-ink-2">
      <span className="tabular text-ink">{summary.lines}</span> counted
      {summary.changing > 0 ? (
        <>
          {' · '}
          <span className="tabular text-warning">{summary.changing}</span> differ
          {' · '}
          <span className="tabular">
            {summary.netUnits > 0 ? '+' : ''}
            {summary.netUnits}
          </span>{' '}
          net
        </>
      ) : summary.lines > 0 ? (
        ' · all match'
      ) : null}
      {!compact && locationName ? <span className="text-ink-4"> at {locationName}</span> : null}
    </p>
  );
}

function PostButton({
  mode,
  disabled,
  pending,
  onClick,
}: {
  mode: Mode;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <SubmitButton
      type="button"
      pending={pending}
      disabled={disabled || pending}
      onClick={onClick}
      size="lg"
      className="h-12 shrink-0 px-6 text-[15px] md:h-9 md:px-4 md:text-sm"
    >
      {mode === 'count' ? 'Review count' : 'Receive stock'}
    </SubmitButton>
  );
}

function BigStep({
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
      className="grid size-14 shrink-0 place-items-center rounded-card border border-line bg-raised text-ink transition-colors hover:bg-hover active:bg-active disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

function CountResult({ result }: { result: StockCountResult }) {
  return (
    <div className="space-y-3">
      <div className="rounded-card border border-line-subtle bg-raised p-5">
        <p className="flex items-center gap-2 font-medium text-[15px] text-ink">
          {result.refused === 0 ? (
            <Check aria-hidden="true" className="size-5 text-positive" />
          ) : (
            <AlertTriangle aria-hidden="true" className="size-5 text-warning" />
          )}
          {result.posted} {result.posted === 1 ? 'adjustment' : 'adjustments'} posted
          {result.unchanged > 0 ? `, ${result.unchanged} already matched` : ''}
          {result.refused > 0 ? `, ${result.refused} refused` : ''}
        </p>
        <p className="mt-1 text-[13px] text-ink-3">
          Net change {result.netUnits > 0 ? '+' : ''}
          {result.netUnits} {Math.abs(result.netUnits) === 1 ? 'unit' : 'units'}
          {result.locationName ? ` at ${result.locationName}` : ''}.
        </p>
      </div>
      <ul className="divide-y divide-line-subtle rounded-card border border-line-subtle bg-raised">
        {result.lines.map((line) => (
          <li key={line.variantId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular text-[13px] text-ink">{line.sku}</span>
              <span
                className={cn(
                  'tabular text-[13px]',
                  line.outcome === 'refused'
                    ? 'text-negative'
                    : line.delta === 0
                      ? 'text-ink-4'
                      : 'text-ink',
                )}
              >
                {line.outcome === 'refused'
                  ? 'Refused'
                  : line.delta === 0
                    ? 'No change'
                    : `${line.actual} to ${line.counted} (${describeDifference(line.delta)})`}
              </span>
            </div>
            {line.message ? (
              <p className="mt-1 text-[12px] text-negative">{line.message}</p>
            ) : null}
            {line.drifted && line.outcome === 'posted' ? (
              <p className="mt-1 text-[12px] text-warning">
                The books changed while you counted (they said {line.expected}, now{' '}
                {line.actual}). Stock was set to what you counted.
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Camera scanning, only where the browser can read barcodes (`BarcodeDetector`). */
function ScanButton({
  onDetected,
  scanning,
  setScanning,
}: {
  onDetected: (code: string) => void;
  scanning: boolean;
  setScanning: (value: boolean) => void;
}) {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    setSupported('BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia));
  }, []);
  if (!supported) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Scan a barcode with the camera"
        onClick={() => setScanning(true)}
        className="absolute top-1/2 right-1.5 grid size-11 -translate-y-1/2 place-items-center rounded-control text-ink-2 hover:bg-hover focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ScanLine aria-hidden="true" className="size-5" />
      </button>
      {scanning ? <Scanner onDetected={onDetected} onClose={() => setScanning(false)} /> : null}
    </>
  );
}

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

function Scanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The camera must not restart every time the parent re-renders with a new callback.
  const detected = useRef(onDetected);
  detected.current = onDetected;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (stopped) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const Detector = (
          window as unknown as {
            BarcodeDetector: new (options: { formats: string[] }) => BarcodeDetectorLike;
          }
        ).BarcodeDetector;
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(video);
            const code = codes[0]?.rawValue;
            if (code) {
              if ('vibrate' in navigator) navigator.vibrate(30);
              detected.current(code);
              return;
            }
          } catch {
            // A frame that cannot be read is simply skipped.
          }
          frame = window.setTimeout(tick, 250);
        };
        void tick();
      } catch {
        setError('The camera is not available. Allow camera access, or type the code instead.');
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(frame);
      if (stream) for (const track of stream.getTracks()) track.stop();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
      className="fixed inset-0 z-[70] flex flex-col bg-black"
    >
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white">
        <p className="text-[14px]">Point the camera at a barcode</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the camera"
          className="grid size-11 place-items-center rounded-control hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted className="size-full object-cover" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-card border-2 border-white/80" />
      </div>
      {error ? (
        <p role="alert" className="px-4 py-4 text-[14px] text-white">
          {error}
        </p>
      ) : null}
    </div>
  );
}
