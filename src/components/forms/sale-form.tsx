'use client';

import { AlertTriangle, CircleAlert, Package, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useMember } from '@/components/providers/member-provider';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { Money, Percent } from '@/components/ui/money';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { businessDateInput } from '@/lib/business-date';
import { cn } from '@/lib/cn';
import { describeIssues } from '@/lib/form-issues';
import { fromBase, type RateMicros, toBase } from '@/lib/fx';
import { formatMoney, mulDivRound, parseMoney, toDecimalString } from '@/lib/money';
import { describeReservedConflict, reservedStockConflicts } from '@/lib/reserved-stock';
import { saleSchema } from '@/lib/schemas';
import { createCustomer } from '@/server/actions/reference';
import { createSale, updateSale } from '@/server/actions/sales';
import type {
  BundleOption,
  Option,
  SaleVariantOption,
  WalletChoice,
} from '@/server/queries/pickers';
import { LineProduct } from './line-product';
import { type PickerSelection, SaleProductPicker } from './sale-product-picker';

/**
 * Recording a sale.
 *
 * The design goal is that nobody has to leave this screen to answer a question
 * it raised. The product picker shows stock and price; the customer picker
 * creates a customer inline; and the margin panel recomputes on every
 * keystroke using exactly the arithmetic the server will use, so the number
 * shown before submitting is the number that gets stored.
 */

type Line = {
  key: string;
  variantId: string | null;
  bundleId: string | null;
  quantity: string;
  unitPrice: string;
  /** F-6: raw textarea contents — one serial per line, parsed on submit. */
  serials: string;
};

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: null,
  bundleId: null,
  quantity: '1',
  unitPrice: '',
  serials: '',
});

/** Textarea contents → the `string[]` the schema expects: trimmed, blanks
 *  dropped. Dedup happens server-side (schemas.ts) so this stays cheap. */
const parseSerials = (value: string): string[] =>
  value
    .split('\n')
    .map((serial) => serial.trim())
    .filter(Boolean);

const today = () => businessDateInput();

export type SaleFormValues = {
  id: string;
  customerId: string | null;
  sellerId: string | null;
  soldAt: string;
  currency: 'USD' | 'SRD';
  paymentMethod: string;
  notes: string;
  discount: string;
  discountReason: string;
  items: {
    variantId: string;
    bundleId?: string | null;
    quantity: string;
    unitPrice: string;
    serials: string;
  }[];
};

export function SaleForm({
  variants,
  customers,
  sellers,
  rateMicros,
  bundles = [],
  wallets = [],
  initial,
}: {
  variants: SaleVariantOption[];
  customers: Option[];
  sellers: (Option & { active: boolean })[];
  rateMicros: RateMicros;
  bundles?: BundleOption[];
  /** Active wallets, so the cashier can say where the money landed. */
  wallets?: WalletChoice[];
  /** Omit for a blank form. Editing is only ever offered for a draft — see
   *  updateSale, which refuses anything else. */
  initial?: SaleFormValues;
}) {
  const router = useRouter();
  const { role } = useMember();
  const isEdit = Boolean(initial);

  const [customerId, setCustomerId] = useState<string | null>(initial?.customerId ?? null);
  const [customerList, setCustomerList] = useState(customers);
  // A seller earns commission, so the form never picks one on a guess. With a
  // single active seller there is nothing to choose; otherwise it starts from
  // whoever was chosen last on this device, and the cashier confirms.
  const activeSellers = sellers.filter((seller) => seller.active);
  const [sellerId, setSellerId] = useState<string | null>(() => {
    if (initial) return initial.sellerId;
    return activeSellers.length === 1 ? (activeSellers[0]?.id ?? null) : null;
  });
  // Restored after hydration: reading storage during the first render would
  // make the server and client HTML disagree.
  // biome-ignore lint/correctness/useExhaustiveDependencies: restore once on mount.
  useEffect(() => {
    if (initial || activeSellers.length < 2) return;
    try {
      const remembered = window.localStorage.getItem('nextx.lastSeller');
      if (activeSellers.some((seller) => seller.id === remembered)) setSellerId(remembered);
    } catch {
      // Blocked storage: nothing to restore.
    }
  }, []);
  const [walletId, setWalletId] = useState('');
  /** Owner only: knowingly sell units that open orders have reserved. */
  const [allowReserved, setAllowReserved] = useState(false);
  /** One key per form instance: a double click or a retry cannot book twice. */
  const idempotencyKey = useRef(crypto.randomUUID());
  const [issues, setIssues] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const [soldAt, setSoldAt] = useState(initial?.soldAt ?? today());
  const [currency, setCurrency] = useState<'USD' | 'SRD'>(initial?.currency ?? 'USD');
  const [paymentMethod, setPaymentMethod] = useState(initial?.paymentMethod ?? 'cash');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [discount, setDiscount] = useState(initial?.discount ?? '');
  const [discountReason, setDiscountReason] = useState(initial?.discountReason ?? '');
  /** F-4: confirming can either take the money now (the one-click default that
   *  matches how most sales close) or put the sale on credit with an optional
   *  deposit. Only consulted when the form confirms — a draft pays nothing. */
  const [paidInFull, setPaidInFull] = useState(true);
  const [deposit, setDeposit] = useState('');
  const [lines, setLines] = useState<Line[]>(
    () =>
      initial?.items.map((item) => ({
        key: crypto.randomUUID(),
        variantId: item.variantId,
        bundleId: item.bundleId ?? null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        serials: item.serials,
      })) ?? [],
  );
  const pickerOpener = useRef<HTMLElement | null>(null);
  const openPicker = (next: NonNullable<typeof picker>) => {
    pickerOpener.current = document.activeElement as HTMLElement | null;
    setPicker(next);
  };
  /** The product browser: adding to the sale, or swapping the product on one line. */
  const [picker, setPicker] = useState<
    { mode: 'add' } | { mode: 'replace'; key: string } | null
  >(null);

  const byId = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const bundleById = useMemo(
    () => new Map(bundles.map((bundle) => [bundle.id, bundle])),
    [bundles],
  );

  /** Quantity already in the sale per variant, so the browser can show "2 in sale". */
  const inSale = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      if (!line.variantId) continue;
      map.set(
        line.variantId,
        (map.get(line.variantId) ?? 0) + (Number.parseInt(line.quantity, 10) || 0),
      );
    }
    return map;
  }, [lines]);

  /** The list price of a line in a given currency, as the input shows it. */
  function listPriceFor(line: Line, inCurrency: 'USD' | 'SRD'): string | null {
    const cents = line.bundleId
      ? bundleById.get(line.bundleId)?.priceCents
      : line.variantId
        ? byId.get(line.variantId)?.listPriceCents
        : undefined;
    if (cents === undefined) return null;
    return toDecimalString(inCurrency === 'SRD' ? fromBase(cents, rateMicros) : cents);
  }

  /**
   * Switching currency re-prices every line still at its list price. Without
   * this a USD price of 77.92 became SRD 77.92 (about US$2) and the sale
   * recorded at a loss. A price the cashier typed by hand is left alone; the
   * below-cost warning covers that case.
   */
  function changeCurrency(next: 'USD' | 'SRD') {
    if (next === currency) return;
    setLines((current) =>
      current.map((line) =>
        listPriceFor(line, currency) === line.unitPrice
          ? { ...line, unitPrice: listPriceFor(line, next) ?? line.unitPrice }
          : line,
      ),
    );
    setCurrency(next);
    setWalletId('');
  }

  function chooseSeller(next: string | null) {
    setSellerId(next);
    try {
      if (next) window.localStorage.setItem('nextx.lastSeller', next);
    } catch {
      // Private mode or blocked storage: the preference simply is not remembered.
    }
  }

  /** Fade the row out, then drop it. Reduced-motion users get an instant removal. */
  function removeLine(key: string) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setLines((current) => current.filter((candidate) => candidate.key !== key));
      return;
    }
    setLeaving((current) => new Set(current).add(key));
    window.setTimeout(() => {
      setLines((current) => current.filter((candidate) => candidate.key !== key));
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }, 160);
  }

  /** Apply one choice from the product browser. Prices default to the list price in the sale's
   *  currency, exactly as the old dropdown did; nothing about costing or posting changes here. */
  function applySelection(selection: PickerSelection) {
    const quantity = String(Math.max(1, selection.quantity));
    const target = picker?.mode === 'replace' ? picker.key : null;
    const toPrice = (cents: number) =>
      toDecimalString(currency === 'SRD' ? fromBase(cents, rateMicros) : cents);

    let patch: Pick<Line, 'variantId' | 'bundleId' | 'unitPrice'> | null = null;
    if (selection.kind === 'bundle') {
      const chosen = bundleById.get(selection.bundleId);
      const first = chosen?.components[0];
      if (!chosen || !first) return;
      patch = {
        bundleId: chosen.id,
        variantId: first.variantId,
        unitPrice: toPrice(chosen.priceCents),
      };
    } else {
      const chosen = byId.get(selection.variantId);
      if (!chosen) return;
      patch = {
        bundleId: null,
        variantId: chosen.id,
        unitPrice: toPrice(chosen.listPriceCents),
      };
    }

    setLines((current) => {
      if (target) {
        return current.map((line) =>
          line.key === target ? { ...line, ...patch, quantity, serials: '' } : line,
        );
      }
      // The same variant again adds to its line instead of repeating it.
      const same =
        !patch.bundleId &&
        current.find((line) => line.variantId === patch.variantId && !line.bundleId);
      if (same) {
        return current.map((line) =>
          line.key === same.key
            ? {
                ...line,
                quantity: String(
                  (Number.parseInt(line.quantity, 10) || 0) + Number.parseInt(quantity, 10),
                ),
              }
            : line,
        );
      }
      return [...current, { ...newLine(), ...patch, quantity }];
    });
  }

  const customerOptions: ComboboxOption[] = customerList.map((customer) => ({
    value: customer.id,
    label: customer.label,
    hint: customer.hint ?? undefined,
  }));
  const sellerOptions: ComboboxOption[] = sellers.map((seller) => ({
    value: seller.id,
    label: seller.label,
    hint: seller.hint ?? undefined,
    disabled: !seller.active,
  }));

  /**
   * Totals, computed the way the server computes them.
   *
   * Cost of goods uses `round(value x n / q)` per line — the same weighted
   * average call the posting service makes — rather than multiplying a rounded
   * unit cost, so the margin shown here does not shift by a cent on submit.
   *
   * `gross` is the sum of the lines; `revenue` is gross less the discount. The
   * discount lives on the document, never in the line prices, so the products
   * keep recording what they actually sold for.
   */
  const totals = useMemo(() => {
    let gross = 0;
    let cogs = 0;
    let units = 0;
    const shortfalls: { label: string; short: number }[] = [];

    // Carry a running position so repeated variants consume stock sequentially
    // rather than each reading the original onHand/valueCents. Without this,
    // the client margin drifts from the server when the same variant appears
    // twice and the first line exhausts the stock.
    const position = new Map(
      variants.map((v) => [v.id, { qty: v.onHand, value: v.valueCents }]),
    );

    for (const line of lines) {
      const variant = line.variantId ? byId.get(line.variantId) : undefined;
      const bundle = line.bundleId ? bundleById.get(line.bundleId) : undefined;
      if (!variant && !bundle) continue;

      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      let unitPrice = 0;
      try {
        unitPrice = parseMoney(line.unitPrice || '0');
      } catch {
        unitPrice = 0;
      }

      const lineRevenue = unitPrice * quantity;
      gross += currency === 'SRD' ? toBase(lineRevenue, rateMicros) : lineRevenue;
      units += quantity;

      const components =
        bundle?.components ??
        (variant
          ? [
              {
                variantId: variant.id,
                quantity: 1,
                productName: variant.productName,
                variantName: variant.variantName,
              },
            ]
          : []);
      for (const component of components) {
        const pos = position.get(component.variantId);
        if (!pos) continue;
        const needed = quantity * component.quantity;
        const take = Math.min(needed, Math.max(pos.qty, 0));
        const cost = take === pos.qty ? pos.value : mulDivRound(pos.value, take, pos.qty);
        cogs += cost;
        position.set(component.variantId, { qty: pos.qty - needed, value: pos.value - cost });
        if (needed > take)
          shortfalls.push({
            label: bundle?.name ?? `${component.productName} · ${component.variantName}`,
            short: needed - take,
          });
      }
    }

    let discountUsd = 0;
    try {
      const parsed = parseMoney(discount || '0');
      discountUsd = currency === 'SRD' ? toBase(parsed, rateMicros) : parsed;
    } catch {
      discountUsd = 0;
    }
    // Clamped here so the panel cannot show a negative revenue while the
    // field is mid-edit; the server's schema rejects an oversized discount.
    discountUsd = Math.min(Math.max(discountUsd, 0), gross);

    const revenue = gross - discountUsd;
    return {
      belowCost: cogs > 0 && revenue < cogs,
      gross,
      revenue,
      discount: discountUsd,
      cogs,
      profit: revenue - cogs,
      units,
      shortfalls,
    };
  }, [lines, byId, bundleById, currency, rateMicros, variants, discount]);

  /**
   * Lines that would take units reserved for open orders. Orders hold stock without moving it, so a
   * sale that sees only physical stock could sell the units an order is waiting for. Same rule the
   * server applies (src/lib/reserved-stock.ts); here it is a warning, and the server decides.
   */
  const reservedConflicts = useMemo(() => {
    const taken: { variantId: string; label: string; quantity: number }[] = [];
    for (const line of lines) {
      const quantity = Number.parseInt(line.quantity, 10);
      if (!line.variantId || !Number.isFinite(quantity) || quantity <= 0) continue;
      const bundle = line.bundleId ? bundleById.get(line.bundleId) : undefined;
      if (bundle) {
        for (const component of bundle.components) {
          taken.push({
            variantId: component.variantId,
            label: `${component.productName} · ${component.variantName}`,
            quantity: quantity * component.quantity,
          });
        }
        continue;
      }
      const variant = byId.get(line.variantId);
      if (variant) {
        taken.push({
          variantId: variant.id,
          label: `${variant.productName} · ${variant.variantName}`,
          quantity,
        });
      }
    }
    return reservedStockConflicts(
      taken,
      new Map(variants.map((v) => [v.id, { onHand: v.onHand, reserved: v.reserved }])),
    );
  }, [lines, byId, bundleById, variants]);
  const sellsReservedStock = reservedConflicts.length > 0;

  /** Native-currency total: sum of line totals less the discount, both in the
   *  sale's currency. `paidNowCents` is a payment on this number, not on the
   *  USD revenue below — the ledger receives the native amount and converts it
   *  at the rate frozen on the sale. */
  const nativeTotal = useMemo(() => {
    // (see the note above: the payable amount in the sale's own currency)
    let grossNative = 0;
    for (const line of lines) {
      if (!line.variantId) continue;
      const quantity = Number.parseInt(line.quantity, 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      let unitPrice = 0;
      try {
        unitPrice = parseMoney(line.unitPrice || '0');
      } catch {
        unitPrice = 0;
      }
      grossNative += unitPrice * quantity;
    }
    let discountNative = 0;
    try {
      discountNative = parseMoney(discount || '0');
    } catch {
      discountNative = 0;
    }
    return Math.max(0, grossNative - Math.min(discountNative, grossNative));
  }, [lines, discount]);

  let depositInput = 0;
  try {
    depositInput = parseMoney(deposit || '0');
  } catch {
    depositInput = 0;
  }
  if (!Number.isFinite(depositInput) || depositInput < 0) depositInput = 0;
  const depositCents = Math.min(depositInput, nativeTotal);

  // Two hook calls, always both — createSale and updateSale have different
  // input schemas (update adds `id`), and TypeScript cannot always assign
  // that union to useAction's single expected function type. See the
  // matching comment in forms/reference-sheets.tsx for the full reasoning.
  const createHook = useAction(createSale, {
    onSuccess({ data, input }) {
      // The route can be restored by Back with this component's state intact, so
      // the key must not outlive the submit it identified.
      idempotencyKey.current = crypto.randomUUID();
      // A draft has booked nothing: no cost of goods, no stock movement, no receipt.
      // Reporting its "gross profit" would show the whole price as profit.
      if (data?.reused) {
        toast.info(`Sale ${data.number} was already recorded`, {
          description: 'That submit was a repeat, so nothing was booked twice.',
        });
      } else if (input.confirm) {
        toast.success(`Sale ${data?.number} recorded`, {
          description: data
            ? `${formatMoney(data.totalUsdCents)} revenue · ${formatMoney(
                data.totalUsdCents - data.cogsCents,
              )} gross profit`
            : undefined,
        });
      } else {
        toast.success(`Draft ${data?.number} saved`, {
          description: 'Nothing is booked until you confirm it: no stock moved, no receipt.',
        });
      }
      router.push('/sales');
      router.refresh();
    },
    onError({ error }) {
      // A refusal rolled everything back, so the next attempt is a new
      // submission. A dropped connection could still have committed: keep the
      // key then, so a retry is recognised instead of booking twice.
      if (error.serverError || error.validationErrors) {
        idempotencyKey.current = crypto.randomUUID();
      }
      toast.error(error.serverError ?? 'Could not record the sale', {
        description: error.validationErrors
          ? 'Check the problems listed on the page.'
          : undefined,
      });
    },
  });
  const updateHook = useAction(updateSale, {
    onSuccess({ data }) {
      toast.success(`Sale ${data?.number} updated`);
      router.push(`/sales/${data?.id}` as Parameters<typeof router.push>[0]);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not update the sale', {
        description: error.validationErrors
          ? 'Check the problems listed on the page.'
          : undefined,
      });
    },
  });
  const { execute, isPending } = isEdit ? updateHook : createHook;

  const createInlineCustomer = useAction(createCustomer, {
    onSuccess({ data }) {
      if (!data) return;
      setCustomerList((current) => [
        ...current,
        { id: data.id, label: data.name, hint: data.code },
      ]);
      setCustomerId(data.id);
      toast.success(`Customer ${data.name} created`);
    },
    onError() {
      toast.error('Could not create that customer');
    },
  });

  function submit(confirm: boolean) {
    if (isPending) return;
    const items = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId as string,
        bundleId: line.bundleId,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice || '0',
        serials: parseSerials(line.serials),
      }));

    if (items.length === 0) {
      toast.error('Add at least one item');
      return;
    }

    const payload = {
      customerId,
      sellerId,
      soldAt,
      currency,
      paymentMethod: paymentMethod as 'cash',
      notes: notes || undefined,
      discountCents: discount || '0',
      discountReason: discountReason || undefined,
      walletId: walletId || null,
      confirm,
      paidInFull: !confirm || paidInFull,
      // The deposit field holds a decimal string; send it as typed so the
      // schema parses it exactly once.
      paidNowCents: confirm && !paidInFull ? toDecimalString(depositCents) : '0',
      allowReservedStock: confirm && sellsReservedStock && role === 'owner' && allowReserved,
      items,
    };

    // The same schema the server runs, before anything is sent: problems are
    // listed on the page in words instead of a toast pointing at nothing.
    const check = saleSchema.safeParse(payload);
    if (!check.success) {
      const messages = describeIssues(check.error.issues);
      setIssues(messages);
      toast.error('Fix the problems listed above the Record button', {
        description: messages[0],
      });
      return;
    }
    setIssues([]);

    // `execute` is a union of the create and update action's own function
    // types — the branch above already guarantees the right shape reaches
    // the right action.
    execute({
      ...(isEdit ? { id: initial?.id as string } : {}),
      ...payload,
      ...(isEdit ? {} : { idempotencyKey: idempotencyKey.current }),
    } as never);
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(true);
      }}
      onKeyDown={(event) => {
        // Enter inside a field used to submit the whole form: typing a quantity
        // and pressing Enter booked the sale, moved stock and posted cash.
        // Enter now moves to the next field; Ctrl or Cmd + Enter records.
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
        if (event.target.type === 'checkbox' || event.target.type === 'radio') return;
        event.preventDefault();
        if (event.ctrlKey || event.metaKey) {
          submit(true);
          return;
        }
        const fields = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
          ),
        );
        fields[fields.indexOf(event.target) + 1]?.focus();
      }}
      className="grid grid-cols-1 gap-4 pb-24 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start xl:pb-0"
    >
      {/* On a phone the products come first: the sale details are usually left as they are. */}
      <div className="flex flex-col gap-4">
        <Surface className="max-xl:order-2">
          <SurfaceHeader title="Sale" />
          <div className="space-y-3 p-4">
            <Field label="Customer" htmlFor="customer" hint="Leave empty for a walk-in">
              <Combobox
                id="customer"
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Walk-in customer"
                searchPlaceholder="Search customers"
                emptyLabel="No customers match."
                createLabel="Add customer"
                onCreate={(name) => createInlineCustomer.execute({ name })}
              />
            </Field>

            {sellers.length > 0 ? (
              <Field
                label="Sold by"
                htmlFor="seller"
                hint="Commission is fixed when the sale is confirmed"
              >
                <Combobox
                  id="seller"
                  options={sellerOptions}
                  value={sellerId}
                  onChange={chooseSeller}
                  placeholder="Select a seller"
                  searchPlaceholder="Search sellers"
                  emptyLabel="No sellers match."
                />
              </Field>
            ) : null}

            <FieldRow>
              <Field label="Date" htmlFor="soldAt" required>
                <Input
                  id="soldAt"
                  type="date"
                  value={soldAt}
                  max={today()}
                  onChange={(event) => setSoldAt(event.target.value)}
                  required
                />
              </Field>
              <Field label="Payment" htmlFor="paymentMethod">
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </FieldRow>

            <Field
              label="Currency"
              htmlFor="currency"
              hint={
                currency === 'SRD'
                  ? `Converted at ${(rateMicros / 1_000_000).toFixed(2)} SRD per USD`
                  : 'The books are kept in USD'
              }
            >
              <Select
                id="currency"
                value={currency}
                onChange={(event) => changeCurrency(event.target.value as 'USD' | 'SRD')}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="SRD">SRD — Surinamese Dollar</option>
              </Select>
            </Field>
          </div>
        </Surface>

        <Surface className="max-xl:order-1">
          <SurfaceHeader
            title="Items"
            hint="Prices default to the list price and can be overridden"
          />
          {lines.length === 0 ? (
            <div className="grid place-items-center gap-1 px-4 py-10 text-center">
              <Package aria-hidden="true" className="size-7 text-ink-4" />
              <p className="font-medium text-[14px] text-ink">No products in this sale yet</p>
              <p className="max-w-[44ch] text-[12px] text-ink-3">
                Pick products by photo. Search by name, model, brand or SKU, choose the exact
                option, and keep adding without leaving this page.
              </p>
            </div>
          ) : null}
          <div className="divide-y divide-line-subtle">
            {lines.map((line, index) => {
              const variant = line.variantId ? byId.get(line.variantId) : undefined;
              const bundle = line.bundleId ? bundleById.get(line.bundleId) : undefined;
              const quantity = Number.parseInt(line.quantity, 10) || 0;
              const oversold = bundle
                ? quantity > bundle.availability
                : variant
                  ? quantity > Math.max(variant.onHand, 0)
                  : false;

              let unitPrice = 0;
              try {
                unitPrice = parseMoney(line.unitPrice || '0');
              } catch {
                unitPrice = 0;
              }
              const lineTotal = unitPrice * quantity;

              return (
                <div
                  key={line.key}
                  className={cn(
                    'grid grid-cols-2 gap-2 p-4 sm:grid-cols-[24px_1fr_72px_100px_100px_32px]',
                    'motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:animate-in motion-safe:duration-200',
                    leaving.has(line.key) &&
                      'motion-safe:fade-out-0 motion-safe:animate-out motion-safe:duration-150 motion-safe:fill-mode-forwards',
                  )}
                >
                  <span className="hidden self-center tabular text-[12px] text-ink-4 sm:block">
                    {index + 1}
                  </span>

                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    {index === 0 ? (
                      <span className="mb-1.5 block font-medium text-[12px] text-ink-2">
                        Product
                      </span>
                    ) : null}
                    <LineProduct
                      variant={variant}
                      bundle={bundle}
                      missing={Boolean(line.variantId) && !variant && !bundle}
                      onChange={() => openPicker({ mode: 'replace', key: line.key })}
                    />
                  </div>

                  <Field label="Qty" hideLabel={index > 0} htmlFor={`qty-${index}`}>
                    <Input
                      id={`qty-${index}`}
                      numeric
                      inputMode="numeric"
                      value={line.quantity}
                      aria-invalid={oversold}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? { ...candidate, quantity: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </Field>

                  <Field
                    label={`Unit (${currency})`}
                    hideLabel={index > 0}
                    htmlFor={`price-${index}`}
                  >
                    <Input
                      id={`price-${index}`}
                      numeric
                      inputMode="decimal"
                      placeholder="0.00"
                      value={line.unitPrice}
                      onChange={(event) =>
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? { ...candidate, unitPrice: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </Field>

                  <div
                    className={cn(
                      'col-span-2 flex items-center justify-between sm:col-span-1 sm:contents',
                    )}
                  >
                    <div className={index === 0 ? 'sm:pt-0.5' : ''}>
                      <span className="tabular text-right text-[13px] text-ink-2 sm:block">
                        <span className="text-ink-4 sm:hidden">Line total </span>
                        {line.variantId && lineTotal > 0
                          ? toDecimalString(lineTotal, currency)
                          : '—'}
                      </span>
                    </div>

                    <div
                      className={cn('flex', index === 0 ? 'items-end pb-0.5' : 'items-center')}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => removeLine(line.key)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {line.variantId ? (
                    <Field
                      label="Serial numbers"
                      htmlFor={`serials-${index}`}
                      hint={`Optional — one per line, up to ${quantity || 1} for this line`}
                      className="col-span-2 sm:col-span-6"
                    >
                      <Textarea
                        id={`serials-${index}`}
                        rows={2}
                        spellCheck={false}
                        placeholder="e.g. SN-48213-X"
                        value={line.serials}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((candidate) =>
                              candidate.key === line.key
                                ? { ...candidate, serials: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </Field>
                  ) : null}

                  {oversold ? (
                    <p className="col-span-2 flex items-center gap-1.5 text-[11px] text-warning sm:col-span-6">
                      <AlertTriangle className="size-3" />
                      {bundle
                        ? `Only ${bundle.availability} complete bundle${bundle.availability === 1 ? '' : 's'} available. The sale will still record, and component shortfalls will be flagged.`
                        : `Only ${Math.max(variant?.onHand ?? 0, 0)} on hand. The sale will still record, and the shortfall will be flagged.`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-line-subtle border-t px-4 py-2.5">
            <button
              type="button"
              onClick={() => openPicker({ mode: 'add' })}
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-control py-2.5 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                lines.length === 0
                  ? 'bg-accent font-medium text-accent-ink hover:opacity-90'
                  : 'border border-dashed border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
              )}
            >
              <Plus className="size-3.5" />{' '}
              {lines.length === 0 ? 'Add product' : 'Add another product'}
            </button>
            <span className="hidden shrink-0 pl-4 tabular text-[11px] text-ink-4 sm:block">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'} · {totals.units}{' '}
              {totals.units === 1 ? 'unit' : 'units'}
            </span>
          </div>
        </Surface>

        <Surface className="max-xl:order-3">
          <SurfaceHeader title="Discount" hint="Applied to the whole sale, not a single item" />
          <div className="grid gap-3 p-4 sm:grid-cols-[160px_1fr]">
            <Field label={`Amount (${currency})`} htmlFor="discount">
              <Input
                id="discount"
                numeric
                inputMode="decimal"
                placeholder="0.00"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </Field>
            <Field
              label="Reason"
              htmlFor="discountReason"
              hint="Optional — rounded down, bundle…"
            >
              <Input
                id="discountReason"
                placeholder="Why the price came down"
                value={discountReason}
                onChange={(event) => setDiscountReason(event.target.value)}
              />
            </Field>
          </div>
        </Surface>

        <Surface className="max-xl:order-4">
          <SurfaceHeader title="Notes" />
          <div className="p-4">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering about this sale"
              aria-label="Notes"
            />
          </div>
        </Surface>
      </div>

      <Surface className="xl:sticky xl:top-20">
        <SurfaceHeader title="Margin" hint="Recomputed as you type" />
        <dl className="space-y-2 p-4">
          {currency === 'SRD' ? (
            <div className="flex items-baseline justify-between gap-3 rounded-control bg-inset px-2.5 py-2">
              <dt className="font-medium text-[13px] text-ink">Customer pays</dt>
              <dd className="tabular font-medium text-[15px] text-ink">
                {formatMoney(nativeTotal, 'SRD')}
              </dd>
            </div>
          ) : null}
          <Row label="Units" value={String(totals.units)} />
          <Row label="Subtotal" value={formatMoney(totals.gross)} />
          {totals.discount > 0 ? (
            <Row label="Discount" value={`−${formatMoney(totals.discount)}`} muted />
          ) : null}
          <Row label="Revenue" value={formatMoney(totals.revenue)} />
          <Row label="Cost of goods" value={formatMoney(totals.cogs)} muted />
          <div className="border-line-subtle border-t pt-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[13px] text-ink-2">Gross profit</dt>
              <dd>
                <Money cents={totals.profit} tone="flow" size="lg" />
              </dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <dt className="text-[12px] text-ink-4">Margin</dt>
              <dd>
                <Percent
                  value={totals.revenue === 0 ? 0 : totals.profit / totals.revenue}
                  tone="muted"
                />
              </dd>
            </div>
          </div>

          {currency === 'SRD' ? (
            <p className="border-line-subtle border-t pt-2 text-[11px] text-ink-4">
              Charged in SRD at {(rateMicros / 1_000_000).toFixed(2)}. The books record{' '}
              {formatMoney(totals.revenue)}.
            </p>
          ) : null}

          {totals.belowCost ? (
            <div
              role="alert"
              className="flex items-start gap-1.5 rounded-control border border-negative/40 bg-negative-muted p-2.5 text-[11px] text-negative"
            >
              <CircleAlert className="mt-0.5 size-3 shrink-0" />
              <span>
                This sale is below cost: you would lose {formatMoney(Math.abs(totals.profit))}.
                Check the prices and the discount.
              </span>
            </div>
          ) : totals.revenue > 0 && totals.cogs > 0 && totals.profit / totals.revenue < 0.1 ? (
            <div className="flex items-start gap-1.5 rounded-control border border-warning/40 bg-warning-muted p-2.5 text-[11px] text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span>Margin is under 10%. Is the discount intended?</span>
            </div>
          ) : null}

          {totals.shortfalls.length > 0 ? (
            <div className="rounded-control border border-warning/40 bg-warning-muted p-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="size-3 shrink-0" />
                Selling more than is in stock
              </p>
              <ul className="mt-1 space-y-0.5">
                {totals.shortfalls.map((entry) => (
                  <li key={entry.label} className="text-[11px] text-ink-3">
                    {entry.label}: {entry.short} short
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-4">
                Those units have no cost yet, so the margin above is overstated until a purchase
                order covers them.
              </p>
            </div>
          ) : null}
          {sellsReservedStock ? (
            <div
              role="alert"
              className="rounded-control border border-warning/40 bg-warning-muted p-2.5"
            >
              <p className="flex items-center gap-1.5 text-[11px] text-warning">
                <AlertTriangle className="size-3 shrink-0" />
                This uses stock reserved for open orders
              </p>
              <ul className="mt-1 space-y-0.5">
                {reservedConflicts.map((conflict) => (
                  <li key={conflict.variantId} className="text-[11px] text-ink-3">
                    {describeReservedConflict(conflict)}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-ink-4">
                Recording this sale could leave a confirmed order unable to complete.
              </p>
              {role === 'owner' ? (
                <label className="mt-2 flex items-start gap-2 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={allowReserved}
                    onChange={(event) => setAllowReserved(event.target.checked)}
                  />
                  <span>Sell reserved stock anyway</span>
                </label>
              ) : (
                <p className="mt-1.5 text-[11px] text-ink-3">
                  Only the owner can sell reserved stock. Reduce the quantity or ask the owner.
                </p>
              )}
            </div>
          ) : null}
        </dl>

        <div className="border-line-subtle border-t p-4">
          <fieldset disabled={isPending}>
            <legend className="text-[11px] text-ink-3 uppercase tracking-[0.08em]">
              Payment when confirmed
            </legend>
            <div className="mt-2 space-y-1.5">
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-control border p-2.5 text-[12px] transition-colors has-[:checked]:border-accent-border has-[:checked]:bg-accent-muted/40',
                  paidInFull ? 'border-accent-border bg-accent-muted/40' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="sale-payment-timing"
                  checked={paidInFull}
                  onChange={() => setPaidInFull(true)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-ink">Paid in full now</span>
                  <span className="block text-ink-4">
                    Posts one receipt for {formatMoney(nativeTotal, currency)} to the cash
                    ledger.
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-control border p-2.5 text-[12px] transition-colors',
                  !paidInFull ? 'border-accent-border bg-accent-muted/40' : 'border-line',
                )}
              >
                <input
                  type="radio"
                  name="sale-payment-timing"
                  checked={!paidInFull}
                  onChange={() => setPaidInFull(false)}
                  className="mt-0.5 accent-accent"
                />
                <span>
                  <span className="block text-ink">Money comes later</span>
                  <span className="block text-ink-4">
                    The sale is confirmed on credit and tracked until it is settled.
                  </span>
                </span>
              </label>
            </div>
            {wallets.some((wallet) => wallet.currency === currency) ? (
              <div className="mt-2">
                <Field
                  label="Money lands in"
                  htmlFor="sale-wallet"
                  hint="Empty picks the wallet matching the payment method"
                >
                  <Select
                    id="sale-wallet"
                    value={walletId}
                    onChange={(event) => {
                      setWalletId(event.target.value);
                      // The method follows the wallet: a transfer into the bank
                      // wallet is a bank transfer.
                      const chosen = wallets.find((wallet) => wallet.id === event.target.value);
                      if (chosen) setPaymentMethod(chosen.kind);
                    }}
                  >
                    <option value="">Automatic</option>
                    {wallets
                      .filter((wallet) => wallet.currency === currency)
                      .map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            ) : null}
            {!paidInFull ? (
              <div className="mt-2">
                <Field
                  label={`Deposit now (${currency})`}
                  htmlFor="deposit-now"
                  hint={`Balance ${formatMoney(Math.max(0, nativeTotal - depositCents), currency)} goes on credit`}
                >
                  <Input
                    id="deposit-now"
                    numeric
                    inputMode="decimal"
                    placeholder="0.00"
                    value={deposit}
                    onChange={(event) => setDeposit(event.target.value)}
                  />
                </Field>
              </div>
            ) : null}
          </fieldset>
        </div>

        <div className="flex flex-col gap-2 border-line-subtle border-t p-4">
          {issues.length > 0 ? (
            <div
              role="alert"
              className="rounded-control border border-negative/40 bg-negative-muted p-2.5 text-[12px] text-negative"
            >
              <p className="font-medium">Fix these first</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {issues.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <SubmitButton pending={isPending} size="lg" className="w-full">
            {isEdit ? 'Save and confirm' : 'Record sale'}
          </SubmitButton>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => submit(false)}
          >
            Save as draft
          </Button>
          <p className="text-[11px] text-ink-4 leading-relaxed">
            {isEdit
              ? 'Confirming moves stock, books the cost of goods and posts the receipt. Saving as a draft keeps none of that until it is confirmed.'
              : 'Recording moves stock, books the cost of goods and posts the receipt to the cash ledger. A draft does none of that until it is confirmed.'}
          </p>
        </div>
      </Surface>
      <SaleProductPicker
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null);
        }}
        mode={picker?.mode ?? 'add'}
        variants={variants}
        bundles={bundles}
        currency={currency}
        rateMicros={rateMicros}
        inSale={inSale}
        lineCount={lines.length}
        returnFocusTo={pickerOpener}
        onChoose={applySelection}
      />
    </form>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[12px] text-ink-3">{label}</dt>
      <dd className={cn('tabular text-[13px]', muted ? 'text-ink-3' : 'text-ink')}>{value}</dd>
    </div>
  );
}
