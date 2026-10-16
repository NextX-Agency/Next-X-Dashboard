import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OrderActions } from '@/components/forms/order-actions';
import { PageHeader } from '@/components/patterns/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { Surface, SurfaceHeader } from '@/components/ui/surface';
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatDate, humanise } from '@/lib/format';
import { getOrder } from '@/server/queries/documents';

export const metadata: Metadata = { title: 'Order' };

const STATUS_TONE = {
  draft: 'neutral',
  confirmed: 'info',
  ready: 'warning',
  completed: 'positive',
  cancelled: 'negative',
} as const;

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();
  const paid = order.paidCents;
  const balance = Math.max(0, order.totalCents - paid);
  return (
    <>
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <span className="tabular">{order.number}</span>
            <Badge tone={STATUS_TONE[order.orderStatus]}>{humanise(order.orderStatus)}</Badge>
          </span>
        }
        meta={order.customerName ?? 'Walk-in customer'}
        action={
          <span className="inline-flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href={'/orders' as Route}>Back</Link>
            </Button>
            <OrderActions
              id={order.id}
              number={order.number}
              status={order.orderStatus}
              totalCents={order.totalCents}
              paidCents={paid}
              currency={order.currency}
            />
          </span>
        }
      />
      <div className="space-y-4">
        <Surface>
          <SurfaceHeader title="Order summary" />
          <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
            <Field label="Ordered" value={formatDate(order.soldAt)} />
            <Field label="Source" value={humanise(order.source)} />
            <Field label="Storefront" value={order.storefrontName ?? '—'} />
            <Field label="Customer" value={order.customerName ?? 'Walk-in customer'} />
            <Field label="Currency" value={order.currency} />
            <Field
              label="Total"
              value={<Money cents={order.totalCents} currency={order.currency} size="sm" />}
            />
            <Field
              label="Paid"
              value={<Money cents={paid} currency={order.currency} size="sm" />}
            />
            <Field
              label="Balance"
              value={
                balance ? (
                  <Money cents={balance} currency={order.currency} size="sm" tone="flow" />
                ) : (
                  'Settled'
                )
              }
            />
            <Field
              label="Location"
              value={order.fulfillment?.locationId ?? order.locationId ?? '—'}
            />
          </div>
          {order.notes ? (
            <div className="border-line-subtle border-t px-4 py-3 text-[13px] text-ink-3">
              {order.notes}
            </div>
          ) : null}
        </Surface>

        <Surface>
          <SurfaceHeader
            title="Fulfillment"
            hint={order.fulfillment ? humanise(order.fulfillment.type) : undefined}
          />
          {order.fulfillment ? (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
              <Field
                label="Status"
                value={
                  <Badge
                    tone={
                      order.fulfillment.status === 'fulfilled'
                        ? 'positive'
                        : order.fulfillment.status === 'cancelled'
                          ? 'negative'
                          : 'neutral'
                    }
                  >
                    {humanise(order.fulfillment.status)}
                  </Badge>
                }
              />
              <Field
                label="Scheduled"
                value={
                  order.fulfillment.scheduledFor
                    ? formatDate(order.fulfillment.scheduledFor)
                    : '—'
                }
              />
              <Field
                label="Destination"
                value={order.fulfillment.deliveryAddress ?? 'Pickup'}
              />
              <Field label="Notes" value={order.fulfillment.notes ?? '—'} />
            </div>
          ) : (
            <p className="p-4 text-[13px] text-ink-3">No fulfillment context recorded.</p>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Items" />
          <TableWrap>
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH numeric>Qty</TH>
                  <TH numeric>Unit price</TH>
                  <TH numeric>Total</TH>
                </TR>
              </THead>
              <TBody>
                {order.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="text-ink">
                      {item.productName}
                      <span className="text-ink-4"> · {item.variantName}</span>
                    </TD>
                    <TD className="tabular text-[12px] text-ink-3">{item.sku}</TD>
                    <TD numeric className="text-ink-3">
                      {item.quantity}
                    </TD>
                    <TD numeric>
                      <Money cents={item.unitPriceCents} currency={order.currency} size="sm" />
                    </TD>
                    <TD numeric>
                      <Money
                        cents={Math.round(item.unitPriceCents * item.quantity)}
                        currency={order.currency}
                        size="sm"
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Surface>

        <Surface className="overflow-hidden">
          <SurfaceHeader title="Inventory reservations" />
          {order.reservations.length ? (
            <TableWrap>
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Variant</TH>
                    <TH>Location</TH>
                    <TH numeric>Quantity</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {order.reservations.map((reservation) => (
                    <TR key={reservation.id}>
                      <TD className="tabular text-[12px] text-ink-2">
                        {reservation.variantId}
                      </TD>
                      <TD className="tabular text-[12px] text-ink-3">
                        {reservation.locationId}
                      </TD>
                      <TD numeric>{reservation.quantity}</TD>
                      <TD>
                        <Badge
                          tone={
                            reservation.status === 'consumed'
                              ? 'positive'
                              : reservation.status === 'released'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {humanise(reservation.status)}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          ) : (
            <p className="p-4 text-[13px] text-ink-3">
              Stock is not reserved while this order is a draft.
            </p>
          )}
        </Surface>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-4 uppercase tracking-[0.06em]">{label}</p>
      <div className="mt-1 text-[13px] text-ink-2">{value}</div>
    </div>
  );
}
