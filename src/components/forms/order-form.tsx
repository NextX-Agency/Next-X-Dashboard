'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useAction } from 'next-safe-action/hooks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Field, FieldRow, Input, Select, Textarea } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import { createOrder } from '@/server/actions/orders';
import type { LocationOption, Option, VariantOption } from '@/server/queries/pickers';

type Line = { key: string; variantId: string; quantity: string; unitPrice: string };
type OrderSource = 'manual' | 'pos' | 'web' | 'whatsapp' | 'messenger';
type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'other';

const newLine = (): Line => ({
  key: crypto.randomUUID(),
  variantId: '',
  quantity: '1',
  unitPrice: '',
});
const today = () => new Date().toISOString().slice(0, 10);

export function OrderForm({
  variants,
  customers,
  locations,
}: {
  variants: VariantOption[];
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
  const [lines, setLines] = useState<Line[]>([newLine()]);

  const variantsById = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );
  const variantOptions: ComboboxOption[] = variants.map((variant) => ({
    value: variant.id,
    label: `${variant.productName} · ${variant.variantName}`,
    hint: variant.sku,
    meta: `${variant.onHand} on hand · ${formatMoney(variant.listPriceCents)}`,
    disabled: !variant.isActive,
  }));
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
      toast.success(`Order ${data.number} created`);
      router.push(`/orders/${data.id}` as Route);
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? 'Could not create the order');
    },
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = lines
      .filter((line) => line.variantId)
      .map((line) => ({
        variantId: line.variantId,
        quantity: line.quantity,
        unitPriceCents: line.unitPrice || '0',
      }));
    if (!locationId) return toast.error('Choose a fulfillment location');
    if (!items.length) return toast.error('Add at least one item');
    action.execute({
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
    });
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start"
    >
      <div className="space-y-4">
        <Surface>
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
                  onChange={(event) => setCurrency(event.target.value as 'USD' | 'SRD')}
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

        <Surface>
          <SurfaceHeader
            title="Items"
            hint="Prices are snapshotted when the order is created"
          />
          <div className="divide-y divide-line-subtle">
            {lines.map((line, index) => {
              const variant = variantsById.get(line.variantId);
              return (
                <div
                  key={line.key}
                  className="grid gap-2 p-4 sm:grid-cols-[1fr_84px_120px_34px]"
                >
                  <Field
                    label={index === 0 ? 'Product' : ''}
                    htmlFor={`order-variant-${line.key}`}
                  >
                    <Combobox
                      id={`order-variant-${line.key}`}
                      options={variantOptions}
                      value={line.variantId || null}
                      onChange={(value) =>
                        setLines((current) =>
                          current.map((candidate) =>
                            candidate.key === line.key
                              ? {
                                  ...candidate,
                                  variantId: value ?? '',
                                  unitPrice:
                                    value && variantsById.get(value)
                                      ? toDecimalString(
                                          variantsById.get(value)?.listPriceCents ?? 0,
                                          currency,
                                        )
                                      : candidate.unitPrice,
                                }
                              : candidate,
                          ),
                        )
                      }
                      placeholder="Choose a product"
                      searchPlaceholder="Search by name or SKU"
                    />
                  </Field>
                  <Field label={index === 0 ? 'Qty' : ''} htmlFor={`order-qty-${line.key}`}>
                    <Input
                      id={`order-qty-${line.key}`}
                      numeric
                      inputMode="numeric"
                      value={line.quantity}
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
                    label={index === 0 ? `Unit (${currency})` : ''}
                    htmlFor={`order-price-${line.key}`}
                  >
                    <Input
                      id={`order-price-${line.key}`}
                      numeric
                      inputMode="decimal"
                      value={line.unitPrice}
                      placeholder={
                        variant ? toDecimalString(variant.listPriceCents, currency) : '0.00'
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
                  <div className="flex items-end pb-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remove line"
                      disabled={lines.length === 1}
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
          <div className="border-line-subtle border-t p-4">
            <button
              type="button"
              onClick={() => setLines((current) => [...current, newLine()])}
              className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line py-2 text-[12px] text-ink-3 hover:border-line-strong hover:text-ink-2"
            >
              <Plus className="size-3.5" /> Add another item
            </button>
          </div>
        </Surface>

        <Surface>
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

        <Surface>
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

      <Surface className="xl:sticky xl:top-20">
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
          <SubmitButton pending={action.isPending} size="lg" className="w-full">
            Create draft order
          </SubmitButton>
        </div>
      </Surface>
    </form>
  );
}
