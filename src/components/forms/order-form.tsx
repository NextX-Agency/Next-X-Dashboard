'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ActionBar, scrollToId } from '@/components/ui/action-bar';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { businessDateInput } from '@/lib/business-date';
import { cn } from '@/lib/cn';
import { describeIssues } from '@/lib/form-issues';
import type { RateMicros } from '@/lib/fx';
import { defaultUnitPrice } from '@/lib/line-price';
import { formatMoney, parseMoney } from '@/lib/money';
import { orderSchema } from '@/lib/schemas';
import { createOrder } from '@/server/actions/orders';
import type { LocationOption, Option, SaleVariantOption } from '@/server/queries/pickers';
import { LineProduct } from './line-product';
import { QuantityStepper } from './quantity-stepper';
import { type PickerSelection, SaleProductPicker } from './sale-product-picker';

type Line = { key: string; variantId: string; quantity: string; unitPrice: string };
type OrderSource = 'manual' | 'pos' | 'web' | 'whatsapp' | 'messenger';
type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: '',
  quantity: '1',
  unitPrice: '',
});
const today = () => businessDateInput();

export function OrderForm({
  variants,
  customers,
  locations,
  rateMicros,
}: {
  rateMicros: RateMicros;
  variants: SaleVariantOption[];
  customers: Option[];
  locations: LocationOption[];
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [orderDate, setOrderDate] = useState(today());
  const [source, setSource] = useState<OrderSource>('manual');
  const [currency, setCurrency] = useState<'USD' | 'SRD'>('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [locationId, setLocationId] = useState(locations[0]?.id ?? '');
  const [fulfillmentType, setFulfillmentType] = useState<'pickup' | 'delivery'>('pickup');
  const [scheduledFor, setScheduledFor] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [fulfillmentNotes, setFulfillmentNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  /** One key per form instance: a double click cannot create two orders. */
  const idempotencyKey = useRef(crypto.randomUUID());
  const [issues, setIssues] = useState<string[]>([]);
  const issuesRef = useRef<HTMLDivElement | null>(null);
  const [picker, setPicker] = useState<
    { mode: 'add' } | { mode: 'replace'; key: string } | null
  >(null);
  const pickerOpener = useRef<HTMLElement | null>(null);
  const openPicker = (next: NonNullable<typeof picker>) => {
    pickerOpener.current = document.activeElement as HTMLElement | null;
    setPicker(next);
  };

  const variantsById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const inOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of lines) {
      if (line.variantId) {
        map.set(
          line.variantId,
          (map.get(line.variantId) ?? 0) + (Number.parseInt(line.quantity, 10) || 0),
        );
      }
    }
    return map;
  }, [lines]);

  /** One choice from the product browser: list price in the order's currency, as before. */
  function applySelection(selection: PickerSelection) {
    if (selection.kind !== 'variant') return;
    const chosen = variantsById.get(selection.variantId);
    if (!chosen) return;
    const quantity = String(Math.max(1, selection.quantity));
    const target = picker?.mode === 'replace' ? picker.key : null;
    // The list price is in USD; an SRD order starts from it converted at the current rate.
    const unitPrice = defaultUnitPrice(chosen.listPriceCents, currency, rateMicros);
    setLines((current) => {
      if (target) {
        return current.map((line) =>
          line.key === target ? { ...line, variantId: chosen.id, quantity, unitPrice } : line,
        );
      }
      const same = current.find((line) => line.variantId === chosen.id);
      if (same) {
        return current.map((line) =>
          line.key === same.key
            ? {
                ...line,
                quantity: String((Number.parseInt(line.quantity, 10) || 0) + Number(quantity)),
              }
            : line,
        );
      }
      return [...current, { ...newLine(), variantId: chosen.id, quantity, unitPrice }];
    });
  }
  /** Re-price lines still at their list price; a USD 77.92 must not become SRD 77.92. */
  function changeCurrency(next: 'USD' | 'SRD') {
    if (next === currency) return;
    setLines((current) =>
      current.map((line) => {
        const variant = variantsById.get(line.variantId);
        if (!variant) return line;
        return line.unitPrice === defaultUnitPrice(variant.listPriceCents, currency, rateMicros)
          ? { ...line, unitPrice: defaultUnitPrice(variant.listPriceCents, next, rateMicros) }
          : line;
      }),
    );
    setCurrency(next);
  }
  const customerOptions: ComboboxOption[] = customers.map((customer) => ({
    value: customer.id,
    label: customer.label,
    hint: customer.hint ?? undefined,
  }));
  const total = lines.reduce((sum, line) => {
    const quantity = Number.parseInt(line.quantity, 10) || 0;
    try {
      return sum + quantity * parseMoney(line.unitPrice || '0');
    } catch {
      return sum;
    }
  }, 0);

  const action = useAction(createOrder, {
    onSuccess({ data }) {
      if (!data) return;
      // The route can be restored by Back with this state intact; the key must
      // not outlive the submit it identified.
      idempotencyKey.current = crypto.randomUUID();
      toast.success(
        data.reused
          ? `Order ${data.number} was already created`
          : `Order ${data.number} created`,
      );
      router.push(`/orders/${data.id}` as Route);
      router.refresh();
    },
    onError({ error }) {
      // A refusal rolled everything back, so the next attempt is a new
      // submission. A dropped connection may have committed: keep the key then.
      if (error.serverError || error.validationErrors) {
        idempotencyKey.current = crypto.randomUUID();
      }
      toast.error(error.serverError ?? 'Could not create the order');
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action.isPending) return;
    const items = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice || '0',
      }));
    if (!locationId) return toast.error('Choose a fulfillment location');
    if (!items.length) return toast.error('Add at least one item');
    const payload = {
      customerId,
      source,
      orderDate,
      currency,
      paymentMethod,
      locationId,
      fulfillmentType,
      scheduledFor: scheduledFor || undefined,
      deliveryAddress:
        fulfillmentType === 'delivery' ? deliveryAddress || undefined : undefined,
      fulfillmentNotes: fulfillmentNotes || undefined,
      notes: notes || undefined,
      items,
    };
    const check = orderSchema.safeParse(payload);
    if (!check.success) {
      const messages = describeIssues(check.error.issues);
      setIssues(messages);
      toast.error('Fix the problems listed on the page', { description: messages[0] });
      requestAnimationFrame(() => {
        issuesRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }
    setIssues([]);
    action.execute({ ...payload, idempotencyKey: idempotencyKey.current });
  }

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-1 gap-3 pb-28 md:gap-4 md:pb-0 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start"
    >
      {issues.length > 0 ? (
        <div
          ref={issuesRef}
          role="alert"
          className="rounded-control border border-negative/40 bg-negative-muted p-3 text-[13px] text-negative md:hidden"
        >
          <p className="font-medium">Fix these first</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {issues.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 md:gap-4">
        <Surface className="max-md:order-1">
          <SurfaceHeader title="Order details" />
          <div className="space-y-3 p-4">
            <Field label="Customer" htmlFor="order-customer" hint="Leave empty for a walk-in">
              <Combobox
                id="order-customer"
                options={customerOptions}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Walk-in customer"
                searchPlaceholder="Search customers"
                emptyLabel="No customers match."
              />
            </Field>
            <FieldRow>
              <Field label="Order date" htmlFor="order-date" required>
                <Input
                  id="order-date"
                  type="date"
                  value={orderDate}
                  max={today()}
                  onChange={(event) => setOrderDate(event.target.value)}
                  required
                />
              </Field>
              <Field label="Source" htmlFor="order-source">
                <Select
                  id="order-source"
                  value={source}
                  onChange={(event) => setSource(event.target.value as OrderSource)}
                >
                  <option value="manual">Manual</option>
                  <option value="pos">POS</option>
                  <option value="web">Web</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="messenger">Messenger</option>
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Currency" htmlFor="order-currency">
                <Select
                  id="order-currency"
                  value={currency}
                  onChange={(event) => changeCurrency(event.target.value as 'USD' | 'SRD')}
                >
                  <option value="USD">USD</option>
                  <option value="SRD">SRD</option>
                </Select>
              </Field>
              <Field label="Payment method" htmlFor="order-payment">
                <Select
                  id="order-payment"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                >
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </Select>
              </Field>
            </FieldRow>
          </div>
        </Surface>

        <Surface className="max-md:-order-1">
          <SurfaceHeader
            title="Items"
            hint="Prices are snapshotted when the order is created"
          />
          {lines.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink-3 md:hidden">
              No products yet. Pick them by photo.
            </p>
          ) : null}
          <div className="divide-y divide-line-subtle">
            {lines.map((line, index) => {
              const variant = variantsById.get(line.variantId);
              return (
                <div
                  key={line.key}
                  className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2 p-3 sm:grid-cols-[1fr_84px_120px_34px] sm:gap-2 sm:p-4"
                >
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    {index === 0 ? (
                      <span className="mb-1.5 block font-medium text-[12px] text-ink-2 max-sm:hidden">
                        Product
                      </span>
                    ) : null}
                    <LineProduct
                      variant={variant}
                      bundle={undefined}
                      missing={Boolean(line.variantId) && !variant}
                      onChange={() => openPicker({ mode: 'replace', key: line.key })}
                    />
                  </div>
                  <Field
                    label="Qty"
                    labelClassName={index > 0 ? 'sm:sr-only' : undefined}
                    htmlFor={`order-qty-${index}`}
                  >
                    <QuantityStepper
                      id={`order-qty-${index}`}
                      value={line.quantity}
                      onChange={(next) =>
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? { ...candidate, quantity: next }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field
                    label={`Unit (${currency})`}
                    labelClassName={index > 0 ? 'sm:sr-only' : undefined}
                    htmlFor={`order-price-${index}`}
                  >
                    <Input
                      id={`order-price-${index}`}
                      numeric
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      value={line.unitPrice}
                      placeholder={
                        variant
                          ? defaultUnitPrice(variant.listPriceCents, currency, rateMicros)
                          : '0.00'
                      }
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
                  <div className="col-span-2 flex justify-end sm:col-span-1 sm:items-end sm:pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove line"
                      onClick={() =>
                        setLines((current) =>
                          current.filter((candidate) => candidate.key !== line.key),
                        )
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-line-subtle border-t p-3 sm:p-4">
            <button
              type="button"
              onClick={() => openPicker({ mode: 'add' })}
              className={cn(
                'flex min-h-12 w-full items-center justify-center gap-1.5 rounded-control py-2 text-[15px] sm:min-h-0 sm:text-[12px]',
                lines.length === 0
                  ? 'bg-accent font-medium text-accent-ink sm:border sm:border-dashed sm:border-line sm:bg-transparent sm:font-normal sm:text-ink-3 sm:hover:border-line-strong sm:hover:text-ink-2'
                  : 'border border-dashed border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
              )}
            >
              <Plus className="size-3.5" />{' '}
              {lines.length === 0 ? 'Add product' : 'Add another product'}
            </button>
          </div>
        </Surface>

        <Surface className="max-md:order-2">
          <SurfaceHeader title="Fulfillment" />
          <div className="space-y-3 p-4">
            <FieldRow>
              <Field label="Type" htmlFor="fulfillment-type">
                <Select
                  id="fulfillment-type"
                  value={fulfillmentType}
                  onChange={(event) =>
                    setFulfillmentType(event.target.value as 'pickup' | 'delivery')
                  }
                >
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </Select>
              </Field>
              <Field label="Location" htmlFor="fulfillment-location" required>
                <Select
                  id="fulfillment-location"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value)}
                  required
                >
                  <option value="">Choose location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </FieldRow>
            <FieldRow>
              <Field label="Scheduled for" htmlFor="scheduled-for">
                <Input
                  id="scheduled-for"
                  type="date"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </Field>
              {fulfillmentType === 'delivery' ? (
                <Field label="Destination" htmlFor="delivery-address" required>
                  <Input
                    id="delivery-address"
                    value={deliveryAddress}
                    onChange={(event) => setDeliveryAddress(event.target.value)}
                    required
                  />
                </Field>
              ) : (
                <div />
              )}
            </FieldRow>
            <Field label="Fulfillment notes" htmlFor="fulfillment-notes">
              <Textarea
                id="fulfillment-notes"
                value={fulfillmentNotes}
                onChange={(event) => setFulfillmentNotes(event.target.value)}
                placeholder="Pickup or delivery context"
              />
            </Field>
          </div>
        </Surface>

        <Surface className="max-md:order-3">
          <SurfaceHeader title="Notes" />
          <div className="p-4">
            <Textarea
              aria-label="Order notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything worth remembering about this order"
            />
          </div>
        </Surface>
      </div>

      <Surface id="order-summary" className="scroll-mt-16 xl:sticky xl:top-20">
        <SurfaceHeader title="Order total" />
        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-3">Total</span>
            <span className="tabular text-xl font-medium text-ink">
              {formatMoney(total, currency)}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-ink-4">
            Saving creates a draft. Confirming later checks and reserves stock.
          </p>
        </div>
        <div className="border-line-subtle border-t p-4">
          {issues.length > 0 ? (
            <div
              role="alert"
              className="mb-3 rounded-control border border-negative/40 bg-negative-muted p-2.5 text-[12px] text-negative max-md:hidden"
            >
              <p className="font-medium">Fix these first</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {issues.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <SubmitButton pending={action.isPending} size="lg" className="w-full max-md:hidden">
            Create draft order
          </SubmitButton>
          <p className="text-[12px] text-ink-3 md:hidden">
            Saving creates a draft. Confirming later checks and reserves stock.
          </p>
        </div>
      </Surface>
      <ActionBar>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            aria-label="Choose products"
            onClick={() => openPicker({ mode: 'add' })}
            className="size-12 shrink-0 p-0 max-sm:size-12"
          >
            <Plus className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => scrollToId('order-summary')}
            aria-label="Show order summary"
            className="min-h-11 min-w-[6.5rem] flex-1 rounded-control py-0.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="block truncate text-[11px] text-ink-3 leading-tight">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'} · order total
            </span>
            <span className="tabular block truncate font-semibold text-[18px] text-ink leading-tight">
              {formatMoney(total, currency)}
            </span>
          </button>
          <SubmitButton
            pending={action.isPending}
            size="lg"
            className="h-12 shrink-0 px-5 text-[15px]"
          >
            Create draft
          </SubmitButton>
        </div>
      </ActionBar>
      <SaleProductPicker
        open={picker !== null}
        onOpenChange={(next) => {
          if (!next) setPicker(null);
        }}
        mode={picker?.mode ?? 'add'}
        variants={variants}
        bundles={[]}
        currency={currency}
        rateMicros={rateMicros}
        inSale={inOrder}
        lineCount={lines.length}
        returnFocusTo={pickerOpener}
        onChoose={applySelection}
      />
    </form>
  );
}
